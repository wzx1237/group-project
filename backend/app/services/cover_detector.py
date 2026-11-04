"""Find cover pages by matching printed regions against a reference cover page.

Standalone: depends only on OpenCV, NumPy and PyMuPDF (no web framework, no OCR).
The reference page (a PNG next to the template) and the regions to compare come
from a small JSON template, see data/templates/quiz-1.json.
"""

import json
from pathlib import Path

import cv2
import numpy as np
import pymupdf

RENDER_WIDTH = 1200
SEARCH_MARGIN = 0.04  # extra search area around each region, as a fraction of the page
SCALES = (0.94, 0.97, 1.0, 1.03, 1.06)
ANGLES = (-2.0, -1.0, 0.0, 1.0, 2.0)


def render_page(page: pymupdf.Page, width: int = RENDER_WIDTH) -> np.ndarray:
    """Render a page to grayscale at a fixed width, whatever the scan DPI."""
    zoom = width / page.rect.width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), colorspace=pymupdf.csGRAY, alpha=False)
    return np.frombuffer(pix.samples, dtype=np.uint8).reshape(pix.height, pix.width).copy()


def _ink(image: np.ndarray) -> np.ndarray:
    """Dark marks only: subtract the image from its blurred background to drop shadows."""
    gray = image.astype(np.float32)
    return np.maximum(cv2.GaussianBlur(gray, (0, 0), 7) - gray, 0)


def _resize(image: np.ndarray) -> np.ndarray:
    return cv2.resize(image, (RENDER_WIDTH, round(image.shape[0] * RENDER_WIDTH / image.shape[1])),
                      interpolation=cv2.INTER_AREA)


class CoverDetector:
    def __init__(self, reference: np.ndarray, regions: list[tuple[float, float, float, float]],
                 threshold: float = 0.55):
        """regions are (x0, y0, x1, y1) fractions of the page holding printed, non-handwritten content."""
        self.threshold = threshold
        self.regions = regions
        ink = _ink(_resize(reference))
        height, width = ink.shape
        self.templates = [ink[int(y0 * height):int(y1 * height), int(x0 * width):int(x1 * width)]
                          for x0, y0, x1, y1 in regions]
        if any(t.size == 0 or float(t.std()) < 1 for t in self.templates):
            raise ValueError("Reference page has no printed detail in a template region")

    @classmethod
    def from_template(cls, path: str | Path, threshold: float = 0.55) -> "CoverDetector":
        path = Path(path)
        spec = json.loads(path.read_text())
        if "reference_image" in spec:
            reference = cv2.imread(str(path.parent / spec["reference_image"]), cv2.IMREAD_GRAYSCALE)
            if reference is None:
                raise FileNotFoundError(f"Reference image not found: {spec['reference_image']}")
        else:
            with pymupdf.open(path.parent / spec["reference_pdf"]) as document:
                reference = render_page(document[spec["reference_page_index"]])
        return cls(reference, [tuple(a["rect"]) for a in spec["anchors"]], threshold)

    def score(self, image: np.ndarray) -> float:
        """Visual similarity to the reference cover (about 0 to 1). Every region must match."""
        image = _resize(image)
        height, width = image.shape
        best = -1.0
        for angle in ANGLES:
            rotation = cv2.getRotationMatrix2D((width / 2, height / 2), angle, 1)
            ink = _ink(cv2.warpAffine(image, rotation, (width, height), borderValue=255))
            for scale in SCALES:
                worst = 1.0
                for (x0, y0, x1, y1), template in zip(self.regions, self.templates):
                    left, right = int(max(0, x0 - SEARCH_MARGIN) * width), int(min(1, x1 + SEARCH_MARGIN) * width)
                    top, bottom = int(max(0, y0 - SEARCH_MARGIN) * height), int(min(1, y1 + SEARCH_MARGIN) * height)
                    search = ink[top:bottom, left:right]
                    scaled = cv2.resize(template, None, fx=scale, fy=scale)
                    if scaled.shape[0] > search.shape[0] or scaled.shape[1] > search.shape[1]:
                        return -1.0
                    result = cv2.matchTemplate(search, scaled, cv2.TM_CCOEFF_NORMED)
                    worst = min(worst, float(result.max()))
                best = max(best, worst)
        return best

    def detect_pdf(self, path: str | Path) -> list[dict]:
        """One entry per page, in order: {"page": 1-based number, "score": float, "is_cover": bool}."""
        pages = []
        with pymupdf.open(path) as document:
            for index, page in enumerate(document):
                score = self.score(render_page(page))
                pages.append({"page": index + 1, "score": round(score, 3), "is_cover": score >= self.threshold})
        return pages

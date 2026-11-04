"""Read the handwritten nine-box UID on an exam's cover page, locally.

Standalone (OpenCV, NumPy, PyMuPDF). Uses a small pretrained ONNX character model
that knows digits, letters and "blank", so letters and empty boxes are flagged
rather than forced into digits. Nothing is downloaded and nothing leaves the machine.
A read UID is only a candidate: matching it to a roster is done elsewhere.
"""

import hashlib
from pathlib import Path

import cv2
import numpy as np
import pymupdf

MODEL_SHA256 = "8275b7a63cd740ab524b5eec49be3214e60b7c204cf88a01b377fb2a93f885ad"
CLASSES = tuple("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ") + ("blank",)
BOXES = 9


class UIDReader:
    def __init__(self, model_path: str | Path, uid_region: tuple[float, float, float, float],
                 min_confidence: float = 0.60, min_margin: float = 0.20):
        """uid_region is (x0, y0, x1, y1) as fractions of the cover page, around the nine boxes."""
        model_path = Path(model_path)
        if hashlib.sha256(model_path.read_bytes()).hexdigest() != MODEL_SHA256:
            raise ValueError("Unexpected UID model file")
        self.net = cv2.dnn.readNetFromONNX(str(model_path))
        self.uid_region = uid_region
        self.min_confidence = min_confidence
        self.min_margin = min_margin

    def read_batch(self, items: list[tuple[str | Path, str | Path | None]]) -> list[dict]:
        """items: (pdf path, optional path to save the UID crop as PNG). Reads page 1 of each PDF.

        Returns one dict per item: read (9 chars, "?" where unknown), confidences,
        status (legible | blank | unclear | not_numeric), uid (9 digits only if legible), detail.
        """
        prepared, images, where = [], [], []
        for index, (pdf_path, crop_path) in enumerate(items):
            try:
                characters = self._prepare(pdf_path, crop_path)
                prepared.append((characters, None))
                for box, character in enumerate(characters):
                    if character is not None:
                        images.append(character)
                        where.append((index, box))
            except (ValueError, RuntimeError, OSError, cv2.error) as error:
                prepared.append(([None] * BOXES, str(error)))

        predictions = [[None] * BOXES for _ in items]
        for (index, box), prediction in zip(where, self._predict(images)):
            predictions[index][box] = prediction

        return [self._summarize(predictions[i], prepared[i][1]) for i in range(len(items))]

    def _predict(self, images: list[np.ndarray]) -> list[dict]:
        if not images:
            return []
        self.net.setInput(np.stack(images).astype(np.float32)[:, None] / 127.5 - 1)
        logits = self.net.forward().reshape(len(images), len(CLASSES))
        probabilities = np.exp(logits - logits.max(axis=1, keepdims=True))
        probabilities /= probabilities.sum(axis=1, keepdims=True)
        results = []
        for row in probabilities:
            top = np.argsort(row)[::-1]
            results.append({"character": CLASSES[top[0]], "confidence": float(row[top[0]]),
                            "margin": float(row[top[0]] - row[top[1]])})
        return results

    def _summarize(self, predictions: list, failure: str | None) -> dict:
        read = "".join("?" if p is None or p["character"] == "blank" else p["character"] for p in predictions)
        confidences = [None if p is None else round(p["confidence"], 3) for p in predictions]
        blanks = read.count("?")
        if failure:
            status, detail = "unclear", failure
        elif blanks == BOXES:
            status, detail = "blank", "All nine boxes are empty"
        elif blanks:
            status, detail = "unclear", "Some boxes are empty"
        elif not read.isdigit():
            status, detail = "not_numeric", "UID contains letters"
        elif any(p["confidence"] < self.min_confidence or p["margin"] < self.min_margin for p in predictions):
            status, detail = "unclear", "Some digits are not clear enough to trust"
        else:
            status, detail = "legible", None
        return {"read": read, "confidences": confidences, "status": status, "detail": detail,
                "uid": read if status == "legible" else None}

    def _prepare(self, pdf_path, crop_path) -> list[np.ndarray | None]:
        """Locate the nine-box row on page 1 and return one 64x64 white-on-black image per box (None if empty)."""
        with pymupdf.open(pdf_path) as pdf:
            page = pdf[0]
            bounds = page.rect
            x0, y0, x1, y1 = self.uid_region
            clip = pymupdf.Rect(x0 * bounds.width, y0 * bounds.height, x1 * bounds.width, y1 * bounds.height)
            scale = 3500 / bounds.width  # bound the cost whatever the scan's physical size
            pix = page.get_pixmap(matrix=pymupdf.Matrix(scale, scale), clip=clip, colorspace=pymupdf.csGRAY, alpha=False)
            image = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width).copy()
        if crop_path:
            cv2.imwrite(str(crop_path), cv2.resize(image, None, fx=0.35, fy=0.35, interpolation=cv2.INTER_AREA))

        _, binary = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        candidates = []
        for contour in contours:  # the nine-box row is wide and short
            _, _, width, height = cv2.boundingRect(contour)
            if width > 0.65 * image.shape[1] and 5 < width / max(height, 1) < 12:
                quad = cv2.approxPolyDP(contour, 0.02 * cv2.arcLength(contour, True), True)
                if len(quad) == 4 and cv2.isContourConvex(quad):
                    candidates.append((cv2.contourArea(contour), quad.reshape(4, 2).astype(np.float32)))
        if not candidates:
            raise ValueError("Could not find the nine-box UID grid")
        quad = max(candidates, key=lambda c: c[0])[1]
        sums, diffs = quad.sum(1), quad[:, 1] - quad[:, 0]
        quad = np.array([quad[sums.argmin()], quad[diffs.argmin()], quad[sums.argmax()], quad[diffs.argmax()]])
        if len(np.unique(quad, axis=0)) != 4:
            raise ValueError("Ambiguous UID grid corners")

        transform = cv2.getPerspectiveTransform(quad, np.float32([[0, 0], [719, 0], [719, 89], [0, 89]]))
        row = cv2.warpPerspective(image, transform, (720, 90), borderValue=255)
        _, mask = cv2.threshold(row, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        vertical = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((45, 1), np.uint8)).sum(axis=0)
        dividers = []
        for index in range(BOXES + 1):
            left, right = max(0, index * 80 - 15), min(720, index * 80 + 16)
            position = left + int(np.argmax(vertical[left:right]))
            if vertical[position] < 255 * 40:
                raise ValueError("Could not find all UID box dividers")
            dividers.append(position)
        if any(not 55 <= gap <= 105 for gap in np.diff(dividers)):
            raise ValueError("UID boxes are unevenly spaced")

        characters = []
        for index in range(BOXES):
            cell = row[9:-9, dividers[index] + 6:dividers[index + 1] - 6]  # drop the printed border
            _, ink = cv2.threshold(cell, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            ink[cell > min(235, float(np.percentile(cell, 95)) - 18)] = 0  # faint scan noise is not ink
            count, labels, stats, _ = cv2.connectedComponentsWithStats(ink)
            for component in range(1, count):
                x, _, width, _, area = stats[component]
                if area < 15 or (width <= 3 and (x == 0 or x + width == ink.shape[1])):
                    ink[labels == component] = 0
            ys, xs = np.where(ink > 0)
            if len(xs) < 30:
                characters.append(None)
                continue
            glyph = ink[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
            ratio = 72 / max(glyph.shape)
            glyph = cv2.resize(glyph, (max(1, round(glyph.shape[1] * ratio)), max(1, round(glyph.shape[0] * ratio))))
            canvas = np.zeros((96, 96), np.uint8)
            top, left = (96 - glyph.shape[0]) // 2, (96 - glyph.shape[1]) // 2
            canvas[top:top + glyph.shape[0], left:left + glyph.shape[1]] = glyph
            characters.append(cv2.resize(canvas, (64, 64)))
        return characters

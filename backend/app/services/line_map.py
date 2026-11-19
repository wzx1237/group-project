"""Handwriting-free map of a page's printed lines, and cover anchors derived from it.

Standalone (OpenCV, NumPy). Morphological opening with a long horizontal / vertical kernel keeps only
long straight strokes (rules, table and box borders) and drops text and handwriting, so the map looks
the same on a blank exam and on a filled-in scan. Anchors are the page areas where horizontal and
vertical lines meet most densely, away from the areas students write in.
"""

import cv2
import numpy as np

H_KERNEL = 0.06        # shortest horizontal line kept, as a fraction of page width
V_KERNEL = 0.04        # shortest vertical line kept, as a fraction of page height
WINDOW = (0.25, 0.10)  # anchor size (width, height) as fractions of the page
MIN_SCORE = 0.004      # below this a window has too little line structure to anchor on


def line_map(gray: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    """(horizontal, vertical) binary masks of the long straight lines in a grayscale page."""
    height, width = gray.shape
    _, ink = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    horizontal = cv2.morphologyEx(ink, cv2.MORPH_OPEN,
                                  cv2.getStructuringElement(cv2.MORPH_RECT, (max(3, round(H_KERNEL * width)), 1)))
    vertical = cv2.morphologyEx(ink, cv2.MORPH_OPEN,
                                cv2.getStructuringElement(cv2.MORPH_RECT, (1, max(3, round(V_KERNEL * height)))))
    return horizontal, vertical


def line_features(gray: np.ndarray) -> np.ndarray:
    """The line map as a slightly blurred float image, for template matching that ignores handwriting."""
    horizontal, vertical = line_map(gray)
    return cv2.GaussianBlur(np.maximum(horizontal, vertical).astype(np.float32), (0, 0), 2)


def _overlaps(a, b) -> bool:
    return a[0] < b[2] and b[0] < a[2] and a[1] < b[3] and b[1] < a[3]


def derive_anchors(gray: np.ndarray, exclude: list[tuple[float, float, float, float]] = (),
                   count: int = 2) -> list[dict]:
    """Up to `count` non-overlapping anchors [{"name", "rect"}] (rect = x0, y0, x1, y1 page fractions).

    exclude: page-fraction rects where students write (UID box, ID panel); anchors never touch them.
    Raises ValueError when the page has fewer than two areas with enough line structure.
    """
    height, width = gray.shape
    horizontal, vertical = line_map(gray)
    h_sum = cv2.integral((horizontal > 0).astype(np.uint8))
    v_sum = cv2.integral((vertical > 0).astype(np.uint8))
    win_w, win_h = round(WINDOW[0] * width), round(WINDOW[1] * height)
    step_x, step_y = max(1, win_w // 4), max(1, win_h // 4)
    area = win_w * win_h

    def covered(table, x, y):
        return int(table[y + win_h, x + win_w] - table[y, x + win_w] - table[y + win_h, x] + table[y, x])

    scored = []
    for y in range(0, height - win_h + 1, step_y):
        for x in range(0, width - win_w + 1, step_x):
            # A corner or crossing needs both directions; the geometric mean is 0 unless both are present.
            score = float(np.sqrt(covered(h_sum, x, y) / area * covered(v_sum, x, y) / area))
            if score >= MIN_SCORE:
                scored.append((score, (x / width, y / height, (x + win_w) / width, (y + win_h) / height)))

    chosen = []
    for _, rect in sorted(scored, key=lambda s: -s[0]):
        if len(chosen) == count:
            break
        if not any(_overlaps(rect, other) for other in [*exclude, *chosen]):
            chosen.append(rect)
    if len(chosen) < 2:
        raise ValueError("The blank exam's first page has too few printed lines to recognise its cover pages by")
    return [{"name": f"line_anchor_{i}", "rect": [round(v, 4) for v in rect]} for i, rect in enumerate(chosen, 1)]

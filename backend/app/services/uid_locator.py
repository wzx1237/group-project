"""Find the nine-box UID grid in a grayscale image.

Standalone (OpenCV, NumPy). Two grid styles are supported:
  - a joined row: one outline around all nine boxes sharing their dividers;
  - nine separate squares of similar size sitting side by side in a row.
Either way the grid is described by its outer width / height ratio (`aspect`), which is stored
with the template, so the caller never needs fixed assumptions about how big the grid is on the page.
"""

import cv2
import numpy as np

BOXES = 9
DEFAULT_ASPECT = 8.0       # outer width / height of the grid (the straightened row is 720x90)
ASPECT_TOLERANCE = 0.40    # accepted relative deviation from the stored aspect
MIN_BOX_PIXELS = 8         # a box smaller than this is noise, not a UID box
SQUARE_RATIO = (0.75, 1.33)  # width / height of a single square box
SQUARE_SIZE_SPREAD = 0.25    # how much the nine squares may differ in side length
SQUARE_SPACING = (0.95, 2.0)  # centre-to-centre distance in side lengths (touching up to a wide gap)
HOLE_GROWTH = 0.06           # how far a grid found from box insides is grown to take in its lines, in box heights


def locate_grid(image: np.ndarray, aspect: float = DEFAULT_ASPECT, tolerance: float = ASPECT_TOLERANCE) -> np.ndarray:
    """Return the grid's four outer corners as float32 (top-left, top-right, bottom-right, bottom-left).

    image: 8-bit grayscale. Raises ValueError if no grid with the given aspect is found.
    """
    _, binary = cv2.threshold(image, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    # Outer boundaries at any nesting depth (the grid may sit inside a panel border); holes are skipped.
    contours, hierarchy = cv2.findContours(binary, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    outer = [c for c, h in zip(contours, hierarchy[0]) if h[3] == -1] if hierarchy is not None else []
    quads = [q for q in (_convex_quad(c) for c in outer) if q is not None]

    candidates = []  # (area, quad, already known to be nine boxes)
    for quad in quads:
        if _has_aspect(quad, aspect, tolerance) and _wide_enough(quad):
            candidates.append((cv2.contourArea(quad), quad, False))
    row = _separate_squares(quads)
    if row is None:
        # Boxes whose lines join a surrounding panel border have no outline of their own: the panel is one outer
        # contour and each box is only a hole in it. Nine square holes in a row are the boxes' insides, so grow
        # them out to cover the printed lines, which the reader looks for at the grid's edges.
        holes = [c for c, h in zip(contours, hierarchy[0]) if h[3] != -1] if hierarchy is not None else []
        row = _separate_squares([q for q in (_convex_quad(c) for c in holes) if q is not None])
        if row is not None:
            row = _grow(row, HOLE_GROWTH * (row[3][1] - row[0][1]))
    if row is not None and _has_aspect(row, aspect, tolerance):
        candidates.append((cv2.contourArea(row), row, True))
    # Biggest first; an outline that isn't nine equal boxes (a panel, an answer box) is passed over.
    for _, quad, verified in sorted(candidates, key=lambda c: -c[0]):
        if verified or _has_dividers(image, _order(quad)):
            break
    else:
        raise ValueError("Could not find the nine-box UID grid")
    quad = _order(quad)
    if len(np.unique(quad, axis=0)) != 4:
        raise ValueError("Ambiguous UID grid corners")
    return quad


def _has_dividers(image: np.ndarray, quad: np.ndarray) -> bool:
    """Whether the outline holds nine equal boxes: ten vertical lines about 1/9 of its width apart."""
    transform = cv2.getPerspectiveTransform(quad, np.float32([[0, 0], [719, 0], [719, 89], [0, 89]]))
    row = cv2.warpPerspective(image, transform, (720, 90), borderValue=255)
    _, mask = cv2.threshold(row, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
    vertical = cv2.morphologyEx(mask, cv2.MORPH_OPEN, np.ones((45, 1), np.uint8)).sum(axis=0)
    for index in range(BOXES + 1):
        left, right = max(0, index * 80 - 15), min(720, index * 80 + 16)
        if vertical[left:right].max() < 255 * 40:
            return False
    return True


def _convex_quad(contour) -> np.ndarray | None:
    quad = cv2.approxPolyDP(contour, 0.02 * cv2.arcLength(contour, True), True)
    if len(quad) == 4 and cv2.isContourConvex(quad):
        return quad.reshape(4, 2).astype(np.float32)
    return None


def _grow(quad: np.ndarray, amount: float) -> np.ndarray:
    """An ordered quad (top-left, top-right, bottom-right, bottom-left) moved `amount` pixels outward on every side."""
    return (quad + np.float32([[-1, -1], [1, -1], [1, 1], [-1, 1]]) * amount).astype(np.float32)


def _order(quad: np.ndarray) -> np.ndarray:
    sums, diffs = quad.sum(1), quad[:, 1] - quad[:, 0]
    return np.array([quad[sums.argmin()], quad[diffs.argmin()], quad[sums.argmax()], quad[diffs.argmax()]])


def _has_aspect(quad: np.ndarray, aspect: float, tolerance: float) -> bool:
    _, _, width, height = cv2.boundingRect(quad)
    return abs(width / max(height, 1) / aspect - 1) <= tolerance


def _wide_enough(quad: np.ndarray) -> bool:
    _, _, width, _ = cv2.boundingRect(quad)
    return width >= BOXES * MIN_BOX_PIXELS


def _separate_squares(quads: list[np.ndarray]) -> np.ndarray | None:
    """Outer corners of the biggest group of nine similar squares lying side by side, else None."""
    squares = []
    for quad in quads:
        x, y, width, height = cv2.boundingRect(quad)
        if width >= MIN_BOX_PIXELS and SQUARE_RATIO[0] <= width / max(height, 1) <= SQUARE_RATIO[1]:
            squares.append((_order(quad), np.sqrt(cv2.contourArea(quad)), x + width / 2, y + height / 2))

    best = None
    for _, side, _, cy in squares:
        group = [s for s in squares if abs(s[1] / side - 1) <= SQUARE_SIZE_SPREAD and abs(s[3] - cy) <= 0.5 * side]
        if len(group) != BOXES:
            continue
        group.sort(key=lambda s: s[2])
        steps = np.diff([s[2] for s in group]) / side
        if not all(SQUARE_SPACING[0] <= step <= SQUARE_SPACING[1] for step in steps):
            continue
        first, last = group[0][0], group[-1][0]
        outer = np.array([first[0], last[1], last[2], first[3]], np.float32)
        if best is None or cv2.contourArea(outer) > cv2.contourArea(best):
            best = outer
    return best

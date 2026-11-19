"""Exam files saved during exam setup. The blank exam also becomes the exam's cover template,
which is how uploaded scans are split into one exam per student."""

import base64
import json
import re
import shutil

import cv2
import numpy as np
import pymupdf

from app import config, store, template_spec
from app.processing import TEMPLATE_DIR
from app.services.cover_detector import CoverDetector, render_page
from app.services.line_map import derive_anchors, line_map
from app.services.uid_locator import locate_grid
from app.slugs import SLUG_PATTERN


def _relative(path) -> str:
    return path.relative_to(store.DATA_DIR).as_posix()


def _padded(rect, dx: float, dy: float) -> list[float]:
    return [max(0.0, rect[0] - dx), max(0.0, rect[1] - dy), min(1.0, rect[2] + dx), min(1.0, rect[3] + dy)]


def parse_cover_layout(raw) -> tuple[str, list[float] | None]:
    """Validate the instructor's {"mode", "rect"} (a JSON string or dict). Raises ValueError saying what's wrong."""
    try:
        layout = json.loads(raw) if isinstance(raw, (str, bytes)) else raw
    except json.JSONDecodeError:
        raise ValueError("cover_layout must be JSON like {\"mode\": \"uid_box\", \"rect\": [x0, y0, x1, y1]}")
    if not isinstance(layout, dict) or layout.get("mode") not in template_spec.MODES:
        raise ValueError(f"cover_layout.mode must be one of {list(template_spec.MODES)}")
    rect = layout.get("rect")
    if layout["mode"] == "full_page":
        if rect is not None:
            raise ValueError("cover_layout.rect must be left out in full_page mode")
        return "full_page", None
    ok = (isinstance(rect, list) and len(rect) == 4 and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in rect)
          and 0 <= rect[0] < rect[2] <= 1 and 0 <= rect[1] < rect[3] <= 1)
    if not ok or (rect[2] - rect[0] < 0.02 or rect[3] - rect[1] < 0.005):
        raise ValueError("cover_layout.rect must be [x0, y0, x1, y1] as fractions of the page, large enough to hold the UID boxes")
    return "uid_box", [float(v) for v in rect]


def _locate_on_blank(page: pymupdf.Page, rect):
    """(grid's bounding rect as page fractions, outer width / height) for the nine-box grid inside rect on the
    blank page, or None if there isn't one."""
    width, height = page.rect.width, page.rect.height
    clip = pymupdf.Rect(rect[0] * width, rect[1] * height, rect[2] * width, rect[3] * height)
    zoom = 2000 / width
    pix = page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, colorspace=pymupdf.csGRAY, alpha=False)
    crop = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width)
    try:
        quad = locate_grid(crop, tolerance=1.0)  # the grid itself sets the real shape
    except ValueError:
        return None
    (x0, y0), (x1, y1) = quad.min(axis=0), quad.max(axis=0)
    found = [(rect[0] * width + x0 / zoom) / width, (rect[1] * height + y0 / zoom) / height,
             (rect[0] * width + x1 / zoom) / width, (rect[1] * height + y1 / zoom) / height]
    tl, tr, _, bl = quad
    return [float(v) for v in found], float(np.linalg.norm(tr - tl) / max(np.linalg.norm(bl - tl), 1))


SNAP_SEARCH = 0.25  # how far beyond the dragged rect to look for the grid, as a fraction of the rect's size
SNAP_MARGIN = 0.004  # room kept around the grid in the snapped rect, as a fraction of the page


PANEL_MAX_AREA = 0.35    # a bordered panel bigger than this share of the page is a page frame, not the ID panel
PANEL_MAX_HEIGHT = 0.45  # likewise for its height, as a share of the page height
PANEL_GAP = 0.015        # breaks in a panel's border up to this share of the page width are closed
PANEL_FILL = 0.85       # a panel's outline encloses at least this share of its bounding box (it is about rectangular)
PANEL_MARGIN = 0.008    # room kept around the panel's border in the Assign image, as a fraction of the page
GRID_MARGIN = (0.06, 0.04)  # the Assign image when the grid has no panel: the grid plus this much (x, y) of the page


def _enclosing_panel(cover: np.ndarray, grid) -> list[float] | None:
    """The smallest printed rectangle around the UID grid (the cover's identification panel, which usually also
    holds the name and other fields), as page fractions with a little margin; None if the grid has no such border."""
    height, width = cover.shape
    gx0, gy0, gx1, gy1 = grid[0] * width, grid[1] * height, grid[2] * width, grid[3] * height
    grid_area = (gx1 - gx0) * (gy1 - gy0)
    # Only long printed lines (no text to merge with), with short breaks in a border closed: panels are often
    # drawn as sections whose side lines don't quite meet.
    horizontal, vertical = line_map(cover)
    gap = max(3, round(PANEL_GAP * width))
    lines = cv2.morphologyEx(np.maximum(horizontal, vertical), cv2.MORPH_CLOSE, np.ones((gap, gap), np.uint8))
    contours, _ = cv2.findContours(lines, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    best = None
    for contour in contours:
        x, y, w, h = cv2.boundingRect(contour)
        # The grid may share the panel's border (its last box on the panel's edge), so touching counts as inside.
        if not (x <= gx0 + 3 and y <= gy0 + 3 and x + w >= gx1 - 3 and y + h >= gy1 - 3):
            continue  # doesn't surround the grid
        if w * h < 1.5 * grid_area or w * h > PANEL_MAX_AREA * width * height or h > PANEL_MAX_HEIGHT * height:
            continue  # the grid's own outline, or a frame around most of the page
        if cv2.contourArea(contour) < PANEL_FILL * w * h:
            continue  # not a rectangular border (a panel's outline may have small steps, so corners aren't counted)
        if best is None or w * h < best[2] * best[3]:
            best = (x, y, w, h)
    if best is None:
        return None
    x, y, w, h = best
    return _padded([x / width, y / height, (x + w) / width, (y + h) / height], PANEL_MARGIN, PANEL_MARGIN)


def _id_panel(cover: np.ndarray, grid, mode: str, previous: dict | None) -> list[float]:
    """What the Assign dialog shows of each cover: the area with the UID, name and other identification fields.

    The course's original cover keeps its hand-tuned panel, and so does a pre-version-2 template whose UID box is
    unchanged. Otherwise it is the bordered panel around the grid; failing that, the grid with some margin (drawn box),
    or the whole page (cover sheet, where the name may be anywhere)."""
    def near(rect):
        return all(abs(a - b) < 0.02 for a, b in zip(_padded(grid, SNAP_MARGIN, SNAP_MARGIN), rect))

    default = config.load()["cover_layout"]
    if near(default["uid_region"]):
        return list(default["id_panel"])
    if previous and previous["version"] == 1 and previous["id_panel"] and near(previous["uid_box"]["rect"]):
        return list(previous["id_panel"])
    panel = _enclosing_panel(cover, grid)
    if panel:
        return panel
    return _padded(grid, *GRID_MARGIN) if mode == "uid_box" else list(template_spec.FULL_PAGE)


def analyze_blank_exam(pdf: bytes, mode: str, rect, previous: dict | None = None) -> dict:
    """Check a blank exam against the instructor's UID box and work out its cover template.

    Returns {"mode", "uid_rect" (snapped to the grid; None in full_page mode), "grid" (where the grid is),
    "aspect", "anchors", "id_panel"}. Raises ValueError saying what to fix.
    """
    try:
        document = pymupdf.open(stream=pdf, filetype="pdf")
        page = document[0]
        cover = render_page(page)
    except Exception:
        raise ValueError("The blank exam couldn't be read as a PDF")
    with document:
        if mode == "uid_box":  # snap the dragged rect to the nine-box grid just inside or around it
            search = _padded(rect, SNAP_SEARCH * (rect[2] - rect[0]), SNAP_SEARCH * (rect[3] - rect[1]))
            where = "inside the rectangle you drew"
        else:
            search, where = (0.0, 0.0, 1.0, 1.0), "on the first page"
        located = _locate_on_blank(page, search)
        if located is None:
            raise ValueError(f"Couldn't find the nine-box UID grid {where}. "
                             + ("Draw the rectangle around the nine boxes." if mode == "uid_box"
                                else "Check that the first page is the cover with the UID boxes."))
        grid, aspect = located
        uid_rect = _padded(grid, SNAP_MARGIN, SNAP_MARGIN) if mode == "uid_box" else None

        id_panel = _id_panel(cover, grid, mode, previous)
        try:
            # Anchors come from the page's printed lines, away from where students write.
            keep_clear = [_padded(grid, 0.02, 0.02) if mode == "uid_box" else _padded(grid, 0.30, 0.08)]
            if id_panel != list(template_spec.FULL_PAGE):
                keep_clear.append(id_panel)
            try:
                anchors = derive_anchors(cover, [tuple(r) for r in keep_clear])
            except ValueError:
                # A mostly-text page (e.g. a worksheet) may have no printed lines but its ID panel. The panel's border
                # is printed and the line map ignores handwriting, so anchor on it, clear of the UID grid only.
                anchors = derive_anchors(cover, [tuple(_padded(grid, 0.02, 0.02))])
            detector = CoverDetector(cover, [tuple(a["rect"]) for a in anchors], lines=True)
        except ValueError:
            raise ValueError(
                "The blank exam's first page doesn't have enough printed lines (rules, boxes or tables) to recognise "
                "its cover pages by, so scans couldn't be split into one exam per student. "
                "Check that its first page is the cover."
            )
        # Self-test: only page 1 may look like a cover, or scans would be split in the middle of an exam.
        threshold = config.load()["cover_threshold"]
        repeats = [n for n, later in enumerate(document, 1) if n > 1 and detector.score(render_page(later)) >= threshold]
    if repeats:
        pages = ", ".join(map(str, repeats[:5])) + (" and more" if len(repeats) > 5 else "")
        raise ValueError(
            f"The blank exam's cover (its UID box and the printed lines around it) repeats on "
            f"{'page' if len(repeats) == 1 else 'pages'} {pages}, so scans would be split in the middle of an exam. "
            "Only the first page may contain the UID box; remove it from the other pages."
        )
    return {"mode": mode, "uid_rect": uid_rect, "grid": grid, "aspect": aspect, "anchors": anchors, "id_panel": id_panel}


def preview_cover_layout(pdf: bytes, mode: str, rect) -> dict:
    """Stateless preview of the instructor's UID box: {"mode", "rect" (where the grid is, snapped), "aspect",
    "preview_png" (page 1 with the drawn rect in red and the snapped one in green, as a base64 data URL),
    "errors"}. Nothing is saved."""
    try:
        plan, errors = analyze_blank_exam(pdf, mode, rect), []
    except ValueError as error:
        plan, errors = None, [str(error)]
    png = None
    try:
        with pymupdf.open(stream=pdf, filetype="pdf") as document:
            page = render_page(document[0], 800)
    except Exception:
        page = None
    if page is not None:
        image = cv2.cvtColor(page, cv2.COLOR_GRAY2BGR)
        height, width = page.shape

        def draw(box, color):
            cv2.rectangle(image, (round(box[0] * width), round(box[1] * height)),
                          (round(box[2] * width), round(box[3] * height)), color, 2)

        if rect:
            draw(rect, (0, 0, 220))
        if plan:
            draw(plan["uid_rect"] or plan["grid"], (0, 160, 0))
        png = "data:image/png;base64," + base64.b64encode(cv2.imencode(".png", image)[1].tobytes()).decode()
    return {"mode": mode, "rect": (plan["uid_rect"] or plan["grid"]) if plan else None,
            "aspect": plan["aspect"] if plan else None, "preview_png": png, "errors": errors}


def save_blank_exam(assignment_id: str, pdf: bytes, mode: str | None = None, uid_rect=None) -> str:
    """Save the blank exam and the (version 2) cover template made from its first page. Returns its path under data/.

    mode / uid_rect: the instructor's UID box (see template_spec); the rect is snapped to the grid. Left out, they come
    from the exam's current template, or from the course's default layout for a new exam. A template saved before
    version 2 is upgraded.
    """
    json_path = TEMPLATE_DIR / f"{assignment_id}.json"
    pdf_path = TEMPLATE_DIR / f"{assignment_id}.pdf"
    previous = template_spec.load(json_path) if json_path.exists() else None
    mode = mode or (previous["mode"] if previous else "uid_box")
    if mode not in template_spec.MODES:
        raise ValueError(f"mode must be one of {list(template_spec.MODES)}")
    if mode == "uid_box":
        uid_rect = uid_rect or (previous["uid_box"]["rect"] if previous else None) or config.load()["cover_layout"]["uid_region"]
    plan = analyze_blank_exam(pdf, mode, uid_rect, previous)

    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(pdf)
    uid_image = None
    json_path.with_name(f"{assignment_id}_uid.png").unlink(missing_ok=True)
    if plan["uid_rect"]:  # what the UID box looks like blank, for finding it again on scans
        uid_image = f"{assignment_id}_uid.png"
        with pymupdf.open(stream=pdf, filetype="pdf") as document:
            page = document[0]
            r = plan["uid_rect"]
            clip = pymupdf.Rect(r[0] * page.rect.width, r[1] * page.rect.height, r[2] * page.rect.width, r[3] * page.rect.height)
            zoom = 2000 / page.rect.width
            page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, colorspace=pymupdf.csGRAY,
                            alpha=False).save(TEMPLATE_DIR / uid_image)
    spec = template_spec.build(reference_pdf=pdf_path.name, mode=mode, uid_rect=plan["uid_rect"], layout="joined",
                               aspect=plan["aspect"], uid_template_image=uid_image, anchors=plan["anchors"],
                               id_panel=plan["id_panel"])
    json_path.write_text(json.dumps(spec, indent=2))
    return _relative(pdf_path)


def save_answer_key(assignment_id: str, pdf: bytes) -> str:
    path = TEMPLATE_DIR / f"{assignment_id}_answer_key.pdf"
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_bytes(pdf)
    return _relative(path)


def delete_files(assignment_id: str) -> None:
    """Remove everything saved on disk for an assignment: blank exam, cover template, answer key, uploaded
    scans and the exams split from them."""
    if not re.match(SLUG_PATTERN, assignment_id):
        return
    for name in (f"{assignment_id}.json", f"{assignment_id}.pdf", f"{assignment_id}_uid.png",
                 f"{assignment_id}_answer_key.pdf"):
        (TEMPLATE_DIR / name).unlink(missing_ok=True)
    shutil.rmtree(store.UPLOAD_DIR / assignment_id, ignore_errors=True)
    shutil.rmtree(store.SUBMISSION_DIR / assignment_id, ignore_errors=True)

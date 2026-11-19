"""The cover template JSON saved next to an assignment's blank exam (data/templates/<assignment>.json).

Version 2 (written today):
    {"version": 2,
     "mode": "uid_box" | "full_page",       # uid_box: instructor marked the box; full_page: find it anywhere
     "reference_pdf": "<id>.pdf", "reference_page_index": 0,
     "uid_box": {"rect": [x0, y0, x1, y1] | null,   # page fractions; null in full_page mode
                 "layout": "joined" | "separate",   # one outlined row, or nine separate squares
                 "aspect": 8.0},                    # the nine-box grid's outer width / height
     "uid_template_image": "<id>_uid.png" | null,   # crop of the box from the blank exam
     "anchors": [{"name", "rect"}],                 # derived from the blank's line map (services/line_map.py)
     "id_panel": [x0, y0, x1, y1]}                  # identification area shown when assigning by hand

Version 1 (no "version" key; assignments created before v2) has `uid_region` where v2 has `uid_box`, and its
anchors are compared by ink rather than by line map. `load` reads both and always returns the v2 shape;
`version` keeps the stored value so callers can tell them apart.
"""

import json
from pathlib import Path

from app.services.uid_locator import DEFAULT_ASPECT

VERSION = 2
MODES = ("uid_box", "full_page")
LAYOUTS = ("joined", "separate")
FULL_PAGE = (0.0, 0.0, 1.0, 1.0)


def load(path: str | Path) -> dict:
    """Read a template (v1 or v2) and return it in the v2 shape. Raises ValueError if it is malformed."""
    spec = json.loads(Path(path).read_text())
    version = spec.get("version", 1)
    if version == 1:
        spec = {**spec, "version": 1, "mode": "uid_box", "uid_template_image": None,
                "uid_box": {"rect": spec["uid_region"], "layout": "joined", "aspect": DEFAULT_ASPECT}}
    elif version == VERSION:
        _validate(spec)
    else:
        raise ValueError(f"Unsupported cover template version: {version}")
    return spec


SCAN_MARGIN = (0.01, 0.3)  # extra search room on scans: page widths left/right, and box heights above/below


def uid_region(spec: dict) -> tuple[float, float, float, float]:
    """Where to look for the UID grid on a scan: the snapped box plus room for the scan being shifted or skewed
    (a crop that clips the grid can't be read), or the whole page in full_page mode. v1 rects already include room."""
    rect = spec["uid_box"]["rect"]
    if not rect:
        return FULL_PAGE
    if spec["version"] == 1:
        return tuple(rect)
    dx, dy = SCAN_MARGIN[0], SCAN_MARGIN[1] * (rect[3] - rect[1])
    return (max(0.0, rect[0] - dx), max(0.0, rect[1] - dy), min(1.0, rect[2] + dx), min(1.0, rect[3] + dy))


def build(*, reference_pdf: str, mode: str, uid_rect, layout: str, aspect: float, uid_template_image,
          anchors: list[dict], id_panel) -> dict:
    spec = {
        "version": VERSION,
        "mode": mode,
        "reference_pdf": reference_pdf,
        "reference_page_index": 0,
        "uid_box": {"rect": list(uid_rect) if uid_rect else None, "layout": layout, "aspect": round(aspect, 3)},
        "uid_template_image": uid_template_image,
        "anchors": anchors,
        "id_panel": list(id_panel),
    }
    _validate(spec)
    return spec


def _validate(spec: dict) -> None:
    box = spec.get("uid_box") or {}
    if spec.get("mode") not in MODES:
        raise ValueError(f"Cover template mode must be one of {MODES}")
    if box.get("layout") not in LAYOUTS:
        raise ValueError(f"Cover template uid_box.layout must be one of {LAYOUTS}")
    if not isinstance(box.get("aspect"), (int, float)) or box["aspect"] <= 0:
        raise ValueError("Cover template uid_box.aspect must be a positive number")
    rect = box.get("rect")
    if (spec["mode"] == "uid_box") != (rect is not None):
        raise ValueError("Cover template uid_box.rect is required in uid_box mode and must be null in full_page mode")
    if rect is not None and not (len(rect) == 4 and 0 <= rect[0] < rect[2] <= 1 and 0 <= rect[1] < rect[3] <= 1):
        raise ValueError("Cover template uid_box.rect must be [x0, y0, x1, y1] as fractions of the page")
    if not spec.get("anchors"):
        raise ValueError("Cover template has no anchors")

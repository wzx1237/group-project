"""Settings from data/config.json (or the file named by GRADEFLOW_CONFIG).

The file is read on every call, so edits apply to the next request without a restart.
Only `course` and `assignments` are required; every other setting falls back to DEFAULTS.
"""

import json
import os
from pathlib import Path


class ConfigError(Exception):
    """The config file is missing or invalid; the message says what to fix."""


DATA_DIR = Path(os.environ.get("GRADEFLOW_DATA_DIR", Path(__file__).resolve().parents[2] / "data"))
CONFIG_PATH = Path(os.environ.get("GRADEFLOW_CONFIG", DATA_DIR / "config.json"))

# Relative paths are resolved against DATA_DIR.
DEFAULTS = {
    "rosters": {
        "students": "rosters/class-roster-source.csv",
        "staff": "rosters/class-roster-ta-source.csv",
    },
    "uid_model": "models/uid/alphanumeric_model.onnx",
    "max_upload_mb": 200,
    "cover_threshold": 0.55,
    "uid_min_confidence": 0.60,
    "uid_min_margin": 0.20,
    "suggestion_min_digits": 6,
    # Where the course's cover sheet prints its heading and ID labels (anchors), where students write their UID,
    # and the ID panel shown when assigning by hand. Fractions of the first page: [x0, y0, x1, y1].
    # A blank exam uploaded in exam setup gets a cover template with these boxes on its own first page.
    "cover_layout": {
        "anchors": [
            {"name": "heading", "rect": [0.39, 0.05, 0.61, 0.073]},
            {"name": "identification_labels", "rect": [0.084, 0.106, 0.208, 0.193]},
        ],
        "uid_region": [0.215, 0.103, 0.445, 0.137],
        "id_panel": [0.075, 0.095, 0.93, 0.203],
    },
}

ASSIGNMENT_FIELDS = ("id", "kind", "title", "short", "due")


def load() -> dict:
    if not CONFIG_PATH.exists():
        raise ConfigError(f"Config file not found: {CONFIG_PATH}")
    try:
        loaded = json.loads(CONFIG_PATH.read_text())
    except json.JSONDecodeError as error:
        raise ConfigError(f"{CONFIG_PATH.name} is not valid JSON: {error}") from error

    for key in ("course", "assignments"):
        if key not in loaded:
            raise ConfigError(f"{CONFIG_PATH.name} is missing '{key}'")
    ids = [a.get("id") for a in loaded["assignments"]]
    if len(set(ids)) != len(ids):
        raise ConfigError(f"{CONFIG_PATH.name} has duplicate assignment ids")
    for assignment in loaded["assignments"]:
        missing = [f for f in ASSIGNMENT_FIELDS if f not in assignment]
        if missing:
            raise ConfigError(f"Assignment {assignment.get('id')!r} in {CONFIG_PATH.name} is missing {missing}")

    return {**DEFAULTS, **loaded, "rosters": {**DEFAULTS["rosters"], **loaded.get("rosters", {})}}

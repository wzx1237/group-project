"""Record cover detection, split boundaries and UID reads for data/samples/quiz-1-*.pdf.

Writes tests/fixtures/sample_info_box.json. Run from backend/ with the venv python:
    python tests/fixtures/record_baseline.py
Uses the committed template data/templates/quiz-1.json (the layout every assignment inherits today).
"""

import json
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

from app import config  # noqa: E402
from app.services.cover_detector import CoverDetector  # noqa: E402
from app.services.pdf_splitter import split_by_covers  # noqa: E402
from app.services.uid_reader import UIDReader  # noqa: E402

DATA = ROOT / "data"
TEMPLATE = DATA / "templates" / "quiz-1.json"


def record() -> dict:
    cfg = config.DEFAULTS
    spec = json.loads(TEMPLATE.read_text())
    detector = CoverDetector.from_template(TEMPLATE, cfg["cover_threshold"])
    reader = UIDReader(DATA / cfg["uid_model"], tuple(spec["uid_region"]), cfg["uid_min_confidence"], cfg["uid_min_margin"])
    out = {"template": TEMPLATE.name, "files": {}}
    for pdf in sorted((DATA / "samples").glob("quiz-1-*.pdf")):
        pages = detector.detect_pdf(pdf)
        with tempfile.TemporaryDirectory() as tmp:
            submissions = split_by_covers(pdf, [p["is_cover"] for p in pages], tmp)
            reads = reader.read_batch([(Path(tmp) / s["filename"], None) for s in submissions])
        out["files"][pdf.name] = {
            "pages": pages,
            "submissions": [
                {k: s[k] for k in ("id", "start_page", "end_page", "starts_with_cover")}
                | {k: r[k] for k in ("read", "status", "uid", "detail")}
                for s, r in zip(submissions, reads)
            ],
        }
    return out


if __name__ == "__main__":
    target = Path(__file__).with_name("sample_info_box.json")
    target.write_text(json.dumps(record(), indent=2) + "\n")
    print(f"wrote {target}")

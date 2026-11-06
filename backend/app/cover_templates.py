"""Exam files saved during exam setup. The blank exam also becomes the exam's cover template,
which is how uploaded scans are split into one exam per student."""

import json

import pymupdf

from app import config, store
from app.processing import TEMPLATE_DIR
from app.services.cover_detector import CoverDetector, render_page


def _relative(path) -> str:
    return path.relative_to(store.DATA_DIR).as_posix()


def save_blank_exam(assignment_id: str, pdf: bytes) -> str:
    """Save the blank exam and the cover template made from its first page. Returns its path under data/."""
    json_path = TEMPLATE_DIR / f"{assignment_id}.json"
    pdf_path = TEMPLATE_DIR / f"{assignment_id}.pdf"
    # A re-uploaded blank exam keeps the boxes of the exam's current template.
    layout = json.loads(json_path.read_text()) if json_path.exists() else config.load()["cover_layout"]
    try:
        with pymupdf.open(stream=pdf, filetype="pdf") as document:
            cover = render_page(document[0])
    except Exception:
        raise ValueError("The blank exam couldn't be read as a PDF")
    try:
        # Every box must land on printed content, or covers can't be recognised and UIDs can't be read.
        CoverDetector(cover, [tuple(a["rect"]) for a in layout["anchors"]] + [tuple(layout["uid_region"])])
    except ValueError:
        raise ValueError(
            "The blank exam's first page doesn't match the course's cover sheet, so scans couldn't be split "
            "into one exam per student. Check that its first page is the cover with the UID boxes."
        )
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    pdf_path.write_bytes(pdf)
    spec = {
        "reference_pdf": pdf_path.name,
        "reference_page_index": 0,
        "anchors": layout["anchors"],
        "uid_region": layout["uid_region"],
        "id_panel": layout["id_panel"],
    }
    json_path.write_text(json.dumps(spec, indent=2))
    return _relative(pdf_path)


def save_answer_key(assignment_id: str, pdf: bytes) -> str:
    path = TEMPLATE_DIR / f"{assignment_id}_answer_key.pdf"
    TEMPLATE_DIR.mkdir(parents=True, exist_ok=True)
    path.write_bytes(pdf)
    return _relative(path)

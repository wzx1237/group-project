"""Process an uploaded master PDF: find cover pages, then split it into one PDF per exam."""

import json
import shutil

from app import config, rosters, store
from app.services.cover_detector import CoverDetector
from app.services.matching import decide
from app.services.pdf_splitter import split_by_covers
from app.services.uid_reader import UIDReader

TEMPLATE_DIR = store.DATA_DIR / "templates"


def update_upload(assignment_id: str, upload_id: str, **fields) -> None:
    def mutate(db):
        for assignment in db["assignments"]:
            if assignment["id"] == assignment_id:
                for upload in assignment["uploads"]:
                    if upload["id"] == upload_id:
                        upload.update(fields)

    store.update(mutate)


def process_upload(assignment_id: str, upload_id: str) -> None:
    """Runs in the background; progress and results are written to the upload's record."""
    update_upload(assignment_id, upload_id, status="processing", error=None)
    try:
        template = TEMPLATE_DIR / f"{assignment_id}.json"
        if not template.exists():
            raise FileNotFoundError(f"No cover template for this assignment (expected {template.name})")
        source = store.UPLOAD_DIR / assignment_id / f"{upload_id}.pdf"
        pages = CoverDetector.from_template(template, config.load()["cover_threshold"]).detect_pdf(source)

        out_dir = store.SUBMISSION_DIR / assignment_id / upload_id
        shutil.rmtree(out_dir, ignore_errors=True)  # derived files from an earlier run
        submissions = split_by_covers(source, [p["is_cover"] for p in pages], out_dir)
        update_upload(assignment_id, upload_id, status="processed", pages=pages, submissions=submissions,
                      matching="idle", matching_error=None)
    except Exception as error:
        update_upload(assignment_id, upload_id, status="failed", error=str(error) or type(error).__name__)


def match_upload(assignment_id: str, upload_id: str, pool) -> None:
    """Read each exam's UID and match it to the roster. Runs in the background."""
    update_upload(assignment_id, upload_id, matching="running", matching_error=None)
    try:
        db = store.load()
        assignment = next(a for a in db["assignments"] if a["id"] == assignment_id)
        upload = next(u for u in assignment["uploads"] if u["id"] == upload_id)
        submissions = upload["submissions"]

        region = tuple(json.loads((TEMPLATE_DIR / f"{assignment_id}.json").read_text())["uid_region"])
        folder = store.SUBMISSION_DIR / assignment_id / upload_id
        items = [(folder / s["filename"], folder / f"{s['id']}_uid.png") for s in submissions]
        cfg = config.load()
        model_path = store.DATA_DIR / cfg["uid_model"]
        if not model_path.exists():
            raise FileNotFoundError(f"UID model not found: {model_path}")
        reader = UIDReader(model_path, region, cfg["uid_min_confidence"], cfg["uid_min_margin"])
        reads = reader.read_batch(items)

        roster = {student["uid"]: student for student in rosters.students(pool)}
        taken = {
            s["match"]["student_uid"]
            for other in assignment["uploads"] if other["id"] != upload_id
            for s in other.get("submissions", []) if s.get("match") and s["match"]["state"] in ("matched", "assigned")
        }
        for submission, read, decision in zip(submissions, reads, decide(reads, roster, taken, cfg["suggestion_min_digits"])):
            submission.update(ocr=read, match=decision, uid_image=f"{submission['id']}_uid.png")
        update_upload(assignment_id, upload_id, submissions=submissions, matching="done")
    except Exception as error:
        update_upload(assignment_id, upload_id, matching="failed", matching_error=str(error) or type(error).__name__)

"""Per-student status for one assignment, derived from its uploads (nothing here is stored)."""

RESOLVED = ("matched", "assigned")


def assigned_submissions(assignment: dict) -> dict[str, dict]:
    """student uid -> {"upload_id", "submission_id"} for every exam matched or assigned to a student."""
    found = {}
    for upload in assignment["uploads"]:
        for submission in upload.get("submissions", []):
            match = submission.get("match")
            if match and match["state"] in RESOLVED:
                found[match["student_uid"]] = {"upload_id": upload["id"], "submission_id": submission["id"]}
    return found


def all_exams_assigned(assignment: dict) -> bool:
    """True once every upload is split and matched and no exam is still waiting for a TA."""
    uploads = assignment["uploads"]
    if not uploads:
        return False
    for upload in uploads:
        if upload["status"] != "processed" or upload.get("matching") != "done":
            return False
        if any(s["match"]["state"] not in RESOLVED for s in upload["submissions"]):
            return False
    return True


def student_statuses(assignment: dict, student_uids: list[str]) -> dict[str, str | None]:
    """submitted / grading / graded / missing, or None while it is not yet known.

    "missing" (a student with no exam) only appears once every exam is assigned; before that,
    those students stay blank. A grading status stored on the assignment overrides "submitted".
    """
    assigned = assigned_submissions(assignment)
    complete = all_exams_assigned(assignment)
    result = {}
    for uid in student_uids:
        stored = assignment["statuses"].get(uid)
        if stored:
            result[uid] = stored
        elif uid in assigned:
            result[uid] = "submitted"
        else:
            result[uid] = "missing" if complete else None
    return result

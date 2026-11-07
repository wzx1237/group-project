"""Which split scans in the upload store (data/db.json) belong to which student.

Student and assignment status are stored in PostgreSQL; see app.workflow.
"""

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

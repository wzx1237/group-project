"""Decide which roster student, if any, an exam belongs to. Pure functions; no I/O."""

AUTO_REASONS = {
    "blank": "blank",
    "unclear": "unclear",
    "not_numeric": "not_numeric",
}


def _agreement(read: str, uid: str) -> int:
    return sum(a == b for a, b in zip(read, uid))


def _suggest(read: str, roster: dict[str, dict], taken: set[str], min_digits: int) -> str | None:
    """A hint for the TA (never auto-assigned): the one roster UID that agrees with the read in `min_digits`+ places."""
    scored = sorted(((_agreement(read, uid), uid) for uid in roster if uid not in taken), reverse=True)
    if scored and scored[0][0] >= min_digits and (len(scored) == 1 or scored[0][0] > scored[1][0]):
        return scored[0][1]
    return None


def decide(reads: list[dict], roster: dict[str, dict], taken: set[str], suggestion_min_digits: int = 6) -> list[dict]:
    """One decision per read: {"state": "matched" | "needs_review", "student_uid", "reason", "suggestion"}.

    Auto-match only when the UID is fully legible, on the roster, and used by exactly one exam
    (and by no student already assigned elsewhere in the same assignment, given in `taken`).
    """
    counts: dict[str, int] = {}
    for item in reads:
        if item["uid"]:
            counts[item["uid"]] = counts.get(item["uid"], 0) + 1

    decisions = []
    for item in reads:
        uid = item["uid"]
        if uid is None:
            reason, suggestion = AUTO_REASONS[item["status"]], None
            if item["status"] == "unclear":
                suggestion = _suggest(item["read"], roster, taken, suggestion_min_digits)
        elif uid not in roster:
            reason, suggestion = "not_on_roster", _suggest(uid, roster, taken, suggestion_min_digits)
        elif counts[uid] > 1 or uid in taken:
            reason, suggestion = "duplicate_uid", None
        else:
            decisions.append({"state": "matched", "student_uid": uid, "reason": None, "suggestion": None})
            continue
        decisions.append({"state": "needs_review", "student_uid": None, "reason": reason, "suggestion": suggestion})
    return decisions

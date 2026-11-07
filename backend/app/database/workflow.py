"""Workflow persistence. Functions use the supplied connection without committing."""


def seed_assignment_students(conn, exam_id) -> int:
    """Seed assignment students; return the affected row count."""
    return conn.execute(
        """INSERT INTO assignment_student (exam_id, uid)
        SELECT a.exam_id, en.uid FROM assignment a JOIN enrollment en USING (course_id)
        WHERE a.exam_id = %s AND a.status <> 'draft' AND COALESCE(en.status, 'active') = 'active'
        ON CONFLICT DO NOTHING""",
        (exam_id,),
    ).rowcount


def sync_student_statuses(conn, actor, matched, suggested, exam_id) -> int:
    """Sync matches while preserving excused/no-show unless a real paper has arrived."""
    return conn.execute(
        """UPDATE assignment_student s SET status = n.status, set_by = %s, set_at = clock_timestamp()
        FROM (SELECT s.uid, CASE
        WHEN s.uid = ANY(%s) OR EXISTS (SELECT 1 FROM studentpaper p WHERE p.exam_id = s.exam_id AND p.uid = s.uid)
        THEN 'matched'
        WHEN s.status IN ('excused', 'no_show') THEN s.status
        WHEN s.uid = ANY(%s) THEN 'needs_review'
        ELSE 'missing' END AS status
        FROM assignment_student s WHERE s.exam_id = %s) n
        WHERE s.exam_id = %s AND s.uid = n.uid AND s.status <> n.status""",
        (actor, matched, suggested, exam_id, exam_id),
    ).rowcount


def setup_readiness(conn, exam_id) -> dict | None:
    """Setup readiness; return None when missing."""
    return conn.execute(
        """SELECT a.blank_pdf IS NOT NULL AS blank,
        EXISTS (SELECT 1 FROM gradable_question q WHERE q.exam_id = a.exam_id AND q.region IS NOT NULL) AS region,
        EXISTS (SELECT 1 FROM gradable_question q WHERE q.exam_id = a.exam_id) AS questions,
        NOT EXISTS (SELECT 1 FROM gradable_question q WHERE q.exam_id = a.exam_id AND NOT EXISTS
        (SELECT 1 FROM rubric_label rl WHERE (rl.exam_id, rl.qid) = (q.exam_id, q.qid))) AS criteria
        FROM assignment a WHERE a.exam_id = %s""",
        (exam_id,),
    ).fetchone()


def count_students(conn, exam_id: int, readiness: str) -> int:
    """Count enrolled students failing one named readiness check."""
    condition = {
        "unresolved": "status IN ('missing', 'needs_review')",
        "ungraded": "status <> 'excused' AND NOT graded",
        "without_grade": "NOT graded",
    }[readiness]
    return conn.execute(
        f"SELECT count(*) AS n FROM assignment_student_progress WHERE exam_id = %s AND enrolled AND ({condition})",
        (exam_id,),
    ).fetchone()["n"]


def set_assignment_status(conn, target, exam_id) -> int:
    """Set assignment status; return the affected row count."""
    return conn.execute(
        """UPDATE assignment SET status = %s,
        released_at = CASE WHEN %s = 'closed' THEN clock_timestamp() END
        WHERE exam_id = %s""",
        (target, target, exam_id),
    ).rowcount


def lock_student_status(conn, exam_id, uid) -> dict | None:
    """Lock student status; return None when missing."""
    return conn.execute(
        """SELECT status FROM assignment_student WHERE exam_id = %s AND uid = %s FOR UPDATE""",
        (exam_id, uid),
    ).fetchone()


def set_student_mark(conn, mark, actor, note, exam_id, uid) -> int:
    """Set student mark; return the affected row count."""
    return conn.execute(
        """UPDATE assignment_student SET status = %s, set_by = %s, set_at = clock_timestamp(), note = %s
        WHERE exam_id = %s AND uid = %s""",
        (mark, actor, note, exam_id, uid),
    ).rowcount


def clear_student_mark(conn, actor, exam_id, uid) -> int:
    """Clear student mark; return the affected row count."""
    return conn.execute(
        """UPDATE assignment_student SET status = 'missing', set_by = %s, set_at = clock_timestamp(), note = NULL
        WHERE exam_id = %s AND uid = %s""",
        (actor, exam_id, uid),
    ).rowcount


def student_progress(conn, exam_id, uid) -> dict | None:
    """Student progress; return None when missing."""
    return conn.execute(
        """SELECT * FROM assignment_student_progress WHERE exam_id = %s AND uid = %s""",
        (exam_id, uid),
    ).fetchone()


def students_progress(conn, exam_id) -> list[dict]:
    """Students progress; return rows in query order."""
    return conn.execute('SELECT * FROM assignment_student_progress WHERE exam_id = %s', (exam_id,)).fetchall()


def assignment_progress(conn, exam_ids) -> list[dict]:
    """Assignment progress; return rows in query order."""
    return conn.execute(
        """SELECT exam_id, status, count(*) AS n, count(*) FILTER (WHERE graded) AS graded
        FROM assignment_student_progress WHERE exam_id = ANY(%s) AND enrolled GROUP BY exam_id, status""",
        (exam_ids,),
    ).fetchall()

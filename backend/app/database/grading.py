"""Grading persistence. Functions use the supplied connection without committing."""


def set_lock_timeout(conn) -> int:
    """Set lock timeout; return the affected row count."""
    return conn.execute("SET LOCAL lock_timeout = '5s'").rowcount


def set_statement_timeout(conn) -> int:
    """Set statement timeout; return the affected row count."""
    return conn.execute("SET LOCAL statement_timeout = '15s'").rowcount


def lock_mapping(conn, writing, exam_id, uid, qid) -> dict | None:
    """Lock one mapping for a snapshot or write, preserving the workflow lock order."""
    lock = 'FOR NO KEY UPDATE' if writing else 'FOR SHARE'
    return conn.execute(
        'SELECT * FROM mapping WHERE exam_id=%s AND uid=%s AND qid=%s ' + lock,
        (exam_id, uid, qid),
    ).fetchone()


def assign_grader(conn, actor, exam_id, uid, qid) -> int:
    """Assign grader; return the affected row count."""
    return conn.execute(
        """UPDATE mapping SET directory_id=%s WHERE exam_id=%s AND uid=%s AND qid=%s""",
        (actor, exam_id, uid, qid),
    ).rowcount


def mark_question_for_regrade(conn, exam_id, qid) -> int:
    """Mark all mappings for the question; return their count without changing saved scores."""
    return conn.execute("UPDATE mapping SET status='Regrade' WHERE exam_id=%s AND qid=%s", (exam_id, qid)).rowcount


def seed_question_mappings(conn, qid, exam_id) -> int:
    """Seed enrolled papers for one question; preserve existing owners and statuses."""
    return conn.execute(
        """INSERT INTO mapping(exam_id,uid,qid,status)
        SELECT p.exam_id,p.uid,%s,'Pending' FROM studentpaper p
        JOIN assignment e USING(exam_id) JOIN enrollment en ON en.uid=p.uid AND en.course_id=e.course_id
        WHERE p.exam_id=%s ON CONFLICT DO NOTHING""",
        (qid, exam_id),
    ).rowcount


def next_available_answer(conn, exam_id, qid, actor) -> dict | None:
    """Lock the next pending/regrade answer, skipping rows claimed by concurrent workers."""
    return conn.execute(
        """SELECT uid FROM mapping
        WHERE exam_id=%s AND qid=%s AND (directory_id=%s OR directory_id IS NULL)
        AND lower(COALESCE(status,'pending')) IN ('pending','regrade','inprogress','in_progress')
        ORDER BY (directory_id=%s) DESC NULLS LAST,uid FOR UPDATE SKIP LOCKED LIMIT 1""",
        (exam_id, qid, actor, actor),
    ).fetchone()


def claim_answer(conn, actor, exam_id, uid, qid) -> int:
    """Claim answer; return the affected row count."""
    return conn.execute(
        """UPDATE mapping SET directory_id=%s,
        status=CASE WHEN lower(status)='regrade' THEN 'Regrade' ELSE 'InProgress' END
        WHERE exam_id=%s AND uid=%s AND qid=%s""",
        (actor, exam_id, uid, qid),
    ).rowcount


def release_answer(conn, exam_id, uid, qid) -> int:
    """Release answer; return the affected row count."""
    return conn.execute(
        """UPDATE mapping SET directory_id=NULL,
        status=CASE WHEN lower(status)='regrade' THEN 'Regrade' ELSE 'Pending' END
        WHERE exam_id=%s AND uid=%s AND qid=%s""",
        (exam_id, uid, qid),
    ).rowcount


def seed_exam_mappings(conn, exam_id) -> int:
    """Seed enrolled papers across all questions without replacing existing mappings."""
    return conn.execute(
        """INSERT INTO mapping(exam_id,uid,qid,status)
        SELECT p.exam_id,p.uid,r.qid,'Pending' FROM studentpaper p JOIN rubric r USING(exam_id)
        JOIN assignment e USING(exam_id) JOIN enrollment en ON en.uid=p.uid AND en.course_id=e.course_id
        WHERE p.exam_id=%s ON CONFLICT DO NOTHING""",
        (exam_id,),
    ).rowcount


def course_question_progress(conn, actor, course_id) -> list[dict]:
    """Course question progress; return rows in query order."""
    return conn.execute(
        """SELECT e.exam_id,e.exam_name,r.qid,r.grading_method,r.total_scores,
        count(m.uid) FILTER (WHERE m.directory_id=%s) AS assigned,
        count(m.uid) FILTER (WHERE m.directory_id=%s AND lower(m.status)='finished') AS finished,
        count(m.uid) FILTER (WHERE m.directory_id=%s AND lower(m.status)='regrade') AS regrade,
        (SELECT count(*) FROM studentpaper p JOIN enrollment en ON en.uid=p.uid AND en.course_id=e.course_id
        WHERE p.exam_id=e.exam_id AND NOT EXISTS
        (SELECT 1 FROM mapping other WHERE other.exam_id=e.exam_id AND other.uid=p.uid AND other.qid=r.qid
        AND (other.directory_id IS NOT NULL AND other.directory_id<>%s OR lower(other.status)='finished')))
        AS available
        FROM assignment e JOIN rubric r USING(exam_id) LEFT JOIN mapping m USING(exam_id,qid)
        WHERE e.course_id=%s GROUP BY e.exam_id,r.exam_id,r.qid ORDER BY e.exam_id,r.qid""",
        (actor, actor, actor, actor, course_id),
    ).fetchall()


def exam_mappings(conn, exam_id) -> list[dict]:
    """Exam mappings; return rows in query order."""
    return conn.execute('SELECT * FROM mapping WHERE exam_id=%s ORDER BY uid,qid', (exam_id,)).fetchall()


def claim_available_answer(conn, actor, exam_id, uid, qid) -> dict | None:
    """Claim an unfinished answer only when unowned or already owned by this actor."""
    return conn.execute(
        """UPDATE mapping SET directory_id=%s,status=CASE WHEN lower(status)='regrade' THEN 'Regrade' ELSE 'InProgress' END
        WHERE exam_id=%s AND uid=%s AND qid=%s AND (directory_id IS NULL OR directory_id=%s)
        AND lower(status)<>'finished' RETURNING *""",
        (actor, exam_id, uid, qid, actor),
    ).fetchone()


def mapping_row(conn, exam_id, uid, qid) -> dict | None:
    """Mapping row; return None when missing."""
    return conn.execute('SELECT * FROM mapping WHERE exam_id=%s AND uid=%s AND qid=%s', (exam_id, uid, qid)).fetchone()


def reassign_answer(conn, grader_directory_id, exam_id, uid, qid) -> dict | None:
    """Reassign answer; return None when missing."""
    return conn.execute(
        """UPDATE mapping SET directory_id=%s WHERE exam_id=%s AND uid=%s AND qid=%s RETURNING *""",
        (grader_directory_id, exam_id, uid, qid),
    ).fetchone()

"""Answer locks: which grader is working on an answer right now. Functions use the supplied connection without committing."""

# How long a lock lasts without being renewed. The grading page renews held locks every 30 seconds.
LEASE = '90 seconds'

# The qid that stands for the student's overall comment; questions can't have an empty ID.
COMMENT = ''


def locks(conn, exam_id, uid) -> list[dict]:
    """Unexpired locks on this student's answers, with each holder's name."""
    return conn.execute(
        """SELECT l.qid, l.holder, s.name AS holder_name, l.expires_at FROM answer_lock l
        JOIN staff s ON s.directory_id = l.holder
        WHERE l.exam_id = %s AND l.uid = %s AND l.expires_at > clock_timestamp() ORDER BY l.qid""",
        (exam_id, uid),
    ).fetchall()


def holder(conn, exam_id, uid, qid) -> dict | None:
    """The unexpired lock on one answer, with its holder's name, or None."""
    return conn.execute(
        """SELECT l.qid, l.holder, s.name AS holder_name, l.expires_at FROM answer_lock l
        JOIN staff s ON s.directory_id = l.holder
        WHERE l.exam_id = %s AND l.uid = %s AND l.qid = %s AND l.expires_at > clock_timestamp()""",
        (exam_id, uid, qid),
    ).fetchone()


def take(conn, actor, exam_id, uid, qid, *, take_over=False) -> dict | None:
    """Hold the answer for `actor` for another lease. None when someone else holds it and it hasn't expired, unless
    `take_over`."""
    return conn.execute(
        f"""INSERT INTO answer_lock (exam_id, uid, qid, holder, expires_at)
        VALUES (%s, %s, %s, %s, clock_timestamp() + interval '{LEASE}')
        ON CONFLICT (exam_id, uid, qid) DO UPDATE SET holder = EXCLUDED.holder, expires_at = EXCLUDED.expires_at
        WHERE answer_lock.holder = EXCLUDED.holder OR answer_lock.expires_at <= clock_timestamp() OR %s
        RETURNING qid, holder, expires_at""",
        (exam_id, uid, qid, actor, take_over),
    ).fetchone()


def release(conn, actor, exam_id, uid) -> int:
    """Let go of every lock `actor` holds on this student's answers; return how many."""
    return conn.execute(
        'DELETE FROM answer_lock WHERE exam_id = %s AND uid = %s AND holder = %s', (exam_id, uid, actor)
    ).rowcount

"""Regrade queues. Functions use the supplied connection without committing."""


def queues(conn, exam_id, *, include_closed=False, queue_id=None) -> list[dict]:
    """The assignment's queues, newest first, with the split criterion's definition."""
    return conn.execute(
        """SELECT q.*, l.title AS label_title, l.description AS label_description, l.deduction AS label_deduction
        FROM regrade_queue q LEFT JOIN label l ON (l.exam_id, l.label_id) = (q.exam_id, q.label_id)
        WHERE q.exam_id = %s AND (%s OR q.closed_at IS NULL) AND (%s::int IS NULL OR q.queue_id = %s)
        ORDER BY q.queue_id DESC""",
        (exam_id, include_closed, queue_id, queue_id),
    ).fetchall()


def items(conn, queue_ids) -> list[dict]:
    """Answers in these queues, in student order."""
    return conn.execute('SELECT * FROM regrade_item WHERE queue_id = ANY(%s) ORDER BY queue_id, uid', (queue_ids,)).fetchall()


def replacements(conn, exam_id, label_ids) -> list[dict]:
    """The criteria that replaced these split criteria."""
    return conn.execute(
        'SELECT label_id, split_from FROM label WHERE exam_id = %s AND split_from = ANY(%s) ORDER BY label_id',
        (exam_id, label_ids),
    ).fetchall()


def graded_answers(conn, exam_id, qid, *, uids=None, label_id=None) -> list[str]:
    """Enrolled students whose answer to the question has a score; optionally only these students, or only answers
    with this criterion applied."""
    rows = conn.execute(
        """SELECT d.uid FROM decision d JOIN assignment a USING (exam_id)
        JOIN enrollment en ON en.uid = d.uid AND en.course_id = a.course_id AND COALESCE(en.status, 'active') = 'active'
        WHERE d.exam_id = %s AND d.qid = %s AND d.scores IS NOT NULL AND (%s::text[] IS NULL OR d.uid = ANY(%s))
          AND (%s::int IS NULL OR EXISTS (SELECT 1 FROM decision_label dl
               WHERE dl.exam_id = d.exam_id AND dl.record_id = d.record_id AND dl.label_id = %s))
        ORDER BY d.uid""",
        (exam_id, qid, uids, uids, label_id, label_id),
    ).fetchall()
    return [row['uid'] for row in rows]


def create_queue(conn, actor, exam_id, qid, kind, reason, uids, label_id=None) -> int:
    """Open a queue holding these answers and mark them for regrade; return its ID."""
    queue_id = conn.execute(
        """INSERT INTO regrade_queue (exam_id, qid, kind, reason, label_id, created_by)
        VALUES (%s, %s, %s, %s, %s, %s) RETURNING queue_id""",
        (exam_id, qid, kind, reason, label_id, actor),
    ).fetchone()['queue_id']
    conn.execute(
        'INSERT INTO regrade_item (queue_id, exam_id, uid, qid) SELECT %s, %s, uid, %s FROM unnest(%s::text[]) AS uid',
        (queue_id, exam_id, qid, uids),
    )
    conn.execute("UPDATE mapping SET status = 'Regrade' WHERE exam_id = %s AND qid = %s AND uid = ANY(%s)", (exam_id, qid, uids))
    return queue_id


def lock_item(conn, exam_id, queue_id, uid) -> dict | None:
    """One answer in a queue, with its queue's kind, split criterion and whether it is closed; locked for review."""
    return conn.execute(
        """SELECT i.*, q.kind, q.label_id, q.closed_at FROM regrade_item i JOIN regrade_queue q USING (queue_id, exam_id, qid)
        WHERE i.exam_id = %s AND i.queue_id = %s AND i.uid = %s FOR UPDATE OF i""",
        (exam_id, queue_id, uid),
    ).fetchone()


def resolve_item(conn, actor, queue_id, uid) -> int:
    """Record that a grader reviewed this answer; return the affected row count."""
    return conn.execute(
        """UPDATE regrade_item SET resolved_by = %s, resolved_at = clock_timestamp()
        WHERE queue_id = %s AND uid = %s AND resolved_at IS NULL""",
        (actor, queue_id, uid),
    ).rowcount


def pending(conn, queue_id) -> int:
    """Answers in the queue not reviewed yet."""
    return conn.execute(
        'SELECT count(*) AS n FROM regrade_item WHERE queue_id = %s AND resolved_at IS NULL', (queue_id,)
    ).fetchone()['n']


def waiting(conn, exam_id, uid, qid) -> int:
    """Open queues this answer is still waiting in."""
    return conn.execute(
        """SELECT count(*) AS n FROM regrade_item i JOIN regrade_queue q USING (queue_id)
        WHERE i.exam_id = %s AND i.uid = %s AND i.qid = %s AND i.resolved_at IS NULL AND q.closed_at IS NULL""",
        (exam_id, uid, qid),
    ).fetchone()['n']


def waiting_answers(conn, exam_id) -> int:
    """Answers of the assignment still waiting in an open queue."""
    return conn.execute(
        """SELECT count(*) AS n FROM (SELECT DISTINCT i.uid, i.qid FROM regrade_item i JOIN regrade_queue q USING (queue_id)
        WHERE i.exam_id = %s AND i.resolved_at IS NULL AND q.closed_at IS NULL) w""",
        (exam_id,),
    ).fetchone()['n']


def close_queue(conn, actor, queue_id) -> int:
    """Close the queue. Answers it leaves unreviewed keep their scores and stop waiting unless another queue holds them."""
    closed = conn.execute(
        'UPDATE regrade_queue SET closed_at = clock_timestamp(), closed_by = %s WHERE queue_id = %s AND closed_at IS NULL',
        (actor, queue_id),
    ).rowcount
    conn.execute(
        """UPDATE mapping m SET status = CASE WHEN d.scores IS NOT NULL THEN 'Finished' ELSE 'InProgress' END
        FROM regrade_item i JOIN decision d USING (exam_id, uid, qid)
        WHERE i.queue_id = %s AND i.resolved_at IS NULL AND (m.exam_id, m.uid, m.qid) = (i.exam_id, i.uid, i.qid)
          AND NOT EXISTS (SELECT 1 FROM regrade_item o JOIN regrade_queue q USING (queue_id)
                          WHERE (o.exam_id, o.uid, o.qid) = (i.exam_id, i.uid, i.qid)
                            AND o.resolved_at IS NULL AND q.closed_at IS NULL)""",
        (queue_id,),
    )
    return closed


def label_questions(conn, exam_id, label_id) -> list[str]:
    """Questions that offer this criterion."""
    rows = conn.execute('SELECT qid FROM rubric_label WHERE exam_id = %s AND label_id = %s', (exam_id, label_id)).fetchall()
    return [row['qid'] for row in rows]


def label_in_use(conn, exam_id, label_id) -> bool:
    """Whether any saved answer has this criterion applied."""
    return conn.execute(
        'SELECT 1 FROM decision_label WHERE exam_id = %s AND label_id = %s LIMIT 1', (exam_id, label_id)
    ).fetchone() is not None


def add_replacement(conn, exam_id, split_from, title, description, deduction) -> int:
    """Create a criterion that replaces part of a split one; return its ID."""
    return conn.execute(
        """INSERT INTO label (exam_id, title, description, deduction, split_from)
        VALUES (%s, %s, %s, %s, %s) RETURNING label_id""",
        (exam_id, title, description, deduction, split_from),
    ).fetchone()['label_id']


def retire_label(conn, exam_id, label_id) -> int:
    """Stop offering a criterion while the answers that have it keep it; return the affected row count."""
    return conn.execute(
        'UPDATE label SET retired_at = clock_timestamp() WHERE exam_id = %s AND label_id = %s AND retired_at IS NULL',
        (exam_id, label_id),
    ).rowcount


def criterion_usage(conn, exam_id) -> dict[int, int]:
    """label_id -> how many enrolled students' answers have it applied."""
    rows = conn.execute(
        """SELECT dl.label_id, count(*) AS n FROM decision_label dl JOIN decision d USING (exam_id, record_id)
        JOIN assignment a ON a.exam_id = d.exam_id
        JOIN enrollment en ON en.uid = d.uid AND en.course_id = a.course_id AND COALESCE(en.status, 'active') = 'active'
        WHERE dl.exam_id = %s GROUP BY dl.label_id""",
        (exam_id,),
    ).fetchall()
    return {row['label_id']: row['n'] for row in rows}


def graded_counts(conn, exam_id) -> dict[str, int]:
    """qid -> how many enrolled students' answers have a score."""
    rows = conn.execute(
        """SELECT d.qid, count(*) AS n FROM decision d JOIN assignment a USING (exam_id)
        JOIN enrollment en ON en.uid = d.uid AND en.course_id = a.course_id AND COALESCE(en.status, 'active') = 'active'
        WHERE d.exam_id = %s AND d.scores IS NOT NULL GROUP BY d.qid""",
        (exam_id,),
    ).fetchall()
    return {row['qid']: row['n'] for row in rows}

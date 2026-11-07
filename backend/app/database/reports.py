"""Reports persistence. Functions use the supplied connection without committing."""


def exam_info(conn, exam_id) -> dict | None:
    """Exam info; return None when missing."""
    return conn.execute(
        """SELECT e.exam_name, e.released_at, c.code, c.term FROM assignment e
        JOIN course c USING(course_id) WHERE e.exam_id=%s""",
        (exam_id,),
    ).fetchone()


def exam_questions(conn, exam_id) -> list[dict]:
    """Exam questions; return rows in query order."""
    return conn.execute('SELECT qid, title, total_scores FROM rubric WHERE exam_id=%s', (exam_id,)).fetchall()


def exam_decisions(conn, exam_id) -> list[dict]:
    """Exam decisions; return rows in query order."""
    return conn.execute(
        """SELECT uid, qid, record_id, scores, comments_remark FROM decision WHERE exam_id=%s""",
        (exam_id,),
    ).fetchall()


def finished_answers(conn, exam_id) -> list[dict]:
    """Finished answers; return rows in query order."""
    return conn.execute("SELECT uid, qid FROM mapping WHERE exam_id=%s AND lower(status)='finished'", (exam_id,)).fetchall()


def selected_label_details(conn, exam_id) -> list[dict]:
    """Selected label details; return rows in query order."""
    return conn.execute(
        """SELECT dl.record_id, l.title, l.deduction FROM decision_label dl
        JOIN label l ON (l.exam_id,l.label_id)=(dl.exam_id,dl.label_id)
        WHERE dl.exam_id=%s ORDER BY l.label_id""",
        (exam_id,),
    ).fetchall()


def exam_students(conn, exam_id, student) -> list[dict]:
    """Exam students; return rows in query order."""
    return conn.execute(
        """SELECT p.uid, s.name, p.scanned_pdf, false AS no_show FROM studentpaper p
        JOIN student s USING(uid) JOIN assignment e USING(exam_id)
        JOIN enrollment en ON en.uid=p.uid AND en.course_id=e.course_id
        WHERE p.exam_id=%s AND (%s::text IS NULL OR p.uid=%s)
        UNION ALL
        SELECT a.uid, s.name, NULL, true FROM assignment_student a JOIN student s USING(uid)
        JOIN assignment e USING(exam_id) JOIN enrollment en ON en.uid=a.uid AND en.course_id=e.course_id
        WHERE a.exam_id=%s AND a.status='no_show' AND (%s::text IS NULL OR a.uid=%s)
        AND NOT EXISTS (SELECT 1 FROM studentpaper p WHERE p.exam_id=a.exam_id AND p.uid=a.uid)
        ORDER BY name, uid""",
        (exam_id, student, student, exam_id, student, student),
    ).fetchall()


def enrolled_contacts(conn, exam_id) -> list[dict]:
    """Enrolled contacts; return rows in query order."""
    return conn.execute(
        """SELECT s.uid, s.name, s.email FROM student s JOIN enrollment en USING(uid)
        JOIN assignment e ON e.course_id=en.course_id WHERE e.exam_id=%s ORDER BY s.name, s.uid""",
        (exam_id,),
    ).fetchall()

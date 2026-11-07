"""Roster reads on the schema installed by app.db.migrate."""


def students(conn, *, course_id=None, code=None, term=None) -> list[dict]:
    """Students, including section and enrollment status, in one course offering."""
    if course_id is not None:
        return conn.execute(
        """SELECT s.uid, s.name, s.directory_id, s.email, en.section, en.status
        FROM student s JOIN enrollment en USING (uid)
        WHERE en.course_id = %s ORDER BY s.name""",
        (course_id,),
    ).fetchall()
    return conn.execute(
        """SELECT s.uid, s.name, s.directory_id, s.email, en.section, en.status
        FROM student s JOIN enrollment en USING (uid) JOIN course c USING (course_id)
        WHERE c.code = %s AND c.term = %s ORDER BY s.name""",
        (code, term),
    ).fetchall()


def staff(conn, *, course_id=None, code=None, term=None) -> list[dict]:
    """Staff in one course offering, ordered by role then name."""
    if course_id is not None:
        return conn.execute(
        """SELECT s.directory_id, s.name, s.email, s.role
        FROM staff s JOIN course_staff cs USING (directory_id)
        WHERE cs.course_id = %s ORDER BY s.role, s.name""",
        (course_id,),
    ).fetchall()
    return conn.execute(
        """SELECT s.directory_id, s.name, s.email, s.role
        FROM staff s JOIN course_staff USING (directory_id) JOIN course c USING (course_id)
        WHERE c.code = %s AND c.term = %s ORDER BY s.role, s.name""",
        (code, term),
    ).fetchall()

# Retired implementations (reference only; no executable code).
# Use current migrations and the conn functions instead. Revalidate schema and
# tests before restoring any of these old snippets.

# Source: rosters.py
# def students(pool: ConnectionPool, course_id: int | None = None) -> list[dict]:
#     course = config.load()["course"]
#     with pool.connection() as conn:
#         has_section = True
#         try:
#             conn.execute("SAVEPOINT check_sec")
#             conn.execute("SELECT section FROM enrollment LIMIT 0")
#             conn.execute("RELEASE SAVEPOINT check_sec")
#         except Exception:
#             conn.execute("ROLLBACK TO SAVEPOINT check_sec")
#             has_section = False
#
#         sec_col = ", en.section" if has_section else ""
#
#         has_status = True
#         try:
#             conn.execute("SAVEPOINT check_status")
#             conn.execute("SELECT status FROM enrollment LIMIT 0")
#             conn.execute("RELEASE SAVEPOINT check_status")
#         except Exception:
#             conn.execute("ROLLBACK TO SAVEPOINT check_status")
#             has_status = False
#
#         stat_col = ", en.status" if has_status else ""
#
#         if course_id is not None:
#             return conn.execute(
#                 f"""SELECT s.uid, s.name, s.directory_id, s.email{sec_col}{stat_col}
#                    FROM student s JOIN enrollment en USING (uid)
#                    WHERE en.course_id = %s
#                    ORDER BY s.name""",
#                 (course_id,),
#             ).fetchall()
#
#         return conn.execute(
#             f"""SELECT s.uid, s.name, s.directory_id, s.email{sec_col}{stat_col}
#                FROM student s JOIN enrollment en USING (uid) JOIN course c USING (course_id)
#                WHERE c.code = %s AND c.term = %s
#                ORDER BY s.name""",
#             (course["code"], course["term"]),
#         ).fetchall()

# Source: routing/distribution.py
# def _add_students_to_course(conn, course_id: int, students: list[dict]) -> list[dict]:
#     has_section = True
#     try:
#         conn.execute("SAVEPOINT check_sec")
#         conn.execute("SELECT section FROM enrollment LIMIT 0")
#         conn.execute("RELEASE SAVEPOINT check_sec")
#     except Exception:
#         conn.execute("ROLLBACK TO SAVEPOINT check_sec")
#         has_section = False
#
#     saved = []
#     for s in students:
#         uid = str(s.get("uid") or "").strip()
#         name = str(s.get("name") or "").strip()
#         email = (s.get("email") or "").strip() or None
#         section = (s.get("section") or "").strip() or None
#
#         if not (len(uid) == 9 and uid.isdigit()):
#             raise HTTPException(422, "A UID is 9 digits")
#         if not name:
#             raise HTTPException(422, "Enter the student's name")
#
#         student = conn.execute(
#             """INSERT INTO student (uid, name, email) VALUES (%s, %s, %s)
#                ON CONFLICT (uid) DO UPDATE SET
#                  name = EXCLUDED.name,
#                  email = COALESCE(EXCLUDED.email, student.email)
#                RETURNING uid, name, directory_id, email""",
#             (uid, name, email),
#         ).fetchone()
#
#         if has_section and section:
#             conn.execute(
#                 """INSERT INTO enrollment (course_id, uid, section) VALUES (%s, %s, %s)
#                    ON CONFLICT (course_id, uid) DO UPDATE SET
#                      section = COALESCE(EXCLUDED.section, enrollment.section)""",
#                 (course_id, uid, section),
#             )
#         else:
#             conn.execute(
#                 "INSERT INTO enrollment (course_id, uid) VALUES (%s, %s) ON CONFLICT DO NOTHING",
#                 (course_id, uid),
#             )
#         saved.append({**student, "section": section})
#     return saved

# Source: routing/assignments.py
# def edit_course(course_id: int, body: CourseEdit, request: Request, user: Staff):
#     """Course staff edit a course's code, term, title, or banner image."""
#     db = request.app.state.grading_db
#     with db.audit_context(actor_ID=user), db.transaction(), db.get_connection() as conn:
#         if not assignments.is_member(conn, course_id, user):
#             raise HTTPException(403, 'Not a member of this course')
#         existing = conn.execute('SELECT * FROM course WHERE course_id = %s', (course_id,)).fetchone()
#         if existing is None:
#             raise HTTPException(404, 'Course not found')
#
#         updates = []
#         params = []
#         if body.code is not None:
#             code = body.code.strip()
#             if not code:
#                 raise HTTPException(422, 'Course code cannot be empty')
#             updates.append("code = %s")
#             params.append(code)
#         if body.term is not None:
#             term = body.term.strip()
#             if not term:
#                 raise HTTPException(422, 'Term cannot be empty')
#             updates.append("term = %s")
#             params.append(term)
#         if body.title is not None:
#             title = body.title.strip() or None
#             updates.append("title = %s")
#             params.append(title)
#         if body.image is not None:
#             image = body.image.strip() or None
#             try:
#                 conn.execute("ALTER TABLE course ADD COLUMN IF NOT EXISTS image TEXT")
#             except Exception:
#                 pass
#             updates.append("image = %s")
#             params.append(image)
#
#         if updates:
#             params.append(course_id)
#             conn.execute(f"UPDATE course SET {', '.join(updates)} WHERE course_id = %s", params)
#
#         return next((c for c in courses_for(conn, user) if c['course_id'] == course_id), None)


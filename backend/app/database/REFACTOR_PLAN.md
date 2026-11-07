# Database 重构清单与后续需求

基线：`workspace_11_4` / `59cc9a1`。清单按原始分支逐项生成，在停用方法前核对调用与未来需求。

## 设计建议与边界

使用 `fn(conn, ...)` 管理查询和批量写入；函数不创建连接、不提交事务、不抛 HTTP 错误。服务负责权限、状态规则、HTTP 和文件处理。现有 `Database` 暂作事务、审计及成熟写方法的兼容入口，避免一次性改写审计生命周期。

## 未来需求依据

- rubric / label 的 deduction、scoring、满分变更后同步分数；保留 `_recalculate_score`、父行锁和重评机制。
- 维护选中标签集、空标签集、评分备注、重新分配和重新评分。
- 维护课程、学生和 staff / enrollment；导入试卷、更新匹配与学生状态。
- 生成个人报告、汇总分数、发布成绩；审计失败后重试和关闭连接。
- PDF 是需求背景；这里没有执行其中的部署或操作说明。

调用证据为静态属性引用，不等同于运行覆盖；同模块私有助手由相应写入口调用。

## 原有方法逐项核对

| 方法 | 调用证据（backend 内） | 处置与后续需求 |
| --- | --- | --- |
| `audit._initialize_audit` | `app/database/database.py` | 保留：事务审计、文件交付与重试 |
| `audit.audit_context` | `app/grading/service.py`, `app/grading/exams.py`, `app/routing/distribution.py`, `app/routing/grading_compat.py`, `app/routing/assignments.py` | 保留：事务审计、文件交付与重试 |
| `audit._check_audit_schema` | `audit.py` 内部调用 | 保留：事务审计、文件交付与重试 |
| `audit._connection` | `app/database/database.py` | 保留：事务审计、文件交付与重试 |
| `audit._flush_audit_safely` | `app/database/database.py` | 保留：事务审计、文件交付与重试 |
| `audit._write_audit_rows` | `audit.py` 内部调用 | 保留：事务审计、文件交付与重试 |
| `audit.flush_audit` | `tests/test_grading_postgres.py`, `tests/test_assignments_postgres.py`, `tests/test_workflow_postgres.py` | 保留：事务审计、文件交付与重试 |
| `course.add_course` | 暂无跨文件调用 | 预留：课程和 enrollment 维护 |
| `course.get_course_enrollment` | 暂无跨文件调用 | 预留：课程和 enrollment 维护 |
| `database.__init__` | 独立连接构造入口；当前应用使用 from_pool | 保留：连接池、事务复用和返回行处理 |
| `database.from_pool` | `app/main.py`, `tests/test_grading_postgres.py`, `tests/test_assignments_postgres.py`, `tests/test_workflow_postgres.py` | 保留：连接池、事务复用和返回行处理 |
| `database.get_connection` | `app/workflow.py`, `app/grading/service.py`, `app/grading/exams.py`, `app/routing/distribution.py`, `app/routing/grading_compat.py`, `app/routing/assignments.py`, `tests/test_grading_postgres.py`, `tests/test_assignments_postgres.py`, `tests/test_workflow_postgres.py` | 保留：连接池、事务复用和返回行处理 |
| `database._reusable_connection` | `database.py` 内部调用 | 保留：连接池、事务复用和返回行处理 |
| `database.transaction` | `app/workflow.py`, `app/grading/service.py`, `app/grading/exams.py`, `app/routing/distribution.py`, `app/routing/assignments.py` | 保留：连接池、事务复用和返回行处理 |
| `database.close` | `app/main.py`, `app/database/audit.py`, `app/database/logging_config.py`, `app/grading/reports.py`, `tests/test_grading_postgres.py`, `tests/test_assignments_postgres.py`, `tests/test_workflow_postgres.py` | 保留：连接池、事务复用和返回行处理 |
| `database.get_worker` | `app/database/course.py`, `app/database/decision.py`, `app/database/exam.py`, `app/database/label.py`, `app/database/rubric.py`, `app/database/staff.py`, `app/database/student.py`, `app/database/studentpaper.py` | 保留：连接池、事务复用和返回行处理 |
| `database.get_one` | `app/database/course.py`, `app/database/decision.py`, `app/database/exam.py`, `app/database/label.py`, `app/database/rubric.py`, `app/database/staff.py`, `app/database/student.py`, `app/database/studentpaper.py` | 保留：连接池、事务复用和返回行处理 |
| `database.get_all` | `app/database/course.py`, `app/database/decision.py`, `app/database/exam.py`, `app/database/rubric.py`, `app/database/staff.py` | 保留：连接池、事务复用和返回行处理 |
| `decision.get_grading_decision` | 无现行调用；见注释归档 | 停用：reports.exam_decisions is the reporting query |
| `decision.get_student_total_score` | 无现行调用；见注释归档 | 停用：reports calculates assignment totals with incomplete and no-show semantics |
| `decision.get_decision` | `app/grading/service.py` | 保留：评分查询、标签集编辑与分数同步 |
| `decision.get_decision_by_student_question` | `app/grading/service.py`, `app/routing/grading.py`, `tests/test_grading_postgres.py` | 保留：评分查询、标签集编辑与分数同步 |
| `decision.save_decision` | `app/grading/service.py` | 保留：评分查询、标签集编辑与分数同步 |
| `decision.update_decision` | `app/grading/service.py` | 保留：评分查询、标签集编辑与分数同步 |
| `decision.get_decision_label` | `app/grading/service.py`, `app/routing/grading.py` | 保留：评分查询、标签集编辑与分数同步 |
| `decision.add_decision_labels` | `app/grading/service.py` | 保留：评分查询、标签集编辑与分数同步 |
| `decision.add_decision_label` | 暂无跨文件调用 | 预留：评分查询、标签集编辑与分数同步 |
| `decision.remove_decision_label` | 暂无跨文件调用 | 预留：评分查询、标签集编辑与分数同步 |
| `decision._lock_decision` | `app/database/label.py`, `app/database/rubric.py` | 保留：评分查询、标签集编辑与分数同步 |
| `decision._validate_graders` | `app/routing/grading.py` | 保留：评分查询、标签集编辑与分数同步 |
| `decision._recalculate_score` | `app/database/label.py`, `app/database/rubric.py` | 保留：评分查询、标签集编辑与分数同步 |
| `exam.add_exam` | `tests/test_assignments_postgres.py` | 保留：作业创建与完整字段查询 |
| `exam.get_exam` | 无现行调用；见注释归档 | 停用：get_assignment(conn, exam_id) returns the full assignment row |
| `exam.get_course_exams` | 无现行调用；见注释归档 | 停用：get_course_exams(conn, course_ids) returns all assignment fields |
| `label.get_label` | `app/routing/rubrics.py`, `tests/test_grading_postgres.py` | 保留：deduction 编辑、重算与重评 |
| `label.add_label` | `app/grading/service.py`, `app/routing/rubrics.py` | 保留：deduction 编辑、重算与重评 |
| `label.edit_label` | `app/routing/rubrics.py`, `tests/test_grading_postgres.py` | 保留：deduction 编辑、重算与重评 |
| `label.remove_label` | `app/routing/rubrics.py` | 保留：deduction 编辑、重算与重评 |
| `label._change_label` | `label.py` 内部调用 | 保留：deduction 编辑、重算与重评 |
| `logging_config.__init__` | JsonFormatter 构造入口 | 预留：运行日志配置 |
| `logging_config.format` | logging.Formatter 协议回调 | 保留：运行日志配置 |
| `rubric.get_rubric` | `app/routing/rubrics.py` | 保留：rubric 配置和标签集编辑 |
| `rubric.get_rubric_labels` | `app/routing/rubrics.py` | 保留：rubric 配置和标签集编辑 |
| `rubric.add_rubric_label` | `app/grading/service.py`, `app/routing/rubrics.py` | 保留：rubric 配置和标签集编辑 |
| `rubric.add_rubric_labels` | 暂无跨文件调用 | 预留：rubric 配置和标签集编辑 |
| `rubric.remove_rubric_label` | 暂无跨文件调用 | 预留：rubric 配置和标签集编辑 |
| `rubric.update_rubric` | 无现行调用；见注释归档 | 停用：the maintained question/label editing APIs include score synchronization |
| `rubric._lock_rubric` | `rubric.py` 内部调用 | 保留：rubric 配置和标签集编辑 |
| `rubric.add_question` | `app/routing/rubrics.py` | 保留：rubric 配置和标签集编辑 |
| `rubric.edit_question` | `app/routing/rubrics.py` | 保留：rubric 配置和标签集编辑 |
| `rubric.remove_question` | `app/routing/rubrics.py` | 保留：rubric 配置和标签集编辑 |
| `staff.get_staff` | `tests/test_grading_postgres.py` | 保留：成员管理、权限及任务分配 |
| `staff.get_grader` | 无现行调用；见注释归档 | 停用：get_staff is the maintained profile API |
| `staff.get_grader_assignments` | 暂无跨文件调用 | 预留：成员管理、权限及任务分配 |
| `staff.assign_grader` | `app/grading/service.py` | 保留：成员管理、权限及任务分配 |
| `staff.update_assignment_status` | `app/grading/service.py` | 保留：成员管理、权限及任务分配 |
| `staff.add_staff` | `tests/test_grading_postgres.py` | 保留：成员管理、权限及任务分配 |
| `staff.add_staff_to_course` | `tests/test_grading_postgres.py` | 保留：成员管理、权限及任务分配 |
| `student.get_student` | `tests/test_grading_postgres.py` | 保留：roster 和学生资料维护 |
| `student.add_student` | `tests/test_grading_postgres.py` | 保留：roster 和学生资料维护 |
| `student.add_student_to_course` | 暂无跨文件调用 | 预留：roster 和学生资料维护 |
| `studentpaper.add_student_paper` | 暂无跨文件调用 | 预留：扫描件导入与备注维护 |
| `studentpaper.update_student_paper` | 暂无跨文件调用 | 预留：扫描件导入与备注维护 |

## 共用查询与清理结果

- [x] assignments / workflow / grading / rubric / reports / auth / seed 的业务 SQL 移入 database。
- [x] mapping 初始化、staff 角色、课程成员、扫描路径查询合并。
- [x] roster 查询使用当前迁移保证的 section / status 字段；过时探测保存在 `legacy_reference.py` 注释。
- [x] 停用旧 `Exam.get_course_exams`；新函数直接返回完整 assignment 字段。
- [x] 更新字段白名单与 SQL 构造统一在 database 中；删除接口运行时 DDL，字段由迁移 012 创建。
- [x] PostgreSQL 18：93 项测试全部通过，包含并发、回滚、审计和新增数据访问检查。

## 迁移映射

以下是原始文件行号，便于对照本次迁移；最终 API 见同目录 README。

- `assignments.py:32 -> course.courses_for_staff`
- `assignments.py:41 -> exam.get_course_exams`
- `assignments.py:69 -> staff.course_membership`
- `assignments.py:75 -> staff.staff_role`
- `assignments.py:85 -> exam.assignment_slugs`
- `assignments.py:92 -> course.course_code`
- `assignments.py:96 -> exam.create_assignment`
- `assignments.py:108 -> exam.delete_assignment`
- `assignments.py:116 -> exam.update_assignment_columns`
- `assignments.py:117 -> exam.get_assignment`
- `workflow.py:33 -> exam.lock_assignment`
- `workflow.py:37 -> exam.lock_assignment_for_staff`
- `workflow.py:58 -> workflow.seed_assignment_students`
- `workflow.py:69 -> exam.lock_course_assignments`
- `workflow.py:109 -> studentpaper.prune_ungraded_papers`
- `workflow.py:114 -> workflow.sync_student_statuses`
- `workflow.py:129 -> workflow.setup_readiness`
- `workflow.py:150 -> workflow.count_students`
- `workflow.py:213 -> workflow.set_assignment_status`
- `workflow.py:230 -> workflow.lock_student_status`
- `workflow.py:238 -> workflow.set_student_mark`
- `workflow.py:245 -> workflow.clear_student_mark`
- `workflow.py:256 -> workflow.student_progress`
- `workflow.py:264 -> workflow.students_progress`
- `workflow.py:283 -> workflow.assignment_progress`
- `workflow.py:300 -> exam.active_assignments`
- `grading/service.py:47 -> grading.set_lock_timeout`
- `grading/service.py:48 -> grading.set_statement_timeout`
- `grading/service.py:50 -> exam.lock_exam`
- `grading/service.py:51 -> staff.lock_exam_membership`
- `grading/service.py:60 -> rubric.lock_question`
- `grading/service.py:67 -> rubric.question_row`
- `grading/service.py:68 -> label.lock_question_labels`
- `grading/service.py:74 -> student.lock_exam_enrollment`
- `grading/service.py:79 -> grading.lock_mapping`
- `grading/service.py:86 -> studentpaper.paper_path`
- `grading/service.py:119 -> grading.assign_grader`
- `grading/service.py:139 -> grading.mark_question_for_regrade`
- `grading/service.py:148 -> grading.seed_question_mappings`
- `grading/service.py:152 -> grading.next_available_answer`
- `grading/service.py:159 -> grading.claim_answer`
- `grading/service.py:172 -> grading.release_answer`
- `grading/service.py:180 -> studentpaper.paper_path`
- `grading/exams.py:24 -> exam.lock_assignment_by_slug`
- `grading/exams.py:31 -> studentpaper.sync_scanned_papers`
- `grading/exams.py:37 -> grading.seed_exam_mappings`
- `grading/reports.py:55 -> reports.exam_info`
- `grading/reports.py:57 -> reports.exam_questions`
- `grading/reports.py:60 -> reports.exam_decisions`
- `grading/reports.py:62 -> reports.finished_answers`
- `grading/reports.py:65 -> reports.selected_label_details`
- `grading/reports.py:69 -> reports.exam_students`
- `routing/auth.py:58 -> staff.staff_exists`
- `routing/assignments.py:66 -> staff.staff_role`
- `routing/assignments.py:69 -> course.create_course`
- `routing/assignments.py:76 -> staff.add_course_member`
- `routing/assignments.py:87 -> course.course_row`
- `routing/assignments.py:112 -> 停用运行时 DDL，使用迁移 012_course_image.sql`
- `routing/assignments.py:120 -> course.update_course_columns`
- `routing/reports.py:23 -> exam.release_status`
- `routing/reports.py:66 -> reports.enrolled_contacts`
- `routing/rubrics.py:90 -> rubric.question_ids`
- `routing/rubrics.py:103 -> grading.seed_question_mappings`
- `routing/rubrics.py:139 -> grading.mark_question_for_regrade`
- `routing/rubrics_compat.py:42 -> rubric.insert_question`
- `routing/rubrics_compat.py:44 -> grading.seed_question_mappings`
- `routing/grading_compat.py:44 -> staff.lock_course_membership`
- `routing/grading_compat.py:48 -> grading.course_question_progress`
- `routing/grading.py:101 -> grading.seed_exam_mappings`
- `routing/grading.py:105 -> grading.exam_mappings`
- `routing/grading.py:114 -> grading.claim_available_answer`
- `routing/grading.py:127 -> grading.mapping_row`
- `routing/grading.py:137 -> grading.reassign_answer`
- `routing/grading.py:149 -> decision.enrolled_decisions`
- `routing/grading.py:154 -> label.exam_selected_labels`
- `routing/grading.py:187 -> decision.set_internal_note`
- `routing/distribution.py:161 -> course.course_id_row`
- `routing/distribution.py:164 -> course.course_by_code`
- `routing/distribution.py:194 -> student.upsert_roster_student`
- `routing/distribution.py:204 -> student.enroll_with_section`
- `routing/distribution.py:211 -> student.enroll_student`
- `routing/distribution.py:273 -> staff.course_role`
- `routing/distribution.py:300 -> staff.course_role`
- `routing/distribution.py:427 -> exam.save_template_path`
- `routing/distribution.py:567 -> decision.has_saved_decisions`
- `seed.py:23 -> course.ensure_course`
- `seed.py:27 -> course.course_id_by_term`
- `seed.py:36 -> exam.seed_assignment`
- `seed.py:43 -> staff.upsert_staff`
- `seed.py:48 -> staff.ensure_course_member`
- `seed.py:53 -> student.seed_student`
- `seed.py:58 -> student.enroll_student`
- `add_staff.py:20 -> staff.upsert_staff`
- `add_staff.py:25 -> course.ensure_course`
- `add_staff.py:29 -> course.course_id_by_term`
- `add_staff.py:32 -> staff.ensure_course_member`

## 基线测试问题

原分支复现 5 个失败：4 个写入测试以 TA 身份执行教师操作，1 个迁移预期漏掉 012。测试现使用保留原课程范围的 instructor fixture，并补入 012 预期；应用权限规则保持原样。

验证命令：`cd backend && GRADEFLOW_TEST_DSN=... .venv/bin/python -m pytest -q`。未改动前复现相同的 5 个测试设置失败，修正后全部通过。

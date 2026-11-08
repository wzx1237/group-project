# Gradeflow database layer

业务 SQL 集中在此目录。调用方使用 `fn(conn, ...)`，同一请求的多个函数共享同一个连接和事务。
本次重构以 `workspace_11_4` 的 `59cc9a1` 为基线；方法去留和后续需求见 [REFACTOR_PLAN.md](REFACTOR_PLAN.md)，当前签名见 [database_public_methods.md](database_public_methods.md)。

## 分层与选择

- `app/routing`：请求校验、身份、HTTP 状态和响应。
- `app/assignments.py`、`app/workflow.py`、`app/grading`：业务规则、状态流转、并发令牌、文件处理和响应整形。
- `app/database` 的模块函数：SQL、查询行、受限字段更新和锁。函数使用调用方传来的 `conn`，不创建池，不 commit / rollback，也不引入 FastAPI。
- `Database`：保留共享池、事务复用、审计上下文，以及已验证的评分 / rubric / label 写入口。部分兼容方法已转调共用函数，避免两份 SQL。
- `app/db.py`：启动时运行编号 SQL 迁移并创建应用池；这里的迁移 SQL 属于基础设施，保留在原处。

普通函数现在也覆盖原来的 39 个领域方法，包括 label 编辑、decision 标签集替换、分数重算和 question 编辑。各领域类仅保留兼容转发：旧调用仍经由 Database 获取审计连接，新调用直接传入 conn。函数内部只创建 cursor，不创建连接、不提交事务；跨领域重算也复用同一 conn。

```python
from app.database import label, grading

with database.audit_context(actor_ID=actor), database.transaction():
    with database.get_connection() as conn:
        label.edit_label(conn, label_id, title, description, deduction, exam_ID=exam_id)
        grading.mark_question_for_regrade(conn, exam_id, qid)
```

这组操作中的定义更新、受影响成绩重算、重评状态和审计 outbox 一起提交或回滚。重评标记仍由服务按业务场景决定，不在底层 edit_label 中自动增加。新抽取函数暂保留旧参数名（如 exam_ID），兼容原有调用约定。

## 模块索引

| 模块 | 负责内容 |
| --- | --- |
| `course.py` / `exam.py` | 课程、完整 assignment 行、slug、作业创建编辑、模板引用和作业锁 |
| `staff.py` / `student.py` / `studentpaper.py` | 成员与 enrollment、学生导入、扫描件同步、路径查询、保留已有成绩的清理 |
| `roster.py` | 按 course_id 或 code / term 读取 roster，包含当前 section / status |
| `grading.py` | 幂等 mapping 初始化、队列、认领、释放、重新分配、重评标记 |
| `workflow.py` | 学生状态同步、准备条件、进度汇总和状态持久化 |
| `rubric.py` / `label.py` / `decision.py` | rubric 与 label 查询、评分与标签集写入、分数重算 |
| `reports.py` | 报告所需原始行；汇总、成绩发布规则和 PDF 输出仍在服务层 |
| `queries.py` | 受限字段更新：字段白名单、Identifier 转义和值参数化 |
| `database.py` / `audit.py` | 池、事务复用、数据库审计触发器检查、提交后 JSONL 交付 |
| `legacy_reference.py` | 完全注释的旧兼容分支，仅供参考，不导入执行 |

## 使用方式

```python
from app.database import course, exam

# database 是应用 lifespan 中的 Database.from_pool(pool)。
with database.audit_context(actor_ID=actor), database.transaction():
    with database.get_connection() as conn:
        courses = course.courses_for_staff(conn, actor)
        rows = exam.get_course_exams(conn, [c["course_id"] for c in courses])
        exam.update_assignment_columns(conn, exam_id, {"exam_name": "Quiz Two", "due": None})
```

`conn` 需要来自使用 `dict_row` 的连接。读函数返回原始 dict / list[dict]；未找到的单行读取返回 None，列表读取返回 []。写函数通常返回 rowcount，带 RETURNING 的查询返回行，具体见函数签名。Decimal 和 datetime 留给服务层序列化。

一般请求通过 `Database.get_connection()` / `transaction()` 获取连接，保留审计元数据、模式检查和提交后交付；不要为了调用一个函数新建池。seed 和 CLI 仍管理各自的引导连接。函数本身不保证已经做过权限检查，服务必须先验证用户属于对应课程。

## SQL 与并发约定

- 所有值使用 psycopg 参数绑定；动态列只由领域层白名单产生并以 Identifier 引用。
- 不向数据层传 SQL 条件或锁字符串；readiness 和 edit 是有限的业务选项。
- mapping 初始化以 ON CONFLICT DO NOTHING 保留已有 owner 和状态。
- 保留服务原有的作业、成员、rubric、label、mapping、decision 锁顺序和 SKIP LOCKED 行为。
- 每个请求保持短事务；HTTP 乐观并发令牌仍在持锁期间校验。
- `get_course_exams(conn, course_ids)` 和 `get_assignment(conn, exam_id)` 返回完整 assignment 行，包含 blank_pdf、answer_key_pdf、total_points、status 和 released_at。
- assignment 编辑只允许 exam_name、kind、due、short；course 编辑只允许 code、term、title、image。空更新不写入；允许字段的 None 表示 SQL NULL，HTTP 层保留各接口原来的 omitted / null 规则。

## 分数同步与未来方法

现有评分规则没有改变：add 从 0 起，deduct 从题目满分起，加上选中 label 的有符号 deduction，再限制到 0 与满分之间。无选中标签时 score 为 NULL，表示尚未评分。

`Database.edit_label` / `remove_label` 和 `edit_question` 仍通过 `_lock_decision`、`_recalculate_score` 同步受影响的成绩；这些方法为之后改 deduction、改满分、同步成绩保留。业务上的重评状态与即时分数重算是不同操作，继续由原有服务协调。

没有跨文件调用但有明确用途的方法（批量标签集、单标签增删、学生 / staff 维护、试卷备注等）在 REFACTOR_PLAN 中逐项列出。恢复旧关系编辑时必须考虑分数同步，不应直接恢复绕过现有编辑入口的 SQL。

## 停用与兼容

以下未被现行代码调用的旧方法已停用，原始实现保留为所在模块内的注释：

| 旧方法 | 当前替代 |
| --- | --- |
| `Exam.get_course_exams` | `exam.get_course_exams(conn, course_ids)`，返回完整 assignment 行 |
| `Exam.get_exam` | `exam.get_assignment(conn, exam_id)` |
| `Staff.get_grader` | `Database.get_staff` |
| `Decision.get_grading_decision` | `reports.exam_decisions` 与现行报告逻辑 |
| `Decision.get_student_total_score` | 现行报告汇总，保留未完成 / no-show 语义 |
| `Rubric.update_rubric` | 现行 question / label 编辑入口，包含分数同步 |

roster 的 section / status 探测和接口中的运行时 ALTER TABLE 已停用；启动迁移 009、011、012 保证字段存在。旧兼容分支完整保存在 `legacy_reference.py` 注释中。恢复前应重新检查模式与测试。

## 迁移、审计和验证

本次没有新增或修改 SQL 迁移。启动使用 `app.db.migrate`；完整 schema 以 `app/migrations/*.sql` 为准。此目录旧说明提到的 schemas.sql、migrate_v2.sql 和独立审计测试文件并不随当前仓库提供，不应按旧说明操作。

审计仍由 PostgreSQL 触发器将修改与 outbox 同事务写入，提交后输出到 `GRADEFLOW_AUDIT_DIR`（默认 logs/audit）。交付失败保留待重试事件；外部消费者按 event ID 去重。`audit_context` 传入身份，`flush_audit` 可显式重试；保留现有故障处理行为。

运行测试（使用独立的 PostgreSQL 测试数据库）：

```bash
cd backend
GRADEFLOW_TEST_DSN=postgresql://... .venv/bin/python -m pytest -q
```

测试各自创建与删除隔离 schema。覆盖接口、角色权限、分数同步、并发、过期令牌、回滚、审计、状态流转、完整行、字段白名单和空更新。原分支已有 5 个测试设置问题；现已修正教师身份 fixture 与迁移 012 预期，未放宽应用权限。

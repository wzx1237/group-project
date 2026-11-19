# Gradeflow 页面与 filter 梳理

## Step 4：正式 frontend 实现（2026-11-19）

本分支以远端 `workspace_11_4` 的 `ca54d14c27e40eb5db2d929594f6df14525d1cbe` 为基础，根据最初 instruction、页面代码分析和最新 feedback 实施前端集成。独立 demo 用于对齐流程，本次没有复制 demo 的页面、示例数据或大尺寸 rubric。

### 已实现

- 保留原 `/courses` 页面、课程卡片和样式。考试处于 grading / in_review / closed 时，考试入口进入新的题目队列；draft / collecting 继续进入原上传和设置流程。
- 新增 `/courses/{courseId}/exams/{examId}/grading-queue` 与 `/grading-queue/{qid}/students`。题目、学生、状态、分数、grader 均通过现有后端 API 读取，没有硬编码演示数据。
- 原 `GradingFilterBar` 移到题目队列，继续使用 `gradingFilter.js` 的组合规则和 URL 参数。题目行进入对应学生列表；学生链接携带真实 qid、UID，现有 PDF 查看器按 `focusQid` 定位。
- 对有子题的题目，队列展示可独立批改的叶子题，每次 Submission 对应一个已有 SQL decision endpoint，避免把多个独立请求当成一次原子整题提交。
- `RubricPanel` 新增可选 `scopeQid`，只限制批改视图的呈现；完整 rubric 数据、题号和原 actions 仍保留。未传 scope 的原 rubric 编辑页继续显示全卷。选中子题时只保留同一父题的上下文和该子题，其他兄弟题不显示。
- 保留原 **Criterion、新增/编辑 criterion、Edit、Remove、Import rubric、split 和 Regrade** 控件及原有服务调用、错误反馈和重评分队列。没有用静态 demo 的简化 rubric 替代它们。
- 沿用原 `rubricPanel.module.css`，桌面 rubric 栏仍为 480px，标题 15px、criterion 11px、卡片原 padding。仅修正小屏 PDF 栏收缩和新增考试标签后的横向滚动。
- 原 `Next student` 替换成唯一一颗 `Submission`，旁边为 Back to students。保留原自动保存；Submission 等待已有请求，再通过原 PUT decision 接口确认当前题目的 criteria / comment / internal_note / version。保存失败或等待期间有保存失败时不返回、不宣称完成。
- 成功后返回同一题的学生列表，重新读取数据库状态并突出显示刚保存的学生。正常完成显示 Finished。已经在 regrade queue 的回答继续遵循后端现有规则，直到通过原 Review 流程确认后才离开 Need regrade；前端不伪造 Finished。
- queue API 的现有初始化逻辑负责补齐新匹配试卷的 mapping，普通入口和直接批改链接都先调用它。保留现有认证、课程访问检查、answer locks、版本冲突处理和 overall comment。
- 补齐 Upload、rubric 设置、Progress、ExamHeader、考试根路由与 regrade 返回入口。旧 `/questions` 仍是区域设置页，未覆盖。

### 主要实现位置

| 文件 | 用途 |
| --- | --- |
| `frontend/src/components/grading/gradingQueue.jsx`、`gradingQueue.module.css` | 真实题目 / 学生队列，复用现有 UI 组件与 filter |
| `frontend/src/hooks/useGradingQueue.js` | 初始化 mappings，读取 roster / decisions / progress，提交后及重新聚焦时刷新 |
| `frontend/src/lib/gradingQueue.js` | 叶子题选择与两套 API 状态映射 |
| `frontend/src/app/courses/[courseId]/exams/[examId]/grading-queue/` | 两个新路由，保留 Next.js Suspense 边界 |
| `frontend/src/app/courses/[courseId]/exams/[examId]/grade/page.jsx` | 单题入口、PDF focus、Submission 成功后的导航 |
| `frontend/src/hooks/useGradingSession.js` | 等待保存队列、失败传播、版本参数与重复提交保护 |
| `frontend/src/components/grading/rubricPanel.jsx`、`questionRubricCard.jsx` | 只缩小显示范围，保留原 rubric 编辑和 regrade 工具 |
| `frontend/src/components/grading/workspaceHeader.jsx` | 唯一 Submission 与返回学生列表 |
| `frontend/src/lib/routes.js` | 区分队列入口、学生列表与已选择答案的 workspace URL |

### 验证与范围

- `npm test`：37 项单元测试通过；覆盖原 PDF/filter/pickStudent 回归、新增/编辑 criterion、regrade、import、子题编号、保存等待、409/锁失败、重复点击与空 criterion。
- `npm run build`：Next.js 16.4.3 默认 Turbopack 生产构建通过；新增路由包含在构建输出中。
- `npm run test:e2e`：5 项真实 Chromium 浏览器测试通过，包含完整选题/选人/提交、原 rubric 功能、冲突失败、锁及无效入口、390px 窄屏布局与 PDF 显示。测试使用真实 Chromium、生成的示例 PDF、本地同版本 PDF.js handler 和 API fixtures，不连接真实学生数据或生产 SQL。
- 测试环境需要指定已有浏览器时可使用 `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium`；端口冲突时使用 `GRADEFLOW_E2E_PORT=3111`。
- `git diff --exit-code origin/workspace_11_4 -- frontend/src/app/courses/page.jsx frontend/src/app/courses/courses.module.css frontend/src/components/grading/rubricPanel.module.css` 通过，确认课程布局和原 rubric 样式未改。
- 本次只修改 frontend、相关测试及文档，没有 backend 或 SQL schema 改动，也没有向生产 SQL 写入测试数据。

下文为 step 1–3 的版本核对与分析记录；关于“仅 demo”的描述对应当时的阶段，当前实现以上面的 step 4 为准。


## Feedback 修订（2026-11-19）

本轮按用户提供的 `feedback.txt` 修改 demo，共两项：

1. **课程页保留仓库原布局**。移除首版 demo 新增的右侧流程说明、Open course 按钮和改版课程卡片。恢复 `/courses` 的学期分组、270–310px 课程卡片网格、124px 绿色 banner、卡片底部标题/课程代码/统计、TA badge、课程选项和 See older courses。顶部恢复原 TopNavbar 的居中 Gradeflow 与左侧 Courses 导航。样例仍为 CMSC250（TA 视角），所以按原逻辑不显示仅 instructor 可见的 Add course。
2. **批改页只保留一颗 Submission**。移除学生信息栏右侧的重复按钮，保留 rubric 底部、Save draft 旁的提交入口；提交后回到当前题目的学生列表并标为 Finished 的交互不变。

课程页视觉来源仍为下方基线 commit 的 `frontend/src/app/courses/page.jsx`、`courses.module.css` 与 `components/layout/TopNavbar.*`。`source/original-courses.css` 复制原 CSS，仅给 class 选择器加命名空间以免影响 demo 其他页。原有课程管理 API 不属于此 demo，课程选项会说明可在现有系统中使用。

本轮仅修订独立 demo；现有 Gradeflow 业务代码与 SQL 不变。以下源码分析依然以已核对的 `ca54d14c` 为基线，不代表本轮重新选择了业务分支版本。

## 核对版本与本次范围

- 仓库：<https://github.com/wzx1237/group-project>
- 目标分支：`workspace_11_4`。
- 本次实际核对的远端 HEAD：[`ca54d14c27e40eb5db2d929594f6df14525d1cbe`](https://github.com/wzx1237/group-project/commit/ca54d14c27e40eb5db2d929594f6df14525d1cbe)，`update the changes`。
- 作者和提交者时间均为 **2026-11-19 09:56:44，America/New_York（UTC−05:00）**，符合用户要求的“今天的最新 commit”。使用 `git ls-remote` 核对当前远端，再 fetch 该分支读取 commit；没有把本地旧 main 当作依据。Git commit 时间是提交时间，不声称掌握 GitHub push 事件的精确时间。
- 远端 `main` 为 `bc1e847668b65202b16d9d54f4408aebfafc582f`。本次在最新分支的独立工作树中阅读，原 checkout 的 `work` 分支保持不变。
- 用户在聊天中明确要求：找到今天的最新提交才继续，并完成附件的 suggested step 1–3。附件用于说明这些步骤和目标交互；step 4 的正式集成属于之后确认 demo 的阶段。
- 已完成：页面映射、filter 逻辑分析、可点击 UI demo。没有修改现有 frontend/backend、数据库、main 或远端业务分支。

以下代码路径与行号均以此 commit 为准。不是对 main 的分析。

## Step 1：现有页面代码在哪里

| 用户称呼 | 实际路由 / 组件 | 关键行与当前作用 |
| --- | --- | --- |
| Course page：课程列表 | `frontend/src/app/courses/page.jsx`，`/courses` | `CourseTile` 从第 78 行开始；`CoursesDashboardPage` 第 432 行开始；第 706–710、750–754 行的卡片导航进入 `/courses/{courseId}`。 |
| Exam page：所选课程的考试列表 | `frontend/src/app/courses/[courseId]/page.jsx`，`/courses/[courseId]` | 第 11–15 行读取 course/assignments；第 43–50 行渲染 `CourseCard`。页面标题虽然仍写 Courses，实际内容是这个课程的 assignments。 |
| 考试列表的实际渲染与链接 | `frontend/src/components/dashboard/courseCard.jsx`；`examRow.jsx` | `courseCard.jsx` 第 39–52 行构建课程和考试数据，第 96–99 行生成 ExamRow，目前指向 `/upload`；`examRow.jsx` 第 8–23 行渲染考试行。 |
| 单个 exam 的根路由 | `frontend/src/app/courses/[courseId]/exams/[examId]/page.jsx` | 第 6–14 行只是跳转组件，第 11 行重定向到 `/upload`，不是考试列表。 |
| 当前考试入口 / 上传和匹配 | `frontend/src/app/courses/[courseId]/exams/[examId]/upload/page.jsx` | 第 43–49 行 ExamHeader；第 59–86 行扫描上传与匹配；第 91–93 行 Open grading 直接进入 `/grade`。 |
| Grading page | `frontend/src/app/courses/[courseId]/exams/[examId]/grade/page.jsx` | 第 26–44 行加载 rubric、queue、session；第 59–68 行学生头部与上一位/下一位；第 79–89 行 filter；第 99–148 行左侧 PDF、右侧 rubric。第 157–163 行导出页面。 |
| Next student 按钮 | `frontend/src/components/grading/workspaceHeader.jsx` | 第 23 行定义 props；第 51–63 行显示 Previous、位置和 Next student；当前 Next 调用父页面传入的 `session.goTo(index + 1)`。 |
| Rubric 列表 | `frontend/src/components/grading/rubricPanel.jsx` | 第 42–54 行只折叠非当前题并滚动；第 89 行仍取全部 top-level questions；第 199–214 行仍渲染全部题目的卡片，因此其他题目标题会留下。 |
| 已存在的 `/questions` | `frontend/src/app/courses/[courseId]/exams/[examId]/questions/page.jsx` | 第 16–24 行定义 `QuestionsAndRegionsPage`；第 75–91 行是 RegionCanvas / QuestionList、画题目区域和继续 rubric setup。它是考试设置页，不是新增的批改队列。不能直接覆盖。 |

关键源码可直接查看：[课程列表](https://github.com/wzx1237/group-project/blob/ca54d14c27e40eb5db2d929594f6df14525d1cbe/frontend/src/app/courses/page.jsx#L432)、[考试列表](https://github.com/wzx1237/group-project/blob/ca54d14c27e40eb5db2d929594f6df14525d1cbe/frontend/src/components/dashboard/courseCard.jsx#L96)、[批改页面](https://github.com/wzx1237/group-project/blob/ca54d14c27e40eb5db2d929594f6df14525d1cbe/frontend/src/app/courses/%5BcourseId%5D/exams/%5BexamId%5D/grade/page.jsx#L26)。

### 附件中的两张页面

`gradeflow-pages.zip` 实际包含 `index.html`、`students.html`、`style.css`、`script.js`，没有额外包裹目录。

- **Question page**：`index.html`。HTML 自身只有 header、`main#app`、共享 grading dialog，题目列表由 `script.js` 的 `render()` 非 students 分支生成。显示 8 道题、21 位示例学生、Pending / In progress / Need regrade / progress。
- **Student page**：`students.html?question=3`。它与 index.html 的 HTML 内容一致，由 `render()` 根据 `location.pathname.endsWith('students.html')` 选择学生列表；`qid()` 从 `?question=` 取题号；`rows()` 生成学生行。
- 点击题目会进入 `students.html?question=N`；点击学生调用 `openGrade(i)`，目前只是一个 dialog，不是现有 Gradeflow 的 grading page。
- `save(status)` 把 `${question}-${studentIndex}` 的状态、分数、comment 存到 `localStorage['gradeflow-queue-demo']`。这是浏览器 demo，不是 SQL。
- ZIP 的数据为 8 道离散数学题、每题 21 位学生；总分 100、总回答数 168。Demo 保留这些示例内容、青绿色视觉、摘要卡、状态 badge、题目/学生表格，并补齐前后页面。

### 对目标流程的理解

目标为：**课程列表 → 课程考试列表 → 题目批改队列 → 当前题目学生列表 → 当前学生当前题的批改页面 → 提交后回到同一题的学生列表**。

附件 preferred behavior 第 3 点重复写“choose a course”；结合前后步骤和页面内容，解释为“选择考试后进入题目列表”。这是文意判断，在 demo 中按此串联。

建议正式集成时使用：

```text
/courses
/courses/{courseId}                                  # 考试列表
/courses/{courseId}/exams/{examId}/grading-queue       # 新题目批改队列
/courses/{courseId}/exams/{examId}/grading-queue/{qid}/students
/courses/{courseId}/exams/{examId}/grade?q={qid}&student={uid}
```

保留既有 `/questions`、`/upload`、`/rubric` 等设置与管理功能。考试已进入 grading 时才把批改入口指向新队列；draft / collecting 等原有生命周期入口仍按状态处理。所有现存进入 `/grade` 的链接在 step 4 中统一检查，避免漏过中间步骤。

## Step 2：Filter 的完整逻辑

### 组件与数据流

1. **控件**：`frontend/src/components/grading/gradingFilterBar.jsx:33`。第 54–150 行分别提供 question、graded/ungraded、grader、criterion、score、regrade 控件。改变 question 时清除旧 criterion 和特定 queue；把 score 切换时清除 min/max。Clear 调用 `onChange({})`。
2. **规则**：`frontend/src/lib/gradingFilter.js:7` 定义 URL key：`q, status, grader, criterion, score, min, max, regrade`。第 20–26 行序列化；第 29–36 行解析题目范围与 criterion；第 38–65 行做匹配。
3. **会话**：`frontend/src/hooks/useGradingSession.js:19`。第 23 行从 URL 读 `student`；第 24 行读 filter；第 31–38 行加载有 submission 的 roster 和全体 decisions；第 43–55 行在 rubric / queues 等加载齐后筛选学生；第 152–164 行把 filter、student 写回 URL。
4. **稳定队列**：同一个 filter 的匹配 UID 集在第 41–55 行固定下来，保存不会让当前学生从 Previous/Next 列表中立刻掉出。这适合当前逐人翻页，但新学生列表从批改返回后应该重新取数据和计算状态。

### 匹配语义

- 未选 q：遍历所有可批改叶子题；选父题：遍历其子题；选叶子题：只匹配该题。
- `matches()` 对题目使用 **some**：学生只要有一道范围内的题满足所有条件，就进入结果。每道题内部各条件是 **AND**，不是每个条件分别从不同题凑齐。
- graded / ungraded 根据 `appliedCriteria(question, decision).length > 0` 判断，不是单看 decision 是否存在，也不是把所有 question-progress 状态等同于 graded。
- grader 和 score 只匹配已经 applied criteria 的回答。criterion 按 label ID 包含关系匹配，包括历史 split criterion。
- score 支持 `<25% / <50% / <75%`、full、zero、`range`。百分比按该题 `total_score`；范围上下界含边界，缺省边界不限制。
- regrade 为 `waiting` 时匹配当前题上任意待重评分队列；指定 ID 时只匹配对应队列，并检查该学生仍在 `pending_student_uids` 内。
- **当前 filter 不包含 section**。不要把 section 误认成这个控件已经可用的功能；`backend/app/routing/grading.py:146–149` 的 queue endpoint 仍会拒绝 section 参数。

### 自动定位区域为什么可复用

`grade/page.jsx:106` 把 `session.filter.q` 传给 PDF 的 `focusQid`，第 129 行也传给 rubric。

`frontend/src/components/grading/pdfCanvasViewer.jsx:34–36` 使用题目自身 region，缺失时使用首个有 region 的子题；第 60–79 行获取目标 `{page,x,y,width,height}`，等待目标页之前各页渲染完，再按 normalized y 定位滚动；第 83、91–93 行在题目/试卷变化和页面渲染时执行定位。

因此，学生列表导航时带上 **实际 rubric 的 qid** 与 UID，例如：

```text
/courses/{courseId}/exams/{examId}/grade?q=Q3&student=119204001
```

这里的 `Q3` 只是示例。正式实现必须传数据库真实 qid，不应把显示序号当主键。没有 region 时应明确显示“此题尚未设置区域”，仍能打开试卷，不能虚报已自动定位。

### 为什么只给 focusQid 还不够

`rubricPanel.jsx:44–54` 只折叠其他题。第 199 行仍对所有 top-level 题目 map，所以其他题的标题没有消失。正式批改模式需只渲染所选题目树，并正确处理父题/子题；rubric 编辑模式仍保留全卷。应保持完整 rubric 数据、总分与权限元数据，仅控制批改视图的可见范围，避免不慎改变其他共享组件行为。

### 保存与 Finished 的接入点

- `useGradingSession.js:166–188` 当前在点击 criterion / 保存 notes 时即调用 API，并串行排队，不是由 Next student 提交。
- `frontend/src/services/gradingDecisionService.js:25–30` 调用 `PUT /assignments/{examId}/submissions/{studentUid}/questions/{qid}/decision`，提交 `criteria, comment, internal_note, version`。分数由 criterion 计算，不应改成自由 score override。
- `backend/app/routing/grading.py:244–262` 检查权限、answer lock、version 后保存；`backend/app/grading/service.py:112–142` 沿用事务、label 校验、grader assignment 和 mapping 状态更新。
- `GET /assignments/{examId}/question-progress` 在 `routing/grading.py:180–186` 返回每题以及每学生每题状态；`fetchExamProgress()` 在 service 第 19 行。现有 queue API 把 finished 映射为 done，而 progress 的 answers 使用 finished；UI 要统一映射为 Finished，不能混用大小写和两套枚举。

**Step 4 的建议**：当前题目先保留本地草稿；点击 Submission 时提交当前题的 criteria / feedback / internal note，等待成功响应，再刷新该题学生列表、释放锁并返回。若保留现有自动保存，也需要明确“保存草稿”和“完成提交”的语义，避免一点击 criterion 就提前标为 Finished。保留服务器端权限、锁、409 冲突与 version 检查，按钮不能绕过它们。

特别注意 `useGradingSession.js:229–241` 的 `enqueue()` 会 catch 保存失败并重新加载，然后 resolve；因此不能简单 `await session.saveNotes(...); router.push(...)` 就宣称提交成功。正式实现必须把“服务器确认保存成功”暴露给提交动作；失败时留在批改页面并显示错误，不能先把学生标为 Finished。若父题有多个独立子题，需定义全部成功后的 Finished 条件，必要时使用事务端点，不能凭单个子题成功就标整题完成。

权限仍以服务端为准。UI 隐藏无关 rubric 不是访问控制；demo 不模拟真实 TA 分配权限。

## Step 3：UI Demo 的内容与使用

打开 `index.html`，按下面路径检查：

1. Courses：点击原布局中的 CMSC250 课程卡片。
2. Exams：点击 Midterm 2 的 Open questions。
3. Grading queue：保留原附件的 8 题列表与统计；原 grading filter 的入口移到此处，可组合题目、状态、grader、score、criterion、regrade。点击某题的 View students。
4. Student responses：保留附件的 21 位学生、状态标签、搜索、Start next pending。点击学生或 Open response。
5. Grading workspace：左边用示例试卷呈现所选题目区域，右边只显示该题 rubric。支持区域显隐、缩放、criterion、反馈和内部备注。
6. 未选 criterion 点击 Submission 会提示选择 criterion；Full credit 为明确的满分选项。提交后只更新这个学生这道题，返回相同题目的列表，显示 Finished；Save draft 显示 In progress。
7. 返回题目列表 / 考试列表时，各级进度重新计算。刷新页面后，浏览器允许 localStorage 时会保留 demo 记录。Reset sample data 恢复示例数据。

### Demo 的实现与明确边界

- 独立静态 HTML，无外部字体、JS、图片或网络 API 依赖。压缩包解压后双击 `index.html` 可浏览。使用 hash 路由，因此本地打开与静态托管都能跳转、刷新和使用浏览器返回。
- 使用原附件中的示例题目和姓名。所有数据是示例；试卷由文本模拟，没有加载真实扫描件。
- **没有调用 SQL、没有登录认证或真实权限实现、没有变更现有 Gradeflow 系统**。localStorage 被浏览器禁用时退回内存，并提示只在本会话保留。
- 为评审提交效果，提交后清除 response filters / search，回到所选题目的 All students，并保留完成提示，确保刚提交的 Finished 行可见。正式集成可根据评审选择保留筛选并固定展示刚完成记录。
- 原 filter 的 graded/ungraded 和 progress 的四状态不是一套语义。Demo 使用四个面向用户的状态，score 筛选仅匹配 Finished；展示交互而非重新实现生产查询规则。接入时应复用已分析的生产规则并明确状态映射。
- Demo 的 criterion 名称和扣分是示例，不能导入替换已有 rubric。显示序号、题目、区域和分数均按选中题联动。

### 验证

验证结果见随附 `validation.md`：包含五级导航、全部八题的独立 rubric、必选 criterion、提交返回与状态、草稿、进度一致性、刷新持久化、搜索与筛选、存储不可用回退和无外部运行依赖检查。

本环境未提供 Sites 的 `cua_repl.js` 与 `sites-preview`，没有运行可视浏览器截图检查；DOM 交互检查不能代替真实浏览器的视觉确认。Demo 提供桌面/窄屏 CSS 布局，视觉细节留待用户直接打开评审。

**Step 1–3 的设计评审已完成；本分支正式 frontend 接入见文首 Step 4。**

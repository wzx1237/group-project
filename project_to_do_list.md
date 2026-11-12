# Project To-Do List & Sprint Action Items

## High Priority (Critical Rubric Feedback)

*Items highlighted by the instructor as major gaps or critical areas for final delivery.*

* [x] **Complete Regrade Routes:** Implement and thoroughly test all regrade routes (noted as the most prominent functionality sought by the customer).
* [x] **Grader Workflow & Concurrency Locking:** Implement and verify robust concurrency locking when an exam or question is fed to a TA or instructor. Prevent race conditions and simultaneous edits when multiple graders work concurrently, with clear lock ownership, handling transitions vs. collisions, and release mechanisms.
* [ ] **Fix Demo Glitches:** Identify and resolve the small defects observed during the grading demo ("needs lots of serious shaking out").
* [ ] **Code Cleanup (Claude Report):** Review and implement the code quality and architecture suggestions from the Claude report before final delivery.
* [ ] **Spec Addendum / Alignment:** Document any small, understandable differences between the current system and the original specification (e.g., via an addendum to the spec) to ensure 100% consistency at final delivery.

## New Features & UI Improvements (Team Notes)

### Grading Workspace

* [x] **Flexible Exam & Question Filtering:** Implement a flexible filtering mechanism in the grading view so graders are not forced to sequentially skip through all exams:
  * [x] **Filter by Grading Status (Ungraded):** Option to show only exams where a given question (e.g., question #X) has not been graded yet, allowing graders starting late to jump directly to unassigned/pending work without skipping.
  * [x] **Filter by Specific Grader (TA Filter):** Option to show only exams for question #X that were graded by a specific TA (e.g., "graded by TA X") so TAs can review their work if grading criteria were misinterpreted.
  * [x] **Filter All Graded for Question:** Option to view all exams already graded for question #X by any grader to review grading consistency across the team.
  * [x] **Filter by Score Thresholds / Criteria:** Filter exams for question #X based on score conditions (e.g., score < 50%, specific point ranges, or specific deductions applied) to review low scores and evaluate rubric adjustments.
  * [x] **Filter for Regrade & Rubric Tweaks:** Filter exams affected by rubric revisions when point deductions are modified, enabling targeted reevaluation rather than reviewing every submission.
* [x] **Progress Bar:** Add a grading progress bar per question. *(Done on `per-question-progress-bar`: a bar with "N / M graded" and a regrade badge at the bottom of each question card on the grade page, plus a **Progress** tab, next to Upload, Analytics and Reports, with tables by question and by student, backed by `GET /assignments/{id}/question-progress`.)*
* [x] **Auto-Advance on "Open Grading":** When an exam state changes from `in progress` to `graded`, the "Open Grading" button should automatically skip to a student whose exam hasn't been graded yet. *(Done on `jump-open-grading`: with no student in the URL, the grade page opens the first student who is not fully graded, or the first student if all are. A student named in the URL is kept, and Next student is unchanged.)*
* [x] **Splitting Criterion:** Implement splitting criterion based on the Grading Workspace Figma design (`Row 3, Col 6`).
* [x] **Import Previous Rubric:** Build a way to import a previously used rubric into the workspace. *(Copy questions/criteria from prior assignments across the user's courses or via Markdown import/export inside [`RubricPanel`](frontend/src/components/grading/rubricPanel.jsx) on both the grading workspace and setup/edit wizards, backed by `GET /api/rubrics/sources`, `POST /api/assignments/{id}/rubric/copy`, `POST /api/assignments/{id}/rubric/import`, and `GET /api/assignments/{id}/rubric/export`.)*
* [X] **Toggle feature for regions:** Add a toggle to show/hide the regions


### Student Reports, Exporting & ELMS Integration

* [ ] **Configurable Result Distribution by Assignment Type:** Support different delivery workflows depending on assignment type: physical printout and stapling for in-person exams returned in discussion vs. paperless electronic delivery (ELMS comments/messages or email) for worksheets and homeworks where printing full-credit slips is wasteful.
* [ ] **ELMS (Canvas) Integration:**
  * [ ] **Upload Scores to ELMS:** Interface with the ELMS/Canvas API to push graded scores into the gradebook.
  * [ ] **ELMS Submission Comments:** Post scores and feedback comments directly to student assignment submissions in ELMS (Canvas submission comments API).
  * [ ] **ELMS PDF Report Attachments:** Attach the generated PDF student report directly to each student's assignment submission comment in ELMS.
  * [ ] **ELMS Messaging:** Support sending student results via ELMS internal messages as an alternative to external email.
  * [ ] *Customer Reference Scripts:* Consult instructor's existing Python/shell automation scripts for ELMS authentication, submission comment APIs, and attachment handling.
* [ ] **Email Reports to Students:** Implement functionality to email reports directly to students as an alternative delivery channel.
  * [ ] *Research Task:* Investigate how automated email sending works with bots/services (e.g., SMTP, SendGrid, AWS SES, or university mail servers).
* [x] **Download by Section:** Add feature to download student reports grouped/filtered by section.
* [x] **Include Section Number:** Add the student's section number to the printed-out student report.
* [ ] **Add section Number:** Add the option to assign a section number to a student that doesn't have one/be able to change sections as well.

## Technical Debt & Engineering Practices

*Ongoing goals based on the "Implementation" rubric criteria.*

* [ ] **Manage Dependencies:** Ensure configurations are actively managed and capture essential dependencies without bloat.
* [ ] **Traceability:** Verify that components support traceability to tests and the project specification.
* [ ] **Maintain Sustained Development:** Keep git commit history and development records consistent and active leading up to the final delivery.
* [ ] **Check how/where the uploaded PDFs (file paths, check file structure and make sure it's in a certain order)


# Gradeflow TODO – Acceptance Testing Round 1

Feedback from Herman's first real-world run (60 scanned exams, one course). Items are grouped into a summary, small fixes, and large fixes. Checkboxes track progress.

---

## 1. Summary of Issues

**Scan / ID recognition**
- UID recognized on only 1 of 60 uploaded exams. Herman suspects the ID box he drew was too large and captured text below the nine boxes. Possibly also related to exams being photocopied on colored paper (untested).

**Exam splitting**
- Some exams were split incorrectly: a 6-page exam became 10 pages (it absorbed the first 4 pages of the next student's exam), and the remaining 2 pages were treated as a bogus new exam with no nine ID boxes.

**Unmatched scans / dropped students**
- Students who dropped after the exam are not in the updated roster, so their scans can't be matched. Unclear if unmatched exams do any harm.
- Grading cannot start while any scan is unmatched; the only workaround is matching to bogus students. No way to delete unmatchable scans.
- The "Not ready for grading. N scans are waiting to be matched" popup does not clear after the scans are matched (confusing).

**Criteria**
- Criterion title appears capped at 51 characters; should be considerably longer.

**Score export / gradebook / ELMS**
- No obvious way to get scores out after grading (Herman later found Export CSV under Reports, but did not expect it there).
- Unclear whether ELMS integration is still planned. Integration would remove the need to email students results and could upload scores directly. Not mandatory, but would solve several problems. A CSV export remains useful regardless.

**TA visibility**
- Instructor cannot see what happens when TAs grade; TAs are identified only by directory ID/email. A name for TAs would help.

**Per-student reports**
- Can only download all PDFs or all PDFs for a section. Need to download a single student's report (e.g., after a regrade of one exam).

**Formatting / minor UX**
- "Progress by student" list sorted by first name; should be last name, first name.
- No section-level analytics (average, etc.); alternatively, CSV should include each student's section.
- PDF layout: total score should be larger and more prominent; student name larger and at top with the assignment name below in a smaller font.
- "Graded"/"Not graded" label floats because it sits to the right of variable-length student names; should be in a fixed location while paging through exams.
- Filenames contain spaces (awkward on UNIX); use dashes or underscores.

---

## 2. Small Fixes / To Do

- [x] **Clear stale popup errors**: Dismiss/refresh the "Not ready for grading. N scans are waiting to be matched" message once the scans are matched (or compute it live rather than persisting it).
- [x] **Raise criterion title limit**: Remove the 51-character cap (frontend input `maxLength` and backend validation/DB column); allow considerably longer titles and make sure the UI wraps/truncates them gracefully.
- [x] **Sort "Progress by student"** by last name, then first name (instead of first name).
- [x] **Fixed-position Graded / Not graded indicator** in the grading view so it does not move with student name length (e.g., pin to a fixed spot in the header).
- [x] **PDF header redesign**: Student name larger and at the top; assignment name below in smaller font; total score in a larger, more prominent font.
- [x] **Filenames without spaces**: Replace spaces with dashes/underscores in all downloads (score CSVs, student report PDFs, zip/bulk PDFs, etc.).
- [x] **Include section in exported CSV**: Add a Section column per student so analytics by section can be done externally.
- [ ] **Make Export CSV discoverable**: Add a clear Export CSV entry point (e.g., on the assignment page after grading finishes), in addition to its current place under Reports.
- [ ] **TA display names**: Capture and show a name for TAs (alongside directory ID/email) wherever grader identity is displayed.
- [ ] **Clarify unmatched-exam behavior** in the UI/help text (what happens to scans from dropped students; whether unmatched scans affect anything).
- [ ] **Basic per-section analytics** (average, etc.) on the analytics page (can be a small table; the CSV section column above is the fallback).
- [ ] **Download a single student's report PDF** from the student's grading/report view (in addition to all / per-section downloads).
- [x] **Split review "Neither"** (found while testing): Choosing Neither when reviewing a split criterion can now be saved.

---

## 3. Large Fixes / To Do

- [ ] **Fix UID/ID-box recognition (high priority)**: Only 1 of 60 exams recognized. Investigate:
  - ID region too large / capturing text below the nine boxes (make detection tolerant of or constrain to the nine-box row; consider letting instructors re-adjust the ID region and re-run recognition).
  - Behavior on photocopied/colored paper (test with colored-paper scans; add thresholding/contrast normalization for non-white backgrounds).
  - Add a test set including colored-paper and oversized-ID-region scans.
- [ ] **Fix exam page splitting**: Exams are being split incorrectly (6-page exam became 10 pages + a 2-page bogus exam). Improve boundary detection (e.g., use first-page/nine-ID-box detection or a known pages-per-exam value from the template) and validate that page counts match the template; flag mismatches for review.
- [ ] **Handle unmatched / bogus scans**: 
  - [x] Add a **delete** (and ideally reassign/merge) action for unmatched or bogus scans. *(Delete done: Remove on the Upload page. Merge not done.)*
  - Allow grading to start despite unmatched scans (e.g., confirmation warning, or exclude them), instead of hard-blocking.
  - Provide a way to re-upload / re-process only affected exams, and to move pages between scans (split/merge) to repair bad splits.
- [ ] **Gradebook/score export & ELMS integration**:
  - Provide a reliable score export (CSV) after grading completes, prominently available.
  - Decide with Herman whether to pursue ELMS integration (upload scores and/or results directly to ELMS, avoiding emailing students); if yes, scope formats and API/CSV-import approach. Not mandatory, but desirable.
- [ ] **TA activity visibility for instructors**: Audit/activity view showing who graded what and when, with TA names (depends on TA display names above).

---

## 4. Exam Splitting / Cover Detection (Known Issue, Patch, and Proposal)

### The issue
Exams are split into individual students by detecting each exam's cover page (page 1, with the student info / UID box). Detection (`CoverDetector` in `backend/app/services/cover_detector.py`) template-matches printed "anchor" regions derived from the blank exam against every scanned page; a page scoring at or above the threshold starts a new exam. The cover identifier has two parts: the printed anchors (ruled lines around the student info box / ID panel) and the nine UID boxes.

Anchors were derived only from printed lines *outside* the ID panel and UID grid. On mostly-text first pages (e.g., worksheets) the only printed lines are the ID panel itself, so anchor derivation failed with an error. Even where it works, anchor matching is sensitive to scan quality, paper color, and ID-region size, which is a likely contributor to Herman's bad splits (6-page exam becoming 10 pages + a 2-page bogus exam) and the 1-of-60 UID recognition.

### Current fix / patch (commit `f65f5f0`, "Accept blank exams whose only printed lines are the ID panel")
- In `analyze_blank_exam` (`backend/app/cover_templates.py`), if `derive_anchors` raises `ValueError`, fall back to anchoring on the ID panel's printed border, keeping clear of the UID grid only.
- The line map ignores handwriting, so the printed panel border is a stable anchor.
- Related earlier work: `dc32b4b` added per-assignment UID box selection at exam setup (instructor drags a box around the nine UID boxes or marks page 1 as a cover; backend snaps to the grid and derives anchors).
- **Status:** fixes blank-exam setup failing for text-heavy covers. It does **not** yet make splitting robust on real scans (colored paper, oversized regions, bad scans) and has not been validated against Herman's 60-exam batch.

### Proposed idea: unique watermark on each cover page
Add a machine-readable watermark that is unique to the cover page, so we know with certainty when an exam should split instead of relying on fuzzy template matching.

- [ ] **Design the watermark**: A printed mark (e.g., QR code / barcode / distinctive glyph pattern) placed in a fixed, low-clutter spot on the cover page, generated by Gradeflow and stamped onto the blank exam PDF the instructor downloads for printing.
- [ ] **Make it unique per page type or per exam**: At minimum a "cover page" marker tied to the assignment ID (so cover vs. non-cover pages are unambiguous). Optionally a per-copy serial so every printed exam is individually identifiable.
- [ ] **Split on the watermark**: Treat a detected watermark as the definitive start of a new exam; use it first, fall back to the existing anchor/UID detection if it is missing or unreadable.
- [ ] **Validate page counts**: Compare pages between consecutive watermarks with the template's page count; flag mismatches (extra/missing pages) for instructor review rather than silently creating bogus exams.
- [ ] **Robustness**: Make the mark readable on photocopies, colored paper, skew/rotation, and low-contrast scans; test with Herman's colored-paper copies.
- [ ] **Possible bonus**: A per-copy serial could pre-identify the student (if exams are pre-assigned) or detect duplicate/missing exams.
- [ ] **Open questions**: Where to place the mark so students don't write over it; whether instructors must reprint exams with the watermark (it only helps for exams printed *after* it exists, not Herman's existing batch); how it interacts with the existing blank-exam upload flow.

---

## 5. Collaborative Labs / Worksheets (Revised after Meeting)

> **Revision:** Earlier this section proposed a primary-plus-partner model (`partner_uid` on `studentpaper`, one paper graded once and the score copied to the partner). The client clarified that this is **not needed**: every student gets and submits **their own paper** (a worksheet). Students are told to work together, but each paper is **graded separately**. The partner/group data model is dropped.

### The need
- Add a **worksheet** assignment type.
- Everyone gets their own worksheet and is told to collaborate, but papers are graded individually, so the existing one-paper-per-student model already fits.

### What is not needed (dropped)
- ~~`partner_uid` column / migration `012_studentpaper_partner.sql`~~
- ~~Partner picker at scan matching, copying scores to partners, pairing in progress/CSV/PDF/analytics, shared regrades~~
- ~~A group table (`submission_group`)~~
- No change to grading tables, matching, exports, or analytics for pairs.

### What is needed
- [ ] **Add `worksheet` to assignment kinds.** `assignment.kind` has a CHECK constraint (`006_assignment.sql`) allowing `exam`, `final exam`, `homework`, `lab`, `quiz`, `essay`, `other`. Add a new migration that drops and recreates the constraint to include `'worksheet'`.
- [ ] **Add `worksheet` to the frontend kind list** (`KINDS` in `frontend/src/components/exam-setup/blankExamUploadStep.jsx`) and anywhere else kinds are listed or displayed (labels, filters, badges).
- [ ] **Check kind-specific behavior.** Confirm nothing in the backend/frontend branches on `kind` in a way that would mishandle `worksheet` (e.g., defaults for cover detection, release, or reports).
- [ ] **Worksheet cover pages.** Worksheets are mostly text with few printed lines; this is the case the cover-detection patch (section 4) addresses. Test a real worksheet end to end (blank upload, scan split, UID match). The watermark proposal in section 4 would help here.
- [ ] **Decide whether `lab` stays.** Keep it as is, or treat `lab` and `worksheet` as equivalent; confirm with the client which they use.

### Open questions for the client
- [ ] Is a worksheet always single-paper-per-student, with no shared grading ever? (Assumed yes from the meeting.)
- [ ] Should any report or export show who a student collaborated with? (Assumed no.)



## 6. Section Features

### Current state
- `enrollment.section` (free text, per student per course) is stored (`009_enrollment_section.sql`).
- **Works:** roster CSV import and manual add (optional section field), section shown on the roster page, reports page section filter and column, per-section and grouped-by-section report zips, and "Section X" in the report PDF header.
- **Not done:** the items below. The first two are also listed in section 2 and are repeated here so every section task is in one place.

### To-do items

- [x] **Add Section column to `grades.csv`** (also in section 2)
  - *Why:* Herman wants to compute analytics by section from the CSV.
  - *What:* In `grades_csv` (`backend/app/routing/reports.py`), add a `Section` column. `reports_db.enrolled_contacts` currently returns name/email/uid only, so extend that query to also select `en.section` (it is already available in `database/reports.py` and `database/roster.py`). Leave blank for unassigned students.

- [ ] **Enable the grading queue section filter** (completes the "Sort by Section" item in `todo_cdr.md`)
  - *Why:* Lets a TA grade only their own section's papers.
  - *What:* `GET /queue?section=` in `backend/app/routing/grading.py` currently always raises 422 ("Sections are not yet stored in enrollment"), which is out of date. Remove the guard; join `enrollment` so each queue entry carries its section; filter rows to the requested section (with an "unassigned" value, matching the reports filter). Add `section` to the queue entry model and a backend test.
  - *Frontend:* Add a section dropdown (and optionally a "my section" default) to the grading page, and pass it to the queue request.

- [ ] **Show sections on the grading screens**
  - *Grade page:* Show the current student's section next to their name/UID, and (optionally) a section filter, shown with a fixed-position layout (see the Graded/Not graded indicator item in section 2).
  - *Progress page:* Add a Section column to "Progress by student" and a section filter. Sort by last name, first name (section 2).
  - *What:* Add `section` to the progress and queue API responses (`student_progress` in `routing/grading.py` builds entries from rows lacking section), then render it in the frontend pages.

- [ ] **Per-section analytics** (also in section 2)
  - *What:* On the analytics page, add a small table of count, average, median/min/max per section (plus "Unassigned"). Needs section on the score data the analytics page uses, then group by it. Could also filter the existing score distribution and question performance charts by section.

- [ ] **Normalize and validate section values**
  - *Why:* Sections are free text, so "0101", "101", and "0101 " count as different sections and would split filters, folders, and analytics.
  - *What:* Trim whitespace on import and entry, and decide on a canonical format (e.g., keep as given but trimmed and case-folded for matching). Warn on roster upload when values look inconsistent.

- [ ] **Remove the surprising "0101" default** in the Add Student form (`roster/page.jsx`). Make the field start empty so students aren't silently assigned to a section.

- [ ] **Assign TAs to sections (optional, larger)**
  - *Why:* Today the section filter would be manual. Tying TAs to sections lets the grading queue default to their own section and lets instructors see section-by-TA workload.
  - *What:* New table or column linking staff to sections per course (new migration), a staff-page UI to set it, and the queue default using it. Confirm with the client first whether TAs are strictly split by section.

### Open questions for the client
- [ ] Are TAs always assigned one section each, or can a TA cover several or none?
- [ ] Should a TA be prevented from grading other sections, or just default to their own?
- [ ] Are section numbers consistent in the rosters the client uploads (e.g., always 4 digits)?

---

## 7. Meeting Notes Follow-ups

Items from the meeting; each is a to-do. Items overlapping earlier sections are cross-referenced.

- [ ] **Highlight unusual page counts for TA review.**
  - *Why:* An exam with a different number of pages than the template may mean a student used scratch paper, or a scan was matched or split wrongly and needs correcting.
  - *What:* After splitting, compare each scan's page count to the template's page count and flag mismatches (badge/highlight in the submissions and matching views, plus a filter for "unusual page count"). Let TAs open the pages, confirm all is fine, and dismiss the flag or fix the match. Ties to the page-count validation in section 4 and the exam-splitting fix in section 3.
- [x] **Delete bad scans and move on to grading.** *(Done: Remove on the Upload page while collecting. It's permanent, but the uploaded PDF keeps the pages. The hard block on unmatched scans stays.)*
  - *Why:* Grading is blocked while any scan is unmatched, and bogus scans (including those from dropped students) can't be removed.
  - *What:* Add a delete/remove action for a scan (removing it from the exam, with a confirmation), and let the user proceed to grading afterward. Also relax the hard block per section 3 (warn instead of block, or exclude unmatched scans). Clear the stale "Not ready for grading" popup once resolved (section 2). Decide whether deletion is a soft delete (recoverable) or permanent.
- [ ] **ELMS integration would replace score emailing.**
  - *What:* This confirms the ELMS item in section 3. If integration is built, uploading scores (and results) to ELMS bypasses emailing. Until then, keep the CSV export and the email path. Scope the ELMS upload format and API/CSV-import approach with the client. Make sure the export CSV has what ELMS import needs (section column per section 6).
- [ ] **Add `worksheet` as an assignment type.** See section 5.
- [ ] **Filter to all questions where criterion X was applied.**
  - *Why:* Instructors want to pull up every answer where a given criterion (rubric label) was applied, for consistency checks and regrades.
  - *What:* Backend query over `decision_label` / `mapping` joined to `label`, returning each matching answer (student, question, grader, score) with a link to open it in the grading view. Add a "Filter by criterion" control to the grading/progress pages. The regrade queue already supports queues by criterion (`regrade_queue.label_id`), so reuse that where possible.
- [ ] **Filter by specific criterion across all exams, and by section.**
  - *What:* Extend the criterion filter above so it can run across all exams in the assignment (all students) or be limited to one section. Depends on the section filtering work in section 6 (queue `section` filter, section on progress/queue responses). Show the result count and allow the filter to combine criterion plus section plus (optionally) grader.

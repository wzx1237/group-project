"""UID grid location: synthetic pages (joined row / nine separate squares, rotated, scaled, shifted) and the
recorded behavior on data/samples/quiz-1-*.pdf (tests/fixtures/sample_info_box.json)."""

import importlib.util
import itertools
import json
from pathlib import Path

import cv2
import numpy as np
import pytest

from app.services.uid_locator import locate_grid

FIXTURES = Path(__file__).parent / "fixtures"
ROW = (100, 100, 820, 190)  # joined row: x0, y0, x1, y1 (nine 80px boxes, 8:1)
SQUARES = [(100 + i * 70, 100, 160 + i * 70, 160) for i in range(9)]  # nine 60px squares, 10px apart
SQUARES_ASPECT = (9 * 60 + 8 * 10) / 60
ANGLES, SCALES, SHIFTS = (-2.0, 0.0, 2.0), (0.94, 1.0, 1.06), ((0, 0), (40, -25))
# Corners come from a coarse polygon fit (2% of the outline), so a rotated 8:1 row can be off by a few pixels:
# under 1% of the row's 720px width, which the straightening step absorbs.
TOLERANCE = 8  # pixels


def blank_page() -> np.ndarray:
    page = np.full((1600, 1200), 255, np.uint8)
    cv2.putText(page, "Name: ______", (100, 400), cv2.FONT_HERSHEY_SIMPLEX, 2, 0, 3)
    return page


def joined_row(page, box=ROW):
    x0, y0, x1, y1 = box
    cv2.rectangle(page, (x0, y0), (x1, y1), 0, 3)
    for i in range(1, 9):
        cv2.line(page, (x0 + i * 80, y0), (x0 + i * 80, y1), 0, 3)
    return np.float32([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])


def separate_squares(page):
    for x0, y0, x1, y1 in SQUARES:
        cv2.rectangle(page, (x0, y0), (x1, y1), 0, 3)
    return np.float32([[100, 100], [SQUARES[-1][2], 100], [SQUARES[-1][2], 160], [100, 160]])


def transform(page, corners, angle, scale, shift):
    """Rotate/scale about the page centre and shift; returns the new page and where the corners went."""
    matrix = cv2.getRotationMatrix2D((600, 800), angle, scale)
    matrix[:, 2] += shift
    warped = cv2.warpAffine(page, matrix, (1200, 1600), borderValue=255, flags=cv2.INTER_AREA)
    moved = cv2.transform(corners[None], matrix)[0]
    return warped, moved


CASES = list(itertools.product(ANGLES, SCALES, SHIFTS))


@pytest.mark.parametrize("angle,scale,shift", CASES)
def test_joined_row(angle, scale, shift):
    page = blank_page()
    corners = joined_row(page)
    page, expected = transform(page, corners, angle, scale, shift)
    found = locate_grid(page)
    assert np.abs(found - expected).max() < TOLERANCE


@pytest.mark.parametrize("angle,scale,shift", CASES)
def test_separate_squares(angle, scale, shift):
    page = blank_page()
    corners = separate_squares(page)
    page, expected = transform(page, corners, angle, scale, shift)
    found = locate_grid(page, aspect=SQUARES_ASPECT)
    assert np.abs(found - expected).max() < TOLERANCE


def test_grid_nested_in_a_larger_border():
    page = blank_page()
    cv2.rectangle(page, (60, 60), (1100, 260), 0, 3)  # the panel the boxes sit in
    expected = joined_row(page)
    assert np.abs(locate_grid(page) - expected).max() < TOLERANCE


def panel_joined_row(page):
    """A row whose lines are part of a panel's ruling, as on a typical exam cover's ID panel: the rules above and
    below the boxes run the panel's full width and the last box shares the panel's right edge, so the boxes have no
    outline of their own (each is only a hole in the panel's contour)."""
    x0, y0, x1, y1 = ROW
    cv2.rectangle(page, (40, 40), (x1, 260), 0, 3)
    for y in (y0, y1):
        cv2.line(page, (40, y), (x1, y), 0, 3)
    for i in range(9):
        cv2.line(page, (x0 + i * 80, y0), (x0 + i * 80, y1), 0, 3)
    cv2.putText(page, "UID:", (50, 160), cv2.FONT_HERSHEY_SIMPLEX, 1, 0, 2)
    return np.float32([[x0, y0], [x1, y0], [x1, y1], [x0, y1]])


@pytest.mark.parametrize("angle,scale,shift", CASES)
def test_row_joined_to_a_panel(angle, scale, shift):
    page = blank_page()
    corners = panel_joined_row(page)
    page, expected = transform(page, corners, angle, scale, shift)
    assert np.abs(locate_grid(page) - expected).max() < TOLERANCE


def test_sample_cover_2_grid_is_found_and_snapped():
    """data/samples/sample_cover_2.pdf has its UID boxes ruled into the ID panel; both setup modes must find them."""
    from app import cover_templates

    path = Path(__file__).resolve().parents[2] / "data" / "samples" / "sample_cover_2.pdf"
    if not path.exists():
        pytest.skip("sample_cover_2.pdf not available")
    pdf = path.read_bytes()
    drawn = cover_templates.analyze_blank_exam(pdf, "uid_box", [0.57, 0.085, 0.94, 0.125])
    whole = cover_templates.analyze_blank_exam(pdf, "full_page", None)
    assert drawn["grid"] == pytest.approx(whole["grid"], abs=0.002)
    assert 7 < drawn["aspect"] < 9.5
    x0, y0, x1, y1 = drawn["grid"]
    assert 0.55 < x0 < 0.62 and 0.92 < x1 < 0.95 and 0.08 < y0 < 0.10 and 0.12 < y1 < 0.135
    # The Assign dialog shows the whole ID panel (name, UID, TA, discussion time), not just the boxes.
    for plan in (drawn, whole):
        px0, py0, px1, py1 = plan["id_panel"]
        assert 0.39 < px0 < 0.42 and 0.03 < py0 < 0.06 and 0.935 < px1 < 0.96 and 0.19 < py1 < 0.22


def grid_fractions(box=ROW):
    return [box[0] / 1200, box[1] / 1600, box[2] / 1200, box[3] / 1600]


def test_id_panel_is_the_border_around_the_grid_even_with_a_break():
    from app.cover_templates import _enclosing_panel

    page = blank_page()
    panel_joined_row(page)
    cv2.line(page, (40, 150), (40, 165), 255, 5)  # a break in the panel's left side, as on sectioned panels
    x0, y0, x1, y1 = _enclosing_panel(page, grid_fractions())
    near = 0.015  # the panel's border plus the margin kept around it
    assert abs(x0 - 40 / 1200) < near and abs(y0 - 40 / 1600) < near
    assert abs(x1 - 820 / 1200) < near and abs(y1 - 260 / 1600) < near


def test_id_panel_ignores_a_page_frame_and_falls_back_without_a_panel():
    from app.cover_templates import _enclosing_panel

    page = blank_page()
    joined_row(page)
    cv2.rectangle(page, (20, 20), (1180, 1580), 0, 3)  # a border around the whole page is not an ID panel
    assert _enclosing_panel(page, grid_fractions()) is None


def test_decoy_outline_without_dividers_is_skipped():
    page = blank_page()
    cv2.rectangle(page, (100, 600), (1100, 725), 0, 3)  # bigger, 8:1, but not nine boxes (an answer box)
    expected = joined_row(page)
    assert np.abs(locate_grid(page) - expected).max() < TOLERANCE


def test_aspect_decides_what_counts_as_the_grid():
    page = blank_page()
    joined_row(page)
    with pytest.raises(ValueError, match="UID grid"):
        locate_grid(page, aspect=3.0)  # the stored aspect says the grid is much squarer than this row


def test_no_grid():
    with pytest.raises(ValueError, match="UID grid"):
        locate_grid(blank_page())


def test_eight_squares_are_not_a_grid():
    page = blank_page()
    for x0, y0, x1, y1 in SQUARES[:8]:
        cv2.rectangle(page, (x0, y0), (x1, y1), 0, 3)
    with pytest.raises(ValueError, match="UID grid"):
        locate_grid(page, aspect=SQUARES_ASPECT)


def test_quiz_1_baseline_is_unchanged():
    """Cover splitting and UID reads for the sample scans match what was recorded before the locator existed."""
    from app import config

    spec = importlib.util.spec_from_file_location("record_baseline", FIXTURES / "record_baseline.py")
    recorder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(recorder)
    if not (recorder.DATA / "samples" / "quiz-1-student-scans.pdf").exists() or not (recorder.DATA / config.DEFAULTS["uid_model"]).exists():
        pytest.skip("sample scans or UID model not available")
    expected = json.loads((FIXTURES / "sample_info_box.json").read_text())
    assert recorder.record() == expected

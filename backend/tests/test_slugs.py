import pytest

from app.slugs import slugify, unique_slug


@pytest.mark.parametrize("title, slug", [
    ("Final Exam", "final-exam"),
    ("  Quiz 1 (retake)! ", "quiz-1-retake"),
    ("2024", "assignment-2024"),
    ("3rd quiz", "assignment-3rd-quiz"),
    ("!!!", "assignment"),
    ("", "assignment"),
])
def test_slugify_always_starts_with_a_letter(title, slug):
    assert slugify(title) == slug


def test_unique_slug_numbers_repeats():
    assert unique_slug("Quiz 1", {"quiz-1", "quiz-1-2"}) == "quiz-1-3"

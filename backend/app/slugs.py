"""Assignment slugs: the ID an assignment has in URLs, such as quiz-1.

A slug always starts with a letter, so it can never be all digits. resolve_exam treats an
all-digit ID as a database exam_id, and a slug like "2024" would be taken for one.
"""

import re

SLUG_PATTERN = r"^[a-z][a-z0-9-]*$"


def slugify(title: str) -> str:
    """A slug for a title: "Final Exam" -> "final-exam", "2024" -> "assignment-2024"."""
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    if not slug:
        return "assignment"
    return slug if slug[0].isalpha() else f"assignment-{slug}"


def unique_slug(title: str, taken: set[str], prefix: str | None = None) -> str:
    """slugify(title), after `prefix` if one is given, with -2, -3, ... added until it is not in `taken`."""
    base = slug = f"{slugify(prefix)}-{slugify(title)}" if prefix else slugify(title)
    number = 2
    while slug in taken:
        slug, number = f"{base}-{number}", number + 1
    return slug

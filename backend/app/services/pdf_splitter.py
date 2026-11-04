"""Split one PDF into several by cover pages, copying pages without re-rendering them."""

from pathlib import Path

import pymupdf


def split_by_covers(source: str | Path, is_cover: list[bool], out_dir: str | Path) -> list[dict]:
    """Write one PDF per exam into out_dir and return a record for each.

    A new PDF starts at every cover page. Pages before the first cover (or all pages,
    if there is no cover) form their own PDF with starts_with_cover=False, so no page
    is ever dropped. Page numbers are 1-based and inclusive.
    """
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    starts = [i for i, cover in enumerate(is_cover) if cover]
    if not starts or starts[0] != 0:
        starts.insert(0, 0)
    ends = [s - 1 for s in starts[1:]] + [len(is_cover) - 1]

    records = []
    with pymupdf.open(source) as document:
        if len(document) != len(is_cover):
            raise ValueError("Page count does not match the cover detection results")
        for number, (first, last) in enumerate(zip(starts, ends), start=1):
            filename = f"submission_{number:03d}.pdf"
            with pymupdf.open() as piece:
                piece.insert_pdf(document, from_page=first, to_page=last)
                piece.save(out_dir / filename)
            records.append({
                "id": f"{number:03d}",
                "filename": filename,
                "start_page": first + 1,
                "end_page": last + 1,
                "starts_with_cover": is_cover[first],
            })
    return records

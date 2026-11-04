"""Render a rectangular part of a PDF page to a PNG, for showing to a person."""

from pathlib import Path

import pymupdf


def save_crop(pdf_path: str | Path, region: tuple[float, float, float, float], out_path: str | Path,
              page_index: int = 0, page_width_px: int = 1400) -> None:
    """region is (x0, y0, x1, y1) as fractions of the page. Output width is relative to the full page width."""
    with pymupdf.open(pdf_path) as pdf:
        page = pdf[page_index]
        bounds = page.rect
        x0, y0, x1, y1 = region
        clip = pymupdf.Rect(x0 * bounds.width, y0 * bounds.height, x1 * bounds.width, y1 * bounds.height)
        zoom = page_width_px / bounds.width
        page.get_pixmap(matrix=pymupdf.Matrix(zoom, zoom), clip=clip, colorspace=pymupdf.csGRAY, alpha=False).save(str(out_path))

"""
scripts/make_demo_pdf.py
------------------------
Converts supplier_a.txt into supplier_a.pdf for demo purposes.

In a real deployment, Sobre B envelopes arrive as PDFs directly from the
PSCP (Plataforma de Serveis de Contractació Pública). This script simulates
that by producing a properly formatted PDF from the existing synthetic
proposal, so the PDF ingestion pipeline can be demonstrated end-to-end.

Usage:
    python -m scripts.make_demo_pdf

Output:
    data/supplier_a.pdf
"""

from pathlib import Path
from fpdf import FPDF
from fpdf.enums import XPos, YPos

DATA_DIR    = Path(__file__).parent.parent / "data"
INPUT_PATH  = DATA_DIR / "supplier_a.txt"
OUTPUT_PATH = DATA_DIR / "supplier_a.pdf"

MARGIN       = 20
LINE_HEIGHT  = 5
FONT_BODY    = 9
FONT_SECTION = 11

# fpdf2 built-in fonts are latin-1 — replace common Unicode punctuation.
CHAR_MAP = {
    "—": "-",    # em dash
    "–": "-",    # en dash
    "‘": "'",  # left single quote
    "’": "'",  # right single quote
    "“": '"',  # left double quote
    "”": '"',  # right double quote
    "…": "...",  # ellipsis
    "·": "*",    # middle dot
}

NX = XPos.LMARGIN   # shorthand: always return cursor to left margin
NY = YPos.NEXT       # shorthand: always advance to next line


def sanitise(text: str) -> str:
    for char, repl in CHAR_MAP.items():
        text = text.replace(char, repl)
    return text.encode("latin-1", errors="ignore").decode("latin-1")


def draw_rule(pdf: FPDF, color: tuple = (200, 200, 200)) -> None:
    """Draw a horizontal rule and reset cursor to left margin."""
    pdf.set_draw_color(*color)
    y = pdf.get_y()
    pdf.line(MARGIN, y, pdf.w - MARGIN, y)
    pdf.set_xy(MARGIN, y)   # pdf.line() moves x to right endpoint — reset it


def make_pdf(input_path: Path, output_path: Path) -> None:
    raw = input_path.read_text(encoding="utf-8")
    lines = [sanitise(line) for line in raw.splitlines()]

    pdf = FPDF()
    pdf.set_margins(MARGIN, MARGIN, MARGIN)
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    # Cover line
    pdf.set_font("Helvetica", "B", 10)
    pdf.set_text_color(30, 60, 120)
    pdf.multi_cell(
        0, 8,
        "CTTI-2026-36 - Sobre B - QuantumNet Solutions SL",
        new_x=NX, new_y=NY,
    )
    draw_rule(pdf, color=(70, 110, 170))
    pdf.ln(4)
    pdf.set_text_color(30, 30, 30)

    for line in lines:
        stripped = line.strip()

        # Section separator (===...===)
        if stripped.startswith("==="):
            pdf.ln(2)
            draw_rule(pdf)
            pdf.ln(3)
            continue

        # Blank line → small gap
        if not stripped:
            pdf.ln(LINE_HEIGHT - 2)
            continue

        # ALL-CAPS section headings
        if stripped.isupper() and len(stripped) > 6:
            pdf.set_font("Helvetica", "B", FONT_SECTION)
            pdf.set_text_color(30, 60, 120)
            pdf.multi_cell(0, LINE_HEIGHT + 1, stripped, new_x=NX, new_y=NY)
            pdf.set_text_color(30, 30, 30)
            continue

        # Normal body text
        pdf.set_font("Helvetica", "", FONT_BODY)
        pdf.multi_cell(0, LINE_HEIGHT, stripped, new_x=NX, new_y=NY)

    # Page numbers (pdf.pages is a dict in fpdf2 v2)
    total_pages = len(pdf.pages)
    for i in range(1, total_pages + 1):
        pdf.page = i
        pdf.set_y(-14)
        pdf.set_font("Helvetica", "I", 7)
        pdf.set_text_color(150, 150, 150)
        pdf.cell(
            0, 6,
            f"Page {i} of {total_pages}  -  CONFIDENTIAL  -  Internal use only",
            align="C",
        )

    pdf.output(str(output_path))
    size_kb = output_path.stat().st_size / 1024
    print(f"Created: {output_path}  ({size_kb:.1f} KB, {total_pages} pages)")


if __name__ == "__main__":
    make_pdf(INPUT_PATH, OUTPUT_PATH)

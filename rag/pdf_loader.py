"""
rag/pdf_loader.py
-----------------
PDF text extraction for the CTTI procurement evaluation pipeline.

Uses pdfplumber as the primary extractor - it handles multi-column layouts
and produces cleaner text than pypdf for typical government/corporate PDFs.

Returns a list of LangChain Document objects (one per page) with metadata
fields that match the existing .txt-based pipeline:
  source, doc_type, tender_id (if provided), page (1-indexed)

The downstream chunker and FAISS indexer receive identical Document objects
regardless of whether the source was a .txt or .pdf file.
"""

import pdfplumber
from pathlib import Path
from langchain_core.documents import Document


def load_pdf(
    path: str | Path,
    source: str,
    doc_type: str,
    tender_id: str = "",
) -> list[Document]:
    """
    Extract text from a PDF and return one Document per page.

    Parameters
    ----------
    path      : path to the PDF file
    source    : metadata value, e.g. "supplier_a" or "pcap_criteria"
    doc_type  : metadata value, e.g. "proposal", "criteria", "requirements"
    tender_id : optional tender identifier, e.g. "ctti_2026_36"

    Returns
    -------
    List of Document objects. Pages with no extractable text are skipped
    silently (e.g. scanned image pages - OCR is out of scope for this prototype).
    """
    path = Path(path)
    docs = []

    with pdfplumber.open(path) as pdf:
        for page_num, page in enumerate(pdf.pages, start=1):
            text = page.extract_text()
            if not text or not text.strip():
                continue  # skip blank / image-only pages

            metadata = {
                "source":    source,
                "doc_type":  doc_type,
                "page":      page_num,
            }
            if tender_id:
                metadata["tender_id"] = tender_id

            docs.append(Document(page_content=text.strip(), metadata=metadata))

    return docs


if __name__ == "__main__":
    import sys
    if len(sys.argv) < 2:
        print("Usage: python -m rag.pdf_loader <path_to_pdf>")
        sys.exit(1)

    pages = load_pdf(sys.argv[1], source="test", doc_type="test")
    print(f"Extracted {len(pages)} page(s)")
    for p in pages:
        print(f"  Page {p.metadata['page']}: {len(p.page_content)} chars - "
              f"{p.page_content[:80].replace(chr(10), ' ')!r}...")

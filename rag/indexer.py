"""
rag/indexer.py
--------------
Builds a single FAISS index covering all tenders under data/.

Each tender lives in its own subdirectory (e.g. data/ctti_2026_36/).
Every chunk receives a tender_id metadata field so the retriever can
filter by tender as well as by source (supplier_a, etc.) and doc_type
(criteria, requirements, proposal).

Run once per data change:
    python -m rag.indexer
"""

import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_mistralai import MistralAIEmbeddings
from langchain_community.vectorstores import FAISS
from rag.pdf_loader import load_pdf

load_dotenv()

DATA_DIR  = Path(__file__).parent.parent / "data"
INDEX_DIR = Path(__file__).parent / "faiss_index"

# Per-tender file layout. Each key is a tender subdirectory name;
# each value maps filename → metadata (source, doc_type).
# Add a new tender by adding a new top-level entry here.
TENDER_FILES: dict[str, dict[str, dict]] = {
    "ctti_2026_36": {
        "pcap_criteria.txt":    {"source": "pcap_criteria",    "doc_type": "criteria"},
        "ppt_requirements.txt": {"source": "ppt_requirements", "doc_type": "requirements"},
        "supplier_a.pdf":       {"source": "supplier_a",       "doc_type": "proposal"},
        "supplier_b.txt":       {"source": "supplier_b",       "doc_type": "proposal"},
        "supplier_c.txt":       {"source": "supplier_c",       "doc_type": "proposal"},
    },
    "ctti_2026_44": {
        "pcap_criteria.txt":    {"source": "pcap_criteria",    "doc_type": "criteria"},
        "ppt_requirements.txt": {"source": "ppt_requirements", "doc_type": "requirements"},
        "supplier_a.txt":       {"source": "supplier_a",       "doc_type": "proposal"},
        "supplier_b.txt":       {"source": "supplier_b",       "doc_type": "proposal"},
        "supplier_c.txt":       {"source": "supplier_c",       "doc_type": "proposal"},
    },
    "ctti_2026_51": {
        "pcap_criteria.txt":    {"source": "pcap_criteria",    "doc_type": "criteria"},
        "ppt_requirements.txt": {"source": "ppt_requirements", "doc_type": "requirements"},
        "supplier_a.txt":       {"source": "supplier_a",       "doc_type": "proposal"},
        "supplier_b.txt":       {"source": "supplier_b",       "doc_type": "proposal"},
        "supplier_c.txt":       {"source": "supplier_c",       "doc_type": "proposal"},
    },
}


def load_document(path: Path, meta: dict, tender_id: str) -> list:
    """
    Load a document and stamp every chunk with tender_id metadata.

    .pdf  → pdfplumber page-by-page extraction
    .txt  → LangChain TextLoader
    """
    suffix = path.suffix.lower()
    full_meta = {**meta, "tender_id": tender_id}

    if suffix == ".pdf":
        return load_pdf(path, source=meta["source"], doc_type=meta["doc_type"],
                        tender_id=tender_id)

    if suffix == ".txt":
        loader = TextLoader(str(path), encoding="utf-8")
        docs = loader.load()
        for doc in docs:
            doc.metadata.update(full_meta)
        return docs

    raise ValueError(f"Unsupported file type: {suffix} ({path})")


def build_index() -> None:
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    all_chunks = []

    for tender_id, files in TENDER_FILES.items():
        tender_dir = DATA_DIR / tender_id
        print(f"\nTender: {tender_id}")
        for filename, meta in files.items():
            path = tender_dir / filename
            if not path.exists():
                print(f"  SKIPPED (not found): {filename}")
                continue
            docs = load_document(path, meta, tender_id)
            chunks = splitter.split_documents(docs)
            print(f"  {filename}: {len(docs)} page(s) → {len(chunks)} chunks")
            all_chunks.extend(chunks)

    print(f"\nTotal chunks across all tenders: {len(all_chunks)}")

    embeddings = MistralAIEmbeddings(model="mistral-embed")
    vectorstore = FAISS.from_documents(all_chunks, embeddings)
    vectorstore.save_local(str(INDEX_DIR))
    print(f"Index saved to {INDEX_DIR}")


if __name__ == "__main__":
    build_index()

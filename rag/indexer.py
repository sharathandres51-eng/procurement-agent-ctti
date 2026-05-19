import os
from pathlib import Path
from dotenv import load_dotenv
from langchain_community.document_loaders import TextLoader
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_mistralai import MistralAIEmbeddings
from langchain_community.vectorstores import FAISS
from rag.pdf_loader import load_pdf

load_dotenv()

DATA_DIR = Path(__file__).parent.parent / "data"
INDEX_DIR = Path(__file__).parent / "faiss_index"

# Each entry maps a filename to its metadata.
# To add a PDF: change the filename extension — load_document() handles the rest.
FILE_METADATA = {
    "pcap_criteria.txt":    {"source": "pcap_criteria",    "doc_type": "criteria"},
    "ppt_requirements.txt": {"source": "ppt_requirements", "doc_type": "requirements"},
    "supplier_a.pdf":       {"source": "supplier_a",       "doc_type": "proposal"},
    "supplier_b.txt":       {"source": "supplier_b",       "doc_type": "proposal"},
    "supplier_c.txt":       {"source": "supplier_c",       "doc_type": "proposal"},
}


def load_document(path: Path, meta: dict) -> list:
    """
    Load a single document regardless of format.

    .pdf  → pdfplumber page-by-page extraction (rag/pdf_loader.py)
    .txt  → LangChain TextLoader (existing behaviour)

    Both return a list of LangChain Document objects with identical metadata
    fields, so the downstream splitter and FAISS indexer need no changes.
    """
    suffix = path.suffix.lower()

    if suffix == ".pdf":
        return load_pdf(
            path,
            source=meta["source"],
            doc_type=meta["doc_type"],
        )

    if suffix == ".txt":
        loader = TextLoader(str(path), encoding="utf-8")
        docs = loader.load()
        for doc in docs:
            doc.metadata.update(meta)
        return docs

    raise ValueError(f"Unsupported file type: {suffix} ({path})")


def build_index():
    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=50)
    all_chunks = []

    for filename, meta in FILE_METADATA.items():
        path = DATA_DIR / filename
        if not path.exists():
            print(f"  SKIPPED (not found): {filename}")
            continue

        docs = load_document(path, meta)
        chunks = splitter.split_documents(docs)
        print(f"  {filename}: {len(docs)} page(s) → {len(chunks)} chunks")
        all_chunks.extend(chunks)

    print(f"Total chunks: {len(all_chunks)}")

    embeddings = MistralAIEmbeddings(model="mistral-embed")
    vectorstore = FAISS.from_documents(all_chunks, embeddings)
    vectorstore.save_local(str(INDEX_DIR))
    print(f"Index saved to {INDEX_DIR}")


if __name__ == "__main__":
    build_index()

"""
rag/indexer.py
--------------
Ingests PDF and TXT files from data/ into Supabase pgvector via MarkItDown
extraction, Mistral embeddings, and SHA256-based change detection.

CLI usage:
    python -m rag.indexer setup ctti_2026_36
    python -m rag.indexer ingest ctti_2026_36
"""

import hashlib
import os
import sys
from pathlib import Path

import psycopg2
from dotenv import load_dotenv
from langchain_mistralai import MistralAIEmbeddings
from langchain_postgres.vectorstores import PGVector
from langchain_text_splitters import RecursiveCharacterTextSplitter
from markitdown import MarkItDown
from sqlalchemy import create_engine

load_dotenv()

DATA_DIR = Path(__file__).parent.parent / "data"


# ---------------------------------------------------------------------------
# Metadata helpers
# ---------------------------------------------------------------------------

def get_file_metadata(filename: str, tender_id: str) -> dict:
    name = filename.lower()
    if "pcap" in name:
        source, doc_type = "pcap_criteria", "criteria"
    elif "pptp" in name or "ppt" in name:
        source, doc_type = "ppt_requirements", "requirements"
    elif "supplier_a" in name:
        source, doc_type = "supplier_a", "proposal"
    elif "supplier_b" in name:
        source, doc_type = "supplier_b", "proposal"
    elif "supplier_c" in name:
        source, doc_type = "supplier_c", "proposal"
    else:
        source, doc_type = Path(filename).stem, "unknown"
    return {"tender_id": tender_id, "source": source, "doc_type": doc_type}


# ---------------------------------------------------------------------------
# Hashing and deduplication
# ---------------------------------------------------------------------------

def compute_hash(filepath: Path) -> str:
    h = hashlib.sha256()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def is_already_indexed(conn, tender_id: str, filename: str, file_hash: str) -> bool:
    with conn.cursor() as cur:
        cur.execute(
            """
            SELECT file_hash FROM indexed_documents
            WHERE tender_id = %s AND filename = %s
            """,
            (tender_id, filename),
        )
        row = cur.fetchone()
    if row is None:
        return False
    return row[0] == file_hash


def delete_existing_chunks(conn, tender_id: str, source: str) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM langchain_pg_embedding e
            USING langchain_pg_collection c
            WHERE e.collection_id = c.uuid
              AND c.name = 'ctti_documents'
              AND (e.cmetadata->>'tender_id') = %s
              AND (e.cmetadata->>'source') = %s
            """,
            (tender_id, source),
        )
    conn.commit()


def record_indexed(
    conn, tender_id: str, filename: str, file_hash: str, chunk_count: int
) -> None:
    with conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO indexed_documents (tender_id, filename, file_hash, chunk_count)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (tender_id, filename) DO UPDATE
                SET file_hash   = EXCLUDED.file_hash,
                    chunk_count = EXCLUDED.chunk_count,
                    indexed_at  = now()
            """,
            (tender_id, filename, file_hash, chunk_count),
        )
    conn.commit()


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------

def extract_text(filepath: Path) -> str:
    md = MarkItDown()
    result = md.convert(str(filepath))
    return result.text_content


# ---------------------------------------------------------------------------
# Core ingestion
# ---------------------------------------------------------------------------

def ingest_file(
    filepath: Path,
    tender_id: str,
    conn,
    vectorstore: PGVector,
) -> int:
    filename = filepath.name
    file_hash = compute_hash(filepath)

    if is_already_indexed(conn, tender_id, filename, file_hash):
        print(f"  SKIP (unchanged): {filename}")
        return 0

    metadata = get_file_metadata(filename, tender_id)

    # Remove stale chunks if the file changed
    delete_existing_chunks(conn, tender_id, metadata["source"])

    print(f"  Extracting: {filename}")
    text = extract_text(filepath)

    splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
    chunks = splitter.create_documents([text], metadatas=[metadata])

    vectorstore.add_documents(chunks)
    record_indexed(conn, tender_id, filename, file_hash, len(chunks))

    print(f"  Indexed:    {filename} → {len(chunks)} chunks")
    return len(chunks)


# ---------------------------------------------------------------------------
# Vectorstore factory
# ---------------------------------------------------------------------------

def get_vectorstore() -> PGVector:
    engine = create_engine(
        os.environ["DATABASE_URL"],
        pool_pre_ping=True,
        pool_recycle=300,
    )
    return PGVector(
        connection=engine,
        collection_name="ctti_documents",
        embeddings=MistralAIEmbeddings(model="mistral-embed"),
        use_jsonb=True,
    )


# ---------------------------------------------------------------------------
# Public entry points
# ---------------------------------------------------------------------------

def setup_tender(tender_id: str) -> None:
    """Index all files in data/{tender_id}/setup/. Run once per tender."""
    setup_dir = DATA_DIR / tender_id / "setup"
    if not setup_dir.exists():
        print(f"Setup directory not found: {setup_dir}")
        return

    vectorstore = get_vectorstore()
    conn = psycopg2.connect(os.environ["DATABASE_URL"])

    print(f"\nSetting up tender: {tender_id}")
    total = 0
    for filepath in sorted(setup_dir.iterdir()):
        if filepath.suffix.lower() in {".pdf", ".txt"}:
            total += ingest_file(filepath, tender_id, conn, vectorstore)

    conn.close()
    print(f"Done. {total} chunks indexed for {tender_id}/setup.")


def ingest_proposals(tender_id: str) -> None:
    """Check and index new or changed files in data/{tender_id}/proposals/."""
    proposals_dir = DATA_DIR / tender_id / "proposals"
    if not proposals_dir.exists():
        return

    vectorstore = get_vectorstore()
    conn = psycopg2.connect(os.environ["DATABASE_URL"])

    print(f"\nIngesting proposals: {tender_id}")
    total = 0
    for filepath in sorted(proposals_dir.iterdir()):
        if filepath.suffix.lower() in {".pdf", ".txt"}:
            total += ingest_file(filepath, tender_id, conn, vectorstore)

    conn.close()
    if total:
        print(f"Done. {total} new chunks indexed for {tender_id}/proposals.")
    else:
        print(f"Done. No changes detected for {tender_id}/proposals.")


def ingest_all_proposals() -> None:
    """Scan all tender subdirectories and ingest proposals. Called on app startup."""
    for tender_dir in sorted(DATA_DIR.iterdir()):
        if tender_dir.is_dir() and not tender_dir.name.startswith("."):
            ingest_proposals(tender_dir.name)


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in {"setup", "ingest"}:
        print("Usage:")
        print("  python -m rag.indexer setup  <tender_id>")
        print("  python -m rag.indexer ingest <tender_id>")
        sys.exit(1)

    command, tender_id = sys.argv[1], sys.argv[2]
    if command == "setup":
        setup_tender(tender_id)
    else:
        ingest_proposals(tender_id)

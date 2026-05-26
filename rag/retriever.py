"""
rag/retriever.py
----------------
Semantic search helpers over the multi-tender FAISS index.

retrieve()          → top-k proposal chunks for a given supplier in a given tender
retrieve_criteria() → top-k criteria/requirements chunks for a given tender

Both functions filter on tender_id metadata so results from different tenders
never bleed into each other.
"""

from pathlib import Path
from dotenv import load_dotenv
from langchain_mistralai import MistralAIEmbeddings
from langchain_community.vectorstores import FAISS

load_dotenv()

INDEX_DIR = Path(__file__).parent / "faiss_index"

_embeddings  = MistralAIEmbeddings(model="mistral-embed")
_vectorstore = FAISS.load_local(
    str(INDEX_DIR),
    _embeddings,
    allow_dangerous_deserialization=True,
)


def retrieve(supplier_id: str, query: str, tender_id: str, k: int = 5) -> list[dict]:
    """Return top-k proposal chunks for supplier_id within the given tender.

    Falls back to source-only filtering when the index was built before the
    tender_id metadata field was added (all chunks have tender_id=None).
    """
    candidates = _vectorstore.similarity_search(query, k=k * 10)

    # Detect whether the index carries tender_id metadata
    index_has_tender_id = any(
        doc.metadata.get("tender_id") is not None for doc in candidates
    )

    def _matches(doc) -> bool:
        if doc.metadata.get("source") != supplier_id:
            return False
        if index_has_tender_id:
            return doc.metadata.get("tender_id") == tender_id
        return True  # old index: trust source filter alone

    results = [
        {
            "text":      doc.page_content,
            "source":    doc.metadata.get("source", ""),
            "doc_type":  doc.metadata.get("doc_type", ""),
            "tender_id": doc.metadata.get("tender_id") or tender_id,
        }
        for doc in candidates
        if _matches(doc)
    ]
    return results[:k]


def retrieve_criteria(query: str, tender_id: str, k: int = 5) -> list[dict]:
    """Return top-k criteria/requirements chunks for the given tender."""
    candidates = _vectorstore.similarity_search(query, k=k * 10)
    index_has_tender_id = any(
        doc.metadata.get("tender_id") is not None for doc in candidates
    )
    results = [
        {
            "text":      doc.page_content,
            "source":    doc.metadata.get("source", ""),
            "doc_type":  doc.metadata.get("doc_type", ""),
            "tender_id": doc.metadata.get("tender_id") or tender_id,
        }
        for doc in candidates
        if (doc.metadata.get("doc_type") in ("criteria", "requirements")
            and (not index_has_tender_id or doc.metadata.get("tender_id") == tender_id))
    ]
    return results[:k]


if __name__ == "__main__":
    tests = [
        ("supplier_a", "team qualifications migration plan references", "ctti_2026_36", 3),
        ("supplier_b", "ENS compliance data sovereignty GDPR",          "ctti_2026_44", 3),
        ("supplier_a", "SOC analyst certifications threat intelligence", "ctti_2026_51", 3),
    ]
    for supplier_id, query, tender_id, k in tests:
        print(f"\n--- retrieve('{supplier_id}', ..., tender='{tender_id}', k={k}) ---")
        for r in retrieve(supplier_id, query, tender_id, k):
            print(f"  tender={r['tender_id']}  source={r['source']}  "
                  f"doc_type={r['doc_type']}")
            print(f"  text={r['text'][:100]!r}")

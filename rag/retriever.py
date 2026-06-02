"""
rag/retriever.py
----------------
Semantic search helpers over Supabase pgvector.

retrieve()          → top-k proposal chunks for a given supplier in a given tender
retrieve_criteria() → top-k criteria/requirements chunks for a given tender
"""

import os
from dotenv import load_dotenv
from langchain_mistralai import MistralAIEmbeddings
from langchain_postgres.vectorstores import PGVector
from sqlalchemy import create_engine

load_dotenv()


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


_vectorstore = None


def _get_vs() -> PGVector:
    global _vectorstore
    if _vectorstore is None:
        _vectorstore = get_vectorstore()
    return _vectorstore


def _to_dicts(docs) -> list[dict]:
    return [
        {
            "text":      doc.page_content,
            "source":    doc.metadata.get("source", ""),
            "doc_type":  doc.metadata.get("doc_type", ""),
            "tender_id": doc.metadata.get("tender_id", ""),
        }
        for doc in docs
    ]


def retrieve(
    supplier_id: str, query: str, tender_id: str, k: int = 5
) -> list[dict]:
    """Return top-k proposal chunks for supplier_id within the given tender.

    Filtering happens INSIDE the pgvector query (not after) so the supplier's
    chunks are always considered, even when other tenders dominate the global
    similarity ranking.
    """
    flt = {
        "$and": [
            {"tender_id": {"$eq": tender_id}},
            {"source":    {"$eq": supplier_id}},
            {"doc_type":  {"$eq": "proposal"}},
        ]
    }
    try:
        docs = _get_vs().similarity_search(query or supplier_id, k=k, filter=flt)
        return _to_dicts(docs)[:k]
    except Exception:
        # Fallback: over-fetch then post-filter (older metadata / filter issues)
        candidates = _get_vs().similarity_search(query or supplier_id, k=k * 10)
        results = [
            d for d in _to_dicts(candidates)
            if d["tender_id"] == tender_id
            and d["source"] == supplier_id
            and d["doc_type"] == "proposal"
        ]
        return results[:k]


def retrieve_criteria(query: str, tender_id: str, k: int = 5) -> list[dict]:
    """Return top-k criteria/requirements chunks for the given tender."""
    flt = {
        "$and": [
            {"tender_id": {"$eq": tender_id}},
            {"doc_type":  {"$in": ["criteria", "requirements"]}},
        ]
    }
    try:
        docs = _get_vs().similarity_search(query, k=k, filter=flt)
        return _to_dicts(docs)[:k]
    except Exception:
        candidates = _get_vs().similarity_search(query, k=k * 10)
        results = [
            d for d in _to_dicts(candidates)
            if d["tender_id"] == tender_id
            and d["doc_type"] in ("criteria", "requirements")
        ]
        return results[:k]


if __name__ == "__main__":
    tests = [
        retrieve("supplier_a", "team qualifications", "ctti_2026_36", k=3),
        retrieve("supplier_b", "risk identification", "ctti_2026_36", k=3),
        retrieve_criteria("evaluation criteria maximum points", "ctti_2026_36", k=3),
    ]
    labels = [
        "retrieve('supplier_a', 'team qualifications', 'ctti_2026_36', k=3)",
        "retrieve('supplier_b', 'risk identification', 'ctti_2026_36', k=3)",
        "retrieve_criteria('evaluation criteria maximum points', 'ctti_2026_36', k=3)",
    ]

    all_passed = True
    for label, results in zip(labels, tests):
        print(f"\n--- {label} ---")
        if not results:
            print("  FAIL: no results returned")
            all_passed = False
            continue
        for r in results:
            print(f"  source={r['source']}  doc_type={r['doc_type']}")
            print(f"  text={r['text'][:100]!r}")

    print("\n--- " + ("ALL PASSED" if all_passed else "SOME TESTS FAILED") + " ---")

from pathlib import Path
from dotenv import load_dotenv
from langchain_mistralai import MistralAIEmbeddings
from langchain_community.vectorstores import FAISS

load_dotenv()

INDEX_DIR = Path(__file__).parent / "faiss_index"

_embeddings = MistralAIEmbeddings(model="mistral-embed")
_vectorstore = FAISS.load_local(
    str(INDEX_DIR),
    _embeddings,
    allow_dangerous_deserialization=True,
)


def retrieve(supplier_id: str, query: str, k: int = 3) -> list[dict]:
    candidates = _vectorstore.similarity_search(query, k=k * 10)
    results = [
        {
            "text": doc.page_content,
            "source": doc.metadata.get("source", ""),
            "doc_type": doc.metadata.get("doc_type", ""),
        }
        for doc in candidates
        if doc.metadata.get("source") == supplier_id
    ]
    return results[:k]


def retrieve_criteria(query: str, k: int = 3) -> list[dict]:
    candidates = _vectorstore.similarity_search(query, k=k * 10)
    results = [
        {
            "text": doc.page_content,
            "source": doc.metadata.get("source", ""),
            "doc_type": doc.metadata.get("doc_type", ""),
        }
        for doc in candidates
        if doc.metadata.get("doc_type") in ("criteria", "requirements")
    ]
    return results[:k]


if __name__ == "__main__":
    tests = [
        ("supplier_a", "team qualifications quantum architect certifications", 3),
        ("supplier_b", "risk identification deployment mitigation", 3),
    ]

    for supplier_id, query, k in tests:
        print(f"\n--- retrieve('{supplier_id}', '{query[:50]}...', k={k}) ---")
        for r in retrieve(supplier_id, query, k):
            print(f"  source={r['source']}  doc_type={r['doc_type']}")
            print(f"  text={r['text'][:100]!r}")

    print("\n--- retrieve_criteria('maximum points migration plan team evaluation', k=3) ---")
    for r in retrieve_criteria("maximum points migration plan team evaluation", k=3):
        print(f"  source={r['source']}  doc_type={r['doc_type']}")
        print(f"  text={r['text'][:100]!r}")

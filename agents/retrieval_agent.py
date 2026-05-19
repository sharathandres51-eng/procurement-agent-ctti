from rag.retriever import retrieve
from graph.state import EvalState


def retrieval_agent(state: EvalState) -> dict:
    chunks = retrieve(
        supplier_id=state["supplier_id"],
        query=state["criterion_query"],
        tender_id=state["tender_id"],
        k=5,
    )
    return {"raw_chunks": chunks}

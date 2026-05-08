from rag.retriever import retrieve
from graph.state import EvalState


def retrieval_agent(state: EvalState) -> dict:
    chunks = retrieve(
        supplier_id=state["supplier_id"],
        query=state["criterion_query"],
        k=5,
    )
    return {"raw_chunks": chunks}

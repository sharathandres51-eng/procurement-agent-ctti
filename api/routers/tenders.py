"""
api/routers/tenders.py
-----------------------
GET /tenders          — list all registered tenders
GET /tenders/{id}     — single tender detail
GET /tenders/{id}/plan — load (or generate) the evaluation plan
"""

from fastapi import APIRouter, HTTPException, Query
from graph.pipeline import TENDER_REGISTRY
from agents.planning_agent import load_or_generate_plan
from api.schemas import TenderSummary, SupplierInfo, EvaluationPlanResponse

router = APIRouter(prefix="/tenders", tags=["tenders"])


def _contract_id(tender_id: str) -> str:
    return tender_id.upper().replace("_", "-")


@router.get("", response_model=list[TenderSummary])
def list_tenders():
    return [
        TenderSummary(
            tender_id=tid,
            label=cfg["label"],
            suppliers=[SupplierInfo(**s) for s in cfg["suppliers"]],
        )
        for tid, cfg in TENDER_REGISTRY.items()
    ]


@router.get("/{tender_id}", response_model=TenderSummary)
def get_tender(tender_id: str):
    if tender_id not in TENDER_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' not found")
    cfg = TENDER_REGISTRY[tender_id]
    return TenderSummary(
        tender_id=tender_id,
        label=cfg["label"],
        suppliers=[SupplierInfo(**s) for s in cfg["suppliers"]],
    )


@router.get("/{tender_id}/plan", response_model=EvaluationPlanResponse)
def get_plan(tender_id: str):
    if tender_id not in TENDER_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' not found")
    try:
        plan = load_or_generate_plan(
            contract_id=_contract_id(tender_id),
            tender_id=tender_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return EvaluationPlanResponse(**plan)


@router.get("/{tender_id}/source-chunks")
def get_source_chunks(
    tender_id: str,
    supplier_id: str = Query(..., description="Supplier source ID (e.g. supplier_a)"),
    criterion_id: str = Query(..., description="Criterion ID from the evaluation plan"),
    k: int = Query(4, description="Number of chunks to return"),
):
    """
    Return the top-k RAG source chunks from a supplier's proposal document
    that are most relevant to the given criterion. Used by the split-screen
    review mode so evaluators can verify AI evidence against the source.
    """
    if tender_id not in TENDER_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' not found")

    try:
        plan = load_or_generate_plan(
            contract_id=_contract_id(tender_id),
            tender_id=tender_id,
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    # Use the criterion's own query for the similarity search
    criterion = next((c for c in plan["criteria"] if c["id"] == criterion_id), None)
    query = criterion["query"] if criterion else criterion_id

    try:
        from rag.retriever import retrieve
        chunks = retrieve(supplier_id=supplier_id, query=query, tender_id=tender_id, k=k)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"RAG retrieval failed: {exc}")

    return {
        "tender_id":    tender_id,
        "supplier_id":  supplier_id,
        "criterion_id": criterion_id,
        "query":        query,
        "chunks":       chunks,
    }

"""
api/routers/tenders.py
-----------------------
GET /tenders          — list all registered tenders
GET /tenders/{id}     — single tender detail
GET /tenders/{id}/plan — load (or generate) the evaluation plan
"""

from fastapi import APIRouter, HTTPException
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

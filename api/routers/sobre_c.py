"""
api/routers/sobre_c.py
-----------------------
GET /tenders/{tender_id}/sobre-c

Returns deterministic Sobre C scores for all suppliers in a tender.
No LLM involved — pure formula-based scoring from the JSON submissions file.
"""

from fastapi import APIRouter, HTTPException
from graph.pipeline import TENDER_REGISTRY
from scoring.sobre_c import score_sobre_c
from api.schemas import SobreCResponse, SobreCSuplierResult, SobreCCriterionDetail

router = APIRouter(prefix="/tenders", tags=["sobre-c"])


@router.get("/{tender_id}/sobre-c", response_model=SobreCResponse)
def get_sobre_c(tender_id: str):
    if tender_id not in TENDER_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' not found")

    try:
        raw = score_sobre_c(tender_id=tender_id)
    except FileNotFoundError:
        raise HTTPException(
            status_code=404,
            detail=f"No sobre_c_submissions.json found for tender '{tender_id}'",
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))

    results = {
        sid: SobreCSuplierResult(
            name=data["name"],
            declared=data["declared"],
            criteria={
                field: SobreCCriterionDetail(**detail)
                for field, detail in data["criteria"].items()
            },
            total=data["total"],
        )
        for sid, data in raw.items()
    }

    return SobreCResponse(tender_id=tender_id, results=results)

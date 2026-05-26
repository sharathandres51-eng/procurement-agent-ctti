"""
api/routers/evaluate.py
-----------------------
POST /tenders/{tender_id}/evaluate

Runs the full supplier × criteria evaluation pipeline and streams
results back as Server-Sent Events (SSE) — one event per completed
supplier-criterion cell. The React frontend can render each card
as it arrives rather than waiting for the full pipeline to finish.

SSE event format
----------------
Each event is a JSON-encoded EvaluationProgressEvent.

  data: {"supplier_id": "supplier_a", "criterion_id": "pla_migracio",
         "subcriterion_id": null, "result": {...}}

A final sentinel event signals completion:

  data: {"done": true}
"""

import json
import asyncio
import time
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import StreamingResponse
from graph.pipeline import TENDER_REGISTRY, run_evaluation
from agents.planning_agent import load_or_generate_plan
from api.schemas import EvaluationRequest

router = APIRouter(prefix="/tenders", tags=["evaluate"])


def _contract_id(tender_id: str) -> str:
    return tender_id.upper().replace("_", "-")


def _sse(payload: dict) -> str:
    """Format a dict as an SSE data line."""
    return f"data: {json.dumps(payload)}\n\n"


def _run_pipeline(tender_id: str, language: str):
    """
    Generator that yields SSE strings as each evaluation cell completes.
    Runs synchronously in a thread pool (called via run_in_executor below).
    """
    config = TENDER_REGISTRY[tender_id]
    plan   = load_or_generate_plan(
        contract_id=_contract_id(tender_id),
        tender_id=tender_id,
    )

    suppliers = config["suppliers"]
    criteria  = plan["criteria"]

    for supplier in suppliers:
        for criterion in criteria:
            if criterion["has_subcriteria"]:
                for sc in criterion["subcriteria"]:
                    result = run_evaluation(
                        supplier_id=supplier["id"],
                        supplier_name=supplier["name"],
                        criterion=criterion,
                        subcriterion=sc,
                        tender_id=tender_id,
                        language=language,
                    )
                    event = {
                        "supplier_id":     supplier["id"],
                        "criterion_id":    criterion["id"],
                        "subcriterion_id": sc["id"],
                        "result":          result,
                    }
                    yield _sse(event)
                    time.sleep(10)
            else:
                result = run_evaluation(
                    supplier_id=supplier["id"],
                    supplier_name=supplier["name"],
                    criterion=criterion,
                    subcriterion=None,
                    tender_id=tender_id,
                    language=language,
                )
                event = {
                    "supplier_id":     supplier["id"],
                    "criterion_id":    criterion["id"],
                    "subcriterion_id": None,
                    "result":          result,
                }
                yield _sse(event)
                time.sleep(10)

    yield _sse({"done": True})


async def _stream(tender_id: str, language: str, request: Request):
    """
    Async wrapper: runs the blocking pipeline in a thread pool executor
    so it doesn't block the FastAPI event loop, and checks for client
    disconnects between cells.
    """
    loop = asyncio.get_event_loop()

    def blocking_gen():
        return list(_run_pipeline(tender_id, language))

    # Run entire pipeline in executor; yield results as they come
    # For true streaming we iterate synchronously in a thread
    import concurrent.futures
    executor = concurrent.futures.ThreadPoolExecutor(max_workers=1)

    gen = _run_pipeline(tender_id, language)

    def next_item():
        try:
            return next(gen)
        except StopIteration:
            return None

    while True:
        if await request.is_disconnected():
            break
        item = await loop.run_in_executor(executor, next_item)
        if item is None:
            break
        yield item


@router.post("/{tender_id}/evaluate")
async def evaluate(tender_id: str, body: EvaluationRequest, request: Request):
    if tender_id not in TENDER_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' not found")

    return StreamingResponse(
        _stream(tender_id, body.language, request),
        media_type="text/event-stream",
        headers={
            "Cache-Control":   "no-cache",
            "X-Accel-Buffering": "no",   # disable nginx buffering
        },
    )

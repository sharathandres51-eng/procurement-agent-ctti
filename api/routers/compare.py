"""
api/routers/compare.py
-----------------------
POST /tenders/{tender_id}/compare

Generates a cross-supplier comparison paragraph for a single criterion.
Called by the React UI after all three supplier cards for a criterion
have been scored.
"""

import time
import httpx
from fastapi import APIRouter, HTTPException
from langchain_mistralai import ChatMistralAI
from i18n import get_translations
from api.schemas import ComparisonRequest, ComparisonResponse

router = APIRouter(prefix="/tenders", tags=["compare"])

_llm = ChatMistralAI(model="mistral-large-latest", temperature=0)


@router.post("/{tender_id}/compare", response_model=ComparisonResponse)
def compare(tender_id: str, body: ComparisonRequest):
    t = get_translations(body.language)

    supplier_blocks = "\n\n".join(
        f"Supplier {sid}:\n{evidence}"
        for sid, evidence in body.evidence.items()
    )

    prompt = f"""{t["comparison_prompt_intro"]}
{t["llm_language_instruction"]}

Criterion: {body.criterion_name}

{supplier_blocks}

{t["comparison_prompt_instructions"]}
"""

    text = t["comparison_unavailable"]
    for attempt in range(5):
        try:
            response = _llm.invoke([{"role": "user", "content": prompt}])
            text = response.content
            break
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429 and attempt < 4:
                time.sleep(30 * (attempt + 1))
            else:
                raise HTTPException(status_code=502, detail="LLM API error")
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc))

    return ComparisonResponse(criterion_id=body.criterion_id, comparison_text=text)

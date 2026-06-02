"""
api/routers/sobre_c.py
-----------------------
GET  /tenders/{tender_id}/sobre-c/criteria   - criteria definition for the evaluator form
POST /tenders/{tender_id}/sobre-c/calculate  - score declared values submitted by the evaluator
"""

from fastapi import APIRouter, HTTPException
from graph.pipeline import TENDER_REGISTRY
from scoring.sobre_c import score_sobre_c
from api.schemas import (
    SobreCCalculateRequest,
    SobreCCriteriaResponse,
    SobreCResponse,
    SobreCSuplierResult,
    SobreCCriterionDetail,
)

router = APIRouter(prefix="/tenders", tags=["sobre-c"])

# Criteria definitions per tender.
# Each field: { label, max_points, direction ("lower"|"higher"), unit }
SOBRE_C_CRITERIA: dict[str, dict[str, dict]] = {
    "ctti_2026_36": {
        "price_eur": {
            "label":      "2.1 Valoració econòmica - total bid price",
            "max_points": 20,
            "direction":  "lower",
            "unit":       "EUR",
        },
        "ans_improvement_hours": {
            "label":      "2.2 Increment de nivell d'ANS - SLA improvement over minimum",
            "max_points": 5,
            "direction":  "higher",
            "unit":       "hours",
        },
        "manufacturer_services_days": {
            "label":      "2.3 Serveis professionals de fabricant - manufacturer professional services",
            "max_points": 10,
            "direction":  "higher",
            "unit":       "days",
        },
        "training_days": {
            "label":      "2.4 Formació de la solució implantada - training on deployed solution",
            "max_points": 5,
            "direction":  "higher",
            "unit":       "days",
        },
        "energy_kwh_per_node": {
            "label":      "2.5 Eficiència energètica - average power consumption per QKD node",
            "max_points": 3,
            "direction":  "lower",
            "unit":       "kWh",
        },
        "warranty_resolution_hours": {
            "label":      "2.6 Temps de resolució garantia fabricant - warranty fault resolution time",
            "max_points": 8,
            "direction":  "lower",
            "unit":       "hours",
        },
    },
    "ctti_2026_1": {
        "price_eur": {
            "label":      "2.1 Valoració econòmica - total bid price",
            "max_points": 20,
            "direction":  "lower",
            "unit":       "EUR",
        },
        "bandwidth_gbps": {
            "label":      "2.2 Amplada de banda garantida - guaranteed bandwidth",
            "max_points": 10,
            "direction":  "higher",
            "unit":       "Gbps",
        },
        "migration_weeks": {
            "label":      "2.3 Termini de migració - migration completion time",
            "max_points": 8,
            "direction":  "lower",
            "unit":       "weeks",
        },
        "uptime_pct": {
            "label":      "2.4 Disponibilitat garantida - guaranteed uptime",
            "max_points": 7,
            "direction":  "higher",
            "unit":       "%",
        },
        "support_response_hours": {
            "label":      "2.5 Temps de resposta suport - support response time",
            "max_points": 6,
            "direction":  "lower",
            "unit":       "hours",
        },
    },
    "ctti_2026_5": {
        "price_eur": {
            "label":      "2.1 Valoració econòmica - total bid price",
            "max_points": 20,
            "direction":  "lower",
            "unit":       "EUR",
        },
        "implementation_weeks": {
            "label":      "2.2 Termini d'implementació - system implementation time",
            "max_points": 10,
            "direction":  "lower",
            "unit":       "weeks",
        },
        "training_days": {
            "label":      "2.3 Formació inclosa - included training days",
            "max_points": 8,
            "direction":  "higher",
            "unit":       "days",
        },
        "storage_gb": {
            "label":      "2.4 Emmagatzematge inclòs - included storage capacity",
            "max_points": 7,
            "direction":  "higher",
            "unit":       "GB",
        },
        "sla_response_hours": {
            "label":      "2.5 Temps de resposta SLA - SLA incident response time",
            "max_points": 6,
            "direction":  "lower",
            "unit":       "hours",
        },
    },
}


@router.get("/{tender_id}/sobre-c/criteria", response_model=SobreCCriteriaResponse)
def get_sobre_c_criteria(tender_id: str):
    if tender_id not in TENDER_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' not found")
    if tender_id not in SOBRE_C_CRITERIA:
        raise HTTPException(status_code=404, detail=f"No Sobre C criteria defined for '{tender_id}'")

    criteria = SOBRE_C_CRITERIA[tender_id]
    total_points = sum(c["max_points"] for c in criteria.values())
    return SobreCCriteriaResponse(
        tender_id=tender_id,
        total_points=total_points,
        criteria=criteria,
    )


@router.post("/{tender_id}/sobre-c/calculate", response_model=SobreCResponse)
def calculate_sobre_c(tender_id: str, body: SobreCCalculateRequest):
    if tender_id not in TENDER_REGISTRY:
        raise HTTPException(status_code=404, detail=f"Tender '{tender_id}' not found")
    if tender_id not in SOBRE_C_CRITERIA:
        raise HTTPException(status_code=404, detail=f"No Sobre C criteria defined for '{tender_id}'")

    config = TENDER_REGISTRY[tender_id]
    all_names = {s["id"]: s["name"] for s in config["suppliers"]}

    # Score only the suppliers that were submitted (e.g. those admitted in
    # Sobre A). The proportionality formula is computed among these suppliers.
    provided = [sid for sid in body.declared_values if sid in all_names]
    if not provided:
        raise HTTPException(
            status_code=422,
            detail="No declared values for any known supplier in this tender.",
        )

    supplier_names = {sid: all_names[sid] for sid in provided}
    declared_values = {sid: body.declared_values[sid] for sid in provided}

    try:
        raw = score_sobre_c(
            criteria_def=SOBRE_C_CRITERIA[tender_id],
            declared_values=declared_values,
            supplier_names=supplier_names,
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

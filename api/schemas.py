"""
api/schemas.py
--------------
Pydantic request / response models for the CTTI procurement API.
"""

from __future__ import annotations
from typing import Any
from pydantic import BaseModel


# ── Tenders ───────────────────────────────────────────────────────────────────

class SupplierInfo(BaseModel):
    id: str
    name: str


class TenderSummary(BaseModel):
    tender_id: str
    label: str
    suppliers: list[SupplierInfo]


# ── Evaluation plan ───────────────────────────────────────────────────────────

class SubCriterionSchema(BaseModel):
    id: str
    name: str
    points: float
    query: str


class CriterionPlanSchema(BaseModel):
    id: str
    name: str
    max_points: float
    has_subcriteria: bool
    query: str
    subcriteria: list[SubCriterionSchema]


class EvaluationPlanResponse(BaseModel):
    contract_id: str
    tender_id: str
    generated_at: str
    criteria: list[CriterionPlanSchema]


# ── Evaluation results ────────────────────────────────────────────────────────

class EvaluationRequest(BaseModel):
    language: str = "en"
    # Optional list of supplier IDs to evaluate. When omitted or empty, all
    # suppliers in the tender are evaluated. Used to skip suppliers that did
    # not pass Sobre A (administrative qualification).
    supplier_ids: list[str] | None = None


class CriterionResult(BaseModel):
    tender_id: str
    supplier_id: str
    supplier_name: str
    criterion_id: str
    criterion_name: str
    max_points: float
    evidence: str
    agent_note: str
    subcriterion_id: str | None = None


# SSE event payload sent per completed cell
class EvaluationProgressEvent(BaseModel):
    supplier_id: str
    criterion_id: str
    subcriterion_id: str | None
    result: CriterionResult


# ── Comparison ────────────────────────────────────────────────────────────────

class ComparisonRequest(BaseModel):
    criterion_id: str
    criterion_name: str
    language: str = "en"
    evidence: dict[str, str]  # supplier_id → evidence text


class ComparisonResponse(BaseModel):
    criterion_id: str
    comparison_text: str


# ── Sobre C ───────────────────────────────────────────────────────────────────

class SobreCCriterionDef(BaseModel):
    label: str
    max_points: float
    direction: str
    unit: str


class SobreCCriteriaResponse(BaseModel):
    tender_id: str
    total_points: float
    criteria: dict[str, SobreCCriterionDef]
    # Stored declared values per supplier (supplier_id -> field -> value), so
    # the frontend can display an automatic scoring board without manual entry.
    declared: dict[str, dict[str, float]] = {}


class SobreCCalculateRequest(BaseModel):
    declared_values: dict[str, dict[str, float]]


class SobreCCriterionDetail(BaseModel):
    label: str
    max_points: float
    score: float
    direction: str


class SobreCSuplierResult(BaseModel):
    name: str
    declared: dict[str, Any]
    criteria: dict[str, SobreCCriterionDetail]
    total: float


class SobreCResponse(BaseModel):
    tender_id: str
    results: dict[str, SobreCSuplierResult]


# ── Audit ─────────────────────────────────────────────────────────────────────

class AuditEntryCreate(BaseModel):
    evaluator_id: str
    timestamp: str
    contract: str
    tender_label: str
    language: str
    regulatory_note: str
    scores: dict[str, Any]
    evidence: dict[str, Any]


class AuditEntryResponse(BaseModel):
    id: int | None = None
    evaluator_id: str
    timestamp: str
    contract: str
    tender_label: str
    language: str
    regulatory_note: str
    scores: dict[str, Any]
    evidence: dict[str, Any]


class AuditExportMetadata(BaseModel):
    generated_at: str
    record_count: int
    regulatory_basis: str


class AuditExportResponse(BaseModel):
    export_metadata: AuditExportMetadata
    entries: list[dict[str, Any]]

from typing import TypedDict


class EvalState(TypedDict):
    tender_id:      str    # e.g. "ctti_2026_36"
    language:       str    # "en" | "es" | "ca"
    supplier_id:    str    # e.g. "supplier_a"
    supplier_name:  str    # e.g. "QuantumNet Solutions SL"
    criterion_id:   str    # e.g. "pla_migracio"
    criterion_query: str   # natural language query for retrieval
    raw_chunks:     list   # written by retrieval_agent
    evidence:       str    # verbatim passage from analysis_agent
    agent_note:     str    # flags: missing content, uncertainty
    criterion_name: str    # human-readable label from TENDER_REGISTRY
    max_points:     int    # authoritative value from TENDER_REGISTRY

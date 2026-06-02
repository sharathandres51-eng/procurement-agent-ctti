from typing import TypedDict


class EvalState(TypedDict):
    tender_id: str            # e.g. "ctti_2026_36"
    language: str             # "en" | "es" | "ca"
    supplier_id: str          # e.g. "supplier_a"
    supplier_name: str        # e.g. "QuantumNet Solutions SL"
    criterion_id: str         # e.g. "pla_migracio"
    criterion_query: str      # natural language query for retrieval
    evaluation_plan: dict     # full plan from planning_agent
    current_criterion: dict   # criterion being evaluated (from plan)
    current_subcriterion: dict  # sub-criterion if applicable; empty dict if none
    raw_chunks: list          # written by retrieval_agent
    evidence: str             # verbatim passage from analysis_agent
    agent_note: str           # flags: missing content, uncertainty
    criterion_name: str       # set by pipeline from plan (combined "Parent - Sub" for sub-criteria)
    max_points: float         # float to support sub-criterion values like 1.5, 4.5

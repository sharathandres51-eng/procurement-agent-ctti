from typing import TypedDict


class EvalState(TypedDict):
    supplier_id: str          # e.g. "supplier_a"
    supplier_name: str        # e.g. "QuantumNet Solutions SL"
    criterion_id: str         # e.g. "pla_migracio"
    criterion_query: str      # natural language query for retrieval
    evaluation_plan: dict     # full plan from planning_agent
    current_criterion: dict   # criterion being evaluated
    current_subcriterion: dict  # sub-criterion if applicable; empty dict if none
    raw_chunks: list          # written by retrieval_agent
    evidence: str             # verbatim passage from analysis_agent
    agent_note: str           # flags: missing content, uncertainty
    criterion_name: str       # extracted from PCAP by analysis_agent
    max_points: float         # extracted from PCAP by analysis_agent

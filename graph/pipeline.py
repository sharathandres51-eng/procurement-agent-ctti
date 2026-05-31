import time
from dotenv import load_dotenv
load_dotenv()

from langgraph.graph import StateGraph
from graph.state import EvalState
from agents.retrieval_agent import retrieval_agent
from agents.analysis_agent import analysis_agent
from agents.planning_agent import load_or_generate_plan

# ── Tender registry ────────────────────────────────────────────────────────────
# Add a new tender here and it appears automatically in the UI dropdown.
# The Planning Agent reads the PCAP from the FAISS index at runtime to
# generate the evaluation plan — the registry only needs supplier metadata.

TENDER_REGISTRY: dict[str, dict] = {
    "ctti_2026_36": {
        "contract_id": "CTTI-2026-36",
        "label": "CTTI-2026-36 — QKD Infrastructure",
        "suppliers": [
            {"id": "supplier_a", "name": "QuantumNet Solutions SL"},
            {"id": "supplier_b", "name": "CyberQuantum Iberia SL"},
            {"id": "supplier_c", "name": "SecureComms Catalunya SA"},
        ],
    },
    "ctti_2026_1": {
        "contract_id": "CTTI-2026-1",
        "label": "CTTI-2026-1 — Connectivity Migration Support",
        "suppliers": [
            {"id": "supplier_a", "name": "ConnecTech Iberia SL"},
            {"id": "supplier_b", "name": "FibraXarxa Partners SA"},
            {"id": "supplier_c", "name": "Xarxes Catalunya Grup SL"},
        ],
    },
    "ctti_2026_5": {
        "contract_id": "CTTI-2026-5",
        "label": "CTTI-2026-5 — Museums Collections System",
        "suppliers": [
            {"id": "supplier_a", "name": "MuseumSoft Iberia SL"},
            {"id": "supplier_b", "name": "ColeccioTech Partners SA"},
            {"id": "supplier_c", "name": "PatrimoniSaaS Catalunya SL"},
        ],
    },
}

DEFAULT_TENDER_ID = "ctti_2026_36"


def get_tender_config(tender_id: str) -> dict:
    if tender_id not in TENDER_REGISTRY:
        raise ValueError(
            f"Unknown tender: {tender_id!r}. Available: {list(TENDER_REGISTRY)}"
        )
    return TENDER_REGISTRY[tender_id]


# ── LangGraph pipeline (compiled once; stateless per invocation) ───────────────

graph_builder = StateGraph(EvalState)
graph_builder.add_node("retrieval_agent", retrieval_agent)
graph_builder.add_node("analysis_agent", analysis_agent)
graph_builder.add_edge("retrieval_agent", "analysis_agent")
graph_builder.set_entry_point("retrieval_agent")
graph_builder.set_finish_point("analysis_agent")
pipeline = graph_builder.compile()


def run_evaluation(
    supplier_id: str,
    supplier_name: str,
    criterion: dict,
    tender_id: str,
    language: str = "en",
    subcriterion: dict = None,
) -> dict:
    if subcriterion:
        query          = subcriterion["query"]
        criterion_id   = subcriterion["id"]
        criterion_name = f"{criterion['name']} — {subcriterion['name']}"
        max_points     = subcriterion["points"]
    else:
        query          = criterion["query"]
        criterion_id   = criterion["id"]
        criterion_name = criterion["name"]
        max_points     = criterion["max_points"]

    initial_state = EvalState(
        tender_id=tender_id,
        language=language,
        supplier_id=supplier_id,
        supplier_name=supplier_name,
        criterion_id=criterion_id,
        criterion_query=query,
        evaluation_plan={},
        current_criterion=criterion,
        current_subcriterion=subcriterion or {},
        raw_chunks=[],
        evidence="",
        agent_note="",
        criterion_name=criterion_name,
        max_points=max_points,
    )

    result = pipeline.invoke(initial_state)

    return {
        "tender_id":      tender_id,
        "supplier_id":    supplier_id,
        "supplier_name":  supplier_name,
        "criterion_id":   criterion["id"],
        "subcriterion_id": subcriterion["id"] if subcriterion else None,
        "criterion_name": result["criterion_name"],
        "max_points":     result["max_points"],
        "evidence":       result["evidence"],
        "agent_note":     result["agent_note"],
    }


def run_all_evaluations(
    plan: dict,
    tender_id: str = DEFAULT_TENDER_ID,
    language: str = "en",
) -> dict:
    config  = get_tender_config(tender_id)
    results: dict[str, dict] = {}

    for supplier in config["suppliers"]:
        results[supplier["id"]] = {}

        for criterion in plan["criteria"]:

            if criterion["has_subcriteria"]:
                results[supplier["id"]][criterion["id"]] = {
                    "has_subcriteria":  True,
                    "criterion_name":   criterion["name"],
                    "max_points":       criterion["max_points"],
                    "subcriteria":      {},
                }
                for sc in criterion["subcriteria"]:
                    print(
                        f"  {supplier['name']} — "
                        f"{criterion['name']} — {sc['name']}..."
                    )
                    result = run_evaluation(
                        supplier_id=supplier["id"],
                        supplier_name=supplier["name"],
                        criterion=criterion,
                        tender_id=tender_id,
                        language=language,
                        subcriterion=sc,
                    )
                    results[supplier["id"]][criterion["id"]]["subcriteria"][sc["id"]] = result
                    time.sleep(10)

            else:
                print(f"  {supplier['name']} — {criterion['name']}...")
                result = run_evaluation(
                    supplier_id=supplier["id"],
                    supplier_name=supplier["name"],
                    criterion=criterion,
                    tender_id=tender_id,
                    language=language,
                )
                results[supplier["id"]][criterion["id"]] = result
                time.sleep(10)

    return results

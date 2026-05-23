import time
from dotenv import load_dotenv
load_dotenv()

from langgraph.graph import StateGraph
from graph.state import EvalState
from agents.retrieval_agent import retrieval_agent
from agents.analysis_agent import analysis_agent
from agents.planning_agent import load_or_generate_plan

SUPPLIERS = [
    {"id": "supplier_a", "name": "QuantumNet Solutions SL"},
    {"id": "supplier_b", "name": "CyberQuantum Iberia SL"},
    {"id": "supplier_c", "name": "SecureComms Catalunya SA"},
]

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
    subcriterion: dict = None,
) -> dict:
    if subcriterion:
        query = subcriterion["query"]
        criterion_id = subcriterion["id"]
    else:
        query = criterion["query"]
        criterion_id = criterion["id"]

    initial_state = EvalState(
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
        criterion_name="",
        max_points=0,
    )

    result = pipeline.invoke(initial_state)

    return {
        "supplier_id": supplier_id,
        "supplier_name": supplier_name,
        "criterion_id": criterion["id"],
        "subcriterion_id": subcriterion["id"] if subcriterion else None,
        "criterion_name": result["criterion_name"],
        "max_points": result["max_points"],
        "evidence": result["evidence"],
        "agent_note": result["agent_note"],
    }


def run_all_evaluations(plan: dict) -> dict:
    results = {}

    for supplier in SUPPLIERS:
        results[supplier["id"]] = {}

        for criterion in plan["criteria"]:

            if criterion["has_subcriteria"]:
                results[supplier["id"]][criterion["id"]] = {
                    "has_subcriteria": True,
                    "criterion_name": criterion["name"],
                    "max_points": criterion["max_points"],
                    "subcriteria": {},
                }

                for sc in criterion["subcriteria"]:
                    print(
                        f"  {supplier['name']} — "
                        f"{criterion['name']} — "
                        f"{sc['name']}..."
                    )
                    result = run_evaluation(
                        supplier_id=supplier["id"],
                        supplier_name=supplier["name"],
                        criterion=criterion,
                        subcriterion=sc,
                    )
                    results[supplier["id"]][criterion["id"]]["subcriteria"][sc["id"]] = result
                    time.sleep(10)

            else:
                print(
                    f"  {supplier['name']} — "
                    f"{criterion['name']}..."
                )
                result = run_evaluation(
                    supplier_id=supplier["id"],
                    supplier_name=supplier["name"],
                    criterion=criterion,
                )
                results[supplier["id"]][criterion["id"]] = result
                time.sleep(10)

    return results

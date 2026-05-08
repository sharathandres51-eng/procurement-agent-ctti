import time
from dotenv import load_dotenv
load_dotenv()

from langgraph.graph import StateGraph
from graph.state import EvalState
from agents.retrieval_agent import retrieval_agent
from agents.analysis_agent import analysis_agent

SUPPLIERS = [
    {"id": "supplier_a", "name": "QuantumNet Solutions SL"},
    {"id": "supplier_b", "name": "CyberQuantum Iberia SL"},
    {"id": "supplier_c", "name": "SecureComms Catalunya SA"},
]

CRITERION_QUERIES = [
    {
        "id": "pla_migracio",
        "query": (
            "team qualifications quantity dedication references "
            "migration plan phase pla de migracio"
        ),
    },
    {
        "id": "execucio_critica",
        "query": (
            "team execution deployment risks mitigation monitoring "
            "tool documentation equipment flexibility technical "
            "specifications robustness execucio critica desplegament"
        ),
    },
    {
        "id": "analisi_dades",
        "query": (
            "team qualifications dedication references data "
            "analysis phase analisi de les dades"
        ),
    },
    {
        "id": "pla_devolucio",
        "query": (
            "handover plan devolution team qualifications warranty "
            "support dimensioning pla de devolucio del servei"
        ),
    },
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
    criterion_id: str,
    criterion_query: str,
) -> dict:
    initial_state = EvalState(
        supplier_id=supplier_id,
        supplier_name=supplier_name,
        criterion_id=criterion_id,
        criterion_query=criterion_query,
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
        "criterion_id": criterion_id,
        "criterion_name": result["criterion_name"],
        "max_points": result["max_points"],
        "evidence": result["evidence"],
        "agent_note": result["agent_note"],
    }


def run_all_evaluations() -> dict:
    results = {}
    for supplier in SUPPLIERS:
        results[supplier["id"]] = {}
        for criterion in CRITERION_QUERIES:
            print(f"  Evaluating {supplier['name']} — {criterion['id']}...")
            result = run_evaluation(
                supplier_id=supplier["id"],
                supplier_name=supplier["name"],
                criterion_id=criterion["id"],
                criterion_query=criterion["query"],
            )
            results[supplier["id"]][criterion["id"]] = result
            time.sleep(10)
    return results

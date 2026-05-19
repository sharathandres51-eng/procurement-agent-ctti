import time
from dotenv import load_dotenv
load_dotenv()

from langgraph.graph import StateGraph
from graph.state import EvalState
from agents.retrieval_agent import retrieval_agent
from agents.analysis_agent import analysis_agent

# ── Tender registry ────────────────────────────────────────────────────────────
# Add a new tender here and it appears automatically in the UI dropdown.

TENDER_REGISTRY: dict[str, dict] = {
    "ctti_2026_36": {
        "label": "CTTI-2026-36 — QKD Infrastructure",
        "suppliers": [
            {"id": "supplier_a", "name": "QuantumNet Solutions SL"},
            {"id": "supplier_b", "name": "CyberQuantum Iberia SL"},
            {"id": "supplier_c", "name": "SecureComms Catalunya SA"},
        ],
        "criteria": [
            {
                "id": "pla_migracio",
                "label": "Criterion 1.1 — Pla de Migració",
                "max_points": 9,
                "query": (
                    "team qualifications quantity dedication references "
                    "migration plan phase pla de migracio"
                ),
            },
            {
                "id": "execucio_critica",
                "label": "Criterion 1.2 — Execució Crítica i Desplegament",
                "max_points": 30,
                "query": (
                    "team execution deployment risks mitigation monitoring "
                    "tool documentation equipment flexibility technical "
                    "specifications robustness execucio critica desplegament"
                ),
            },
            {
                "id": "analisi_dades",
                "label": "Criterion 1.3 — Anàlisi de les Dades",
                "max_points": 5,
                "query": (
                    "team qualifications dedication references data "
                    "analysis phase analisi de les dades"
                ),
            },
            {
                "id": "pla_devolucio",
                "label": "Criterion 1.4 — Pla de Devolució del Servei",
                "max_points": 5,
                "query": (
                    "handover plan devolution team qualifications warranty "
                    "support dimensioning pla de devolucio del servei"
                ),
            },
        ],
    },
    "ctti_2026_44": {
        "label": "CTTI-2026-44 — Cloud Infrastructure Migration",
        "suppliers": [
            {"id": "supplier_a", "name": "CloudPath Solutions SL"},
            {"id": "supplier_b", "name": "NexCloud Iberia SA"},
            {"id": "supplier_c", "name": "InfraTech Catalunya SA"},
        ],
        "criteria": [
            {
                "id": "pla_migracio_sistemes",
                "label": "Criterion 1.1 — Pla de Migració de Sistemes",
                "max_points": 10,
                "query": (
                    "migration plan team qualifications phasing workload "
                    "wave rollback dependency management public sector references"
                ),
            },
            {
                "id": "arquitectura_tecnica",
                "label": "Criterion 1.2 — Arquitectura Tècnica Proposada",
                "max_points": 20,
                "query": (
                    "hybrid cloud architecture Azure AWS BSC private cloud "
                    "resilience high availability interoperability CTTI systems "
                    "network design connectivity landing zone"
                ),
            },
            {
                "id": "seguretat_compliance",
                "label": "Criterion 1.3 — Seguretat i Compliment Normatiu",
                "max_points": 12,
                "query": (
                    "ENS Esquema Nacional Seguretat GDPR data sovereignty "
                    "encryption key management compliance certification "
                    "security controls audit"
                ),
            },
            {
                "id": "transicio_servei",
                "label": "Criterion 1.4 — Pla de Transició del Servei",
                "max_points": 7,
                "query": (
                    "service transition handover knowledge transfer support "
                    "warranty period documentation runbooks training"
                ),
            },
        ],
    },
    "ctti_2026_51": {
        "label": "CTTI-2026-51 — Cybersecurity SOC Services",
        "suppliers": [
            {"id": "supplier_a", "name": "CyberShield Catalunya SL"},
            {"id": "supplier_b", "name": "SecOps Iberia SA"},
            {"id": "supplier_c", "name": "GuardNet Partners SL"},
        ],
        "criteria": [
            {
                "id": "equip_soc",
                "label": "Criterion 1.1 — Equip i Qualificacions del SOC",
                "max_points": 15,
                "query": (
                    "SOC team analyst qualifications certifications GCFE GREM "
                    "OSCP dedicated FTE experience incident response CCN-CERT"
                ),
            },
            {
                "id": "deteccio_resposta",
                "label": "Criterion 1.2 — Capacitat de Detecció i Resposta",
                "max_points": 20,
                "query": (
                    "SIEM SOAR detection use cases playbooks ATT&CK triage "
                    "automated response EPS capacity incident handling Splunk "
                    "QRadar correlation rules"
                ),
            },
            {
                "id": "intel_amenaces",
                "label": "Criterion 1.3 — Intel·ligència d'Amenaces",
                "max_points": 9,
                "query": (
                    "threat intelligence CTI feeds IoC operationalisation "
                    "threat hunting MISP proactive detection adversary tracking"
                ),
            },
            {
                "id": "reporting_governanca",
                "label": "Criterion 1.4 — Reporting i Governança",
                "max_points": 5,
                "query": (
                    "SLA reporting escalation procedures governance framework "
                    "KPI dashboard weekly monthly quarterly audit"
                ),
            },
        ],
    },
}

# ── Default tender (used by legacy single-tender callers) ──────────────────────
DEFAULT_TENDER_ID = "ctti_2026_36"


def get_tender_config(tender_id: str) -> dict:
    if tender_id not in TENDER_REGISTRY:
        raise ValueError(f"Unknown tender: {tender_id!r}. "
                         f"Available: {list(TENDER_REGISTRY)}")
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
    criterion_id: str,
    criterion_label: str,
    criterion_query: str,
    criterion_max_points: int,
    tender_id: str,
    language: str = "en",
) -> dict:
    initial_state = EvalState(
        tender_id=tender_id,
        language=language,
        supplier_id=supplier_id,
        supplier_name=supplier_name,
        criterion_id=criterion_id,
        criterion_query=criterion_query,
        raw_chunks=[],
        evidence="",
        agent_note="",
        criterion_name=criterion_label,
        max_points=criterion_max_points,
    )
    result = pipeline.invoke(initial_state)
    return {
        "tender_id":      tender_id,
        "supplier_id":    supplier_id,
        "supplier_name":  supplier_name,
        "criterion_id":   criterion_id,
        "criterion_name": result["criterion_name"],
        "max_points":     result["max_points"],
        "evidence":       result["evidence"],
        "agent_note":     result["agent_note"],
    }


def run_all_evaluations(tender_id: str = DEFAULT_TENDER_ID,
                        language: str = "en") -> dict:
    config = get_tender_config(tender_id)
    results: dict[str, dict] = {}

    for supplier in config["suppliers"]:
        results[supplier["id"]] = {}
        for criterion in config["criteria"]:
            print(f"  Evaluating {supplier['name']} — {criterion['id']}...")
            result = run_evaluation(
                supplier_id=supplier["id"],
                supplier_name=supplier["name"],
                criterion_id=criterion["id"],
                criterion_label=criterion["label"],
                criterion_query=criterion["query"],
                criterion_max_points=criterion["max_points"],
                tender_id=tender_id,
                language=language,
            )
            results[supplier["id"]][criterion["id"]] = result
            time.sleep(10)

    return results

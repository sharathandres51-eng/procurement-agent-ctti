import re
import time
import httpx
from dotenv import load_dotenv
from langchain_mistralai import ChatMistralAI
from rag.retriever import retrieve_criteria
from graph.state import EvalState

load_dotenv()

llm = ChatMistralAI(model="mistral-large-latest", temperature=0)

CRITERION_LABELS = {
    "pla_migracio":     "Criterion 1.1 — Pla de Migració",
    "execucio_critica": "Criterion 1.2 — Execució Crítica i Desplegament",
    "analisi_dades":    "Criterion 1.3 — Anàlisi de les Dades",
    "pla_devolucio":    "Criterion 1.4 — Pla de Devolució del Servei",
}

CRITERION_MAX_POINTS = {
    "pla_migracio":     9,
    "execucio_critica": 30,
    "analisi_dades":    5,
    "pla_devolucio":    5,
}


def analysis_agent(state: EvalState) -> dict:
    criteria_chunks = retrieve_criteria(query=state["criterion_query"], k=5)
    criteria_context = "\n\n---\n\n".join(c["text"] for c in criteria_chunks)
    proposal_context = "\n\n---\n\n".join(c["text"] for c in state["raw_chunks"])

    current_criterion = state.get("current_criterion") or {}
    current_subcriterion = state.get("current_subcriterion") or {}

    criterion_label = (
        current_criterion.get("name")
        or CRITERION_LABELS.get(state["criterion_id"], state["criterion_id"])
    )
    known_max = (
        current_criterion.get("max_points")
        or CRITERION_MAX_POINTS.get(state["criterion_id"], 0)
    )

    if current_subcriterion:
        subcriterion_name = current_subcriterion["name"]
        subcriterion_points = current_subcriterion["points"]
        combined_name = f"{criterion_label} — {subcriterion_name}"

        prompt = f"""You are assisting a procurement evaluation committee at CTTI evaluating contract CTTI-2026-36.

You are evaluating ONE SPECIFIC SUB-CRITERION only.

Parent criterion: {criterion_label} (total {known_max} pts)
Sub-criterion: {subcriterion_name}
Points for this sub-criterion: {subcriterion_points} pts

What to look for: {state['criterion_query']}

PCAP AND PPT CONTEXT:
{criteria_context}

SUPPLIER PROPOSAL EXCERPTS:
{proposal_context}

Tasks:
1. Return criterion_name as: "{combined_name}"
2. Return max_points as: {subcriterion_points}
3. Quote the single most relevant verbatim passage from the proposal addressing this specific sub-criterion only.
4. Write an agent note (2-3 sentences):
   - What is present and relevant
   - What is missing relative to the PCAP requirement
   - Whether the evidence fully, partially, or insufficiently addresses this sub-criterion
   - Note that this sub-criterion is worth {subcriterion_points} of {known_max} total points

IMPORTANT FORMATTING RULES:
- Use plain text only. Do not use markdown, asterisks, code fences, or bold formatting.
- MAX_POINTS must be {subcriterion_points}.
- Respond in exactly this format with no additional text:

CRITERION_NAME: {combined_name}
MAX_POINTS: {subcriterion_points}
EVIDENCE: <verbatim multi-sentence quote from the supplier proposal>
AGENT_NOTE: <2-3 sentence observation>"""

    else:
        prompt = f"""You are assisting a procurement evaluation committee at the Government of Catalonia (CTTI) in evaluating technical proposals for contract CTTI-2026-36, a quantum key distribution infrastructure procurement.

Your role is to surface relevant evidence from the supplier proposal to assist the human evaluator. You do NOT score or recommend. The human evaluator assigns all scores independently.

YOU ARE EVALUATING: {criterion_label} (maximum {known_max} points)
Focus exclusively on this criterion. Ignore other criteria even if they appear in the context below.

EVALUATION CRITERION CONTEXT (from PCAP Annex 2 and PPT):
{criteria_context}

SUPPLIER PROPOSAL EXCERPTS (Sobre B):
{proposal_context}

Your tasks:
1. State the criterion name as "{criterion_label}" and its maximum points as {known_max}.
2. Find and quote the single most relevant verbatim passage from the supplier proposal excerpts that directly addresses this criterion. Quote exactly as it appears in the text. The passage must be at least 2 sentences long.
3. Write a concise agent note (2-3 sentences) identifying:
   - What is present and relevant in the proposal
   - What is missing or insufficiently evidenced relative to the PCAP and PPT requirements
   - Any vague or unsubstantiated claims the evaluator should probe further

IMPORTANT FORMATTING RULES:
- Use plain text only. Do not use markdown, asterisks, code fences, or bold formatting.
- MAX_POINTS must be the value {known_max}.
- Respond in exactly this format with no additional text:

CRITERION_NAME: {criterion_label}
MAX_POINTS: {known_max}
EVIDENCE: <verbatim multi-sentence quote from the supplier proposal>
AGENT_NOTE: <2-3 sentence observation>"""

    for attempt in range(5):
        try:
            response = llm.invoke([{"role": "user", "content": prompt}])
            break
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429 and attempt < 4:
                wait = 30 * (attempt + 1)
                print(f"    Rate limited — waiting {wait}s before retry {attempt + 1}/4...")
                time.sleep(wait)
            else:
                raise

    text = response.content

    text = re.sub(r"^```[^\n]*\n?", "", text.strip())
    text = re.sub(r"\n?```$", "", text.strip())
    cleaned = re.sub(r"\*\*([A-Z_]+):\*\*", r"\1:", text)

    pattern = re.compile(
        r"CRITERION_NAME:\s*(.*?)\s*MAX_POINTS:\s*(\d+\.?\d*)\s*EVIDENCE:\s*(.*?)\s*AGENT_NOTE:\s*(.*)",
        re.DOTALL,
    )
    m = pattern.search(cleaned)

    if m:
        criterion_name = m.group(1).strip()
        try:
            max_points = round(float(m.group(2).strip()), 1)
        except ValueError:
            max_points = known_max
        evidence = m.group(3).strip()
        agent_note = m.group(4).strip()
    else:
        keys = ["CRITERION_NAME", "MAX_POINTS", "EVIDENCE", "AGENT_NOTE"]
        fields: dict[str, list[str]] = {k: [] for k in keys}
        current_key: str | None = None

        for line in cleaned.splitlines():
            matched_key = None
            for key in keys:
                if re.match(rf"^{key}:", line):
                    matched_key = key
                    break
            if matched_key:
                current_key = matched_key
                fields[current_key].append(re.sub(rf"^{current_key}:\s*", "", line))
            elif current_key:
                fields[current_key].append(line)

        criterion_name = " ".join(fields["CRITERION_NAME"]).strip()
        try:
            max_points = round(float(" ".join(fields["MAX_POINTS"]).strip().split()[0]), 1)
        except (ValueError, IndexError):
            max_points = known_max
        evidence = "\n".join(fields["EVIDENCE"]).strip()
        agent_note = "\n".join(fields["AGENT_NOTE"]).strip()

    if max_points == 0:
        max_points = known_max

    return {
        "evidence": evidence,
        "agent_note": agent_note,
        "criterion_name": criterion_name,
        "max_points": max_points,
    }

import re
import time
import httpx
from dotenv import load_dotenv
from langchain_mistralai import ChatMistralAI
from rag.retriever import retrieve_criteria
from graph.state import EvalState
from i18n import get_translations

load_dotenv()

llm = ChatMistralAI(model="mistral-large-latest", temperature=0)


def analysis_agent(state: EvalState) -> dict:
    # criterion_name and max_points come directly from the TENDER_REGISTRY
    # via pipeline.py — no hardcoded lookup tables needed here.
    criterion_label = state["criterion_name"]
    known_max       = state["max_points"]
    tender_id       = state["tender_id"]
    language        = state.get("language", "en")
    t               = get_translations(language)
    lang_instruction = t["llm_language_instruction"]

    criteria_chunks  = retrieve_criteria(
        query=state["criterion_query"],
        tender_id=tender_id,
        k=5,
    )
    criteria_context = "\n\n---\n\n".join(c["text"] for c in criteria_chunks)
    proposal_context = "\n\n---\n\n".join(c["text"] for c in state["raw_chunks"])

    prompt = f"""You are assisting a procurement evaluation committee at the Government of Catalonia (CTTI) in evaluating technical proposals for contract {tender_id.upper().replace("_", "-")}.
{lang_instruction}

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
- MAX_POINTS must be the integer {known_max}.
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

    # Strip markdown code fences if the LLM wrapped its output
    text = re.sub(r"^```[^\n]*\n?", "", text.strip())
    text = re.sub(r"\n?```$", "", text.strip())

    # Strip markdown bold markers (**KEY:**)
    cleaned = re.sub(r"\*\*([A-Z_]+):\*\*", r"\1:", text)

    pattern = re.compile(
        r"CRITERION_NAME:\s*(.*?)\s*MAX_POINTS:\s*(\d+)\s*EVIDENCE:\s*(.*?)\s*AGENT_NOTE:\s*(.*)",
        re.DOTALL,
    )
    m = pattern.search(cleaned)

    if m:
        criterion_name = m.group(1).strip()
        try:
            max_points = int(m.group(2).strip())
        except ValueError:
            max_points = known_max
        evidence   = m.group(3).strip()
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
            max_points = int(" ".join(fields["MAX_POINTS"]).strip().split()[0])
        except (ValueError, IndexError):
            max_points = known_max
        evidence   = "\n".join(fields["EVIDENCE"]).strip()
        agent_note = "\n".join(fields["AGENT_NOTE"]).strip()

    # Final fallback: if max_points still 0, use authoritative value from registry
    if max_points == 0:
        max_points = known_max

    return {
        "evidence":       evidence,
        "agent_note":     agent_note,
        "criterion_name": criterion_name,
        "max_points":     max_points,
    }

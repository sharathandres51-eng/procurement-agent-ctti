from dotenv import load_dotenv
load_dotenv()

import streamlit as st
import json
import time
import httpx
from datetime import datetime
from langchain_mistralai import ChatMistralAI
from graph.pipeline import run_all_evaluations, SUPPLIERS, CRITERION_QUERIES

st.set_page_config(
    page_title="CTTI Tender Evaluation — CTTI-2026-36",
    layout="wide"
)

st.markdown("""
<style>
.amber-box {
    background: #2d1f00;
    border: 1.5px solid #f59e0b;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 8px;
}
.ai-label {
    font-size: 10px;
    font-weight: 700;
    color: #f59e0b;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    margin-bottom: 6px;
}
.agent-note {
    font-size: 11px;
    color: #94a3b8;
    font-style: italic;
    margin-top: 6px;
}
.evidence-text {
    font-size: 12px;
    color: #e2e8f0;
    line-height: 1.6;
}
.comparison-panel {
    background: #0f2d1f;
    border: 1.5px solid #22c55e;
    border-radius: 8px;
    padding: 12px 16px;
    margin-top: 12px;
}
</style>
""", unsafe_allow_html=True)

# ── Session state initialisation ──────────────────────────────────────────────

if "results" not in st.session_state:
    st.session_state.results = None
if "scores" not in st.session_state:
    st.session_state.scores = {
        s["id"]: {c["id"]: None for c in CRITERION_QUERIES}
        for s in SUPPLIERS
    }
if "audit_log" not in st.session_state:
    st.session_state.audit_log = []
if "submitted" not in st.session_state:
    st.session_state.submitted = False

# ── Comparison helper ─────────────────────────────────────────────────────────

_comparison_llm = ChatMistralAI(model="mistral-large-latest", temperature=0)


def get_comparison(criterion_id: str, criterion_name: str, results: dict) -> str:
    cache_key = f"comparison_{criterion_id}"
    if cache_key in st.session_state:
        return st.session_state[cache_key]

    prompt = f"""You are summarising how three suppliers compare on a single evaluation criterion for a procurement officer at CTTI.

Criterion: {criterion_name}

Supplier A ({SUPPLIERS[0]['name']}):
{results[SUPPLIERS[0]['id']][criterion_id]['evidence']}

Supplier B ({SUPPLIERS[1]['name']}):
{results[SUPPLIERS[1]['id']][criterion_id]['evidence']}

Supplier C ({SUPPLIERS[2]['name']}):
{results[SUPPLIERS[2]['id']][criterion_id]['evidence']}

Write 3 bullet points — one per supplier — comparing their relative strengths and weaknesses on this criterion.
Be concise. Do not recommend a winner.
Maximum 2 sentences per bullet.
"""
    text = "Comparison temporarily unavailable."
    for attempt in range(5):
        try:
            response = _comparison_llm.invoke([{"role": "user", "content": prompt}])
            text = response.content
            break
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code == 429 and attempt < 4:
                time.sleep(30 * (attempt + 1))
            else:
                break
        except Exception:
            break

    st.session_state[cache_key] = text
    return text


# ── Tabs ──────────────────────────────────────────────────────────────────────

tab1, tab2 = st.tabs(["📊 Evaluation Dashboard", "📝 Audit Log"])

# ═══════════════════════════════════════════════════════════════════════════════
# TAB 1 — EVALUATION DASHBOARD
# ═══════════════════════════════════════════════════════════════════════════════

with tab1:
    st.title("Tender Evaluation Workbench")
    st.caption(
        "CTTI-2026-36 · Quantum Key Distribution Infrastructure · "
        "Internal use only — Mesa de Contractació"
    )

    st.markdown("**Suppliers loaded:**")
    for supplier in SUPPLIERS:
        st.markdown(f"✓ {supplier['name']}")

    st.divider()

    run_button = st.button(
        "▶ Run Evaluation",
        type="primary",
        disabled=st.session_state.results is not None,
    )

    if run_button:
        with st.spinner("Agent evaluating all suppliers and criteria..."):
            st.session_state.results = run_all_evaluations()
        st.rerun()

    if st.session_state.results is None:
        st.info(
            "Click 'Run Evaluation' to begin. "
            "The agent will analyse all three suppliers across all four criteria."
        )
        st.stop()

    # ── Evaluation grid ───────────────────────────────────────────────────────

    results = st.session_state.results

    st.subheader("Evaluation Grid")
    st.caption(
        "Read the AI-surfaced evidence for each cell. "
        "Assign your score independently. "
        "AI output is advisory only."
    )

    for criterion in CRITERION_QUERIES:
        st.markdown("---")
        st.markdown(
            f"### Criterion {criterion['id'].replace('_', ' ').title()}"
        )

        cols = st.columns(3)

        for supplier, col in zip(SUPPLIERS, cols):
            with col:
                result = results[supplier["id"]][criterion["id"]]
                supplier_name = supplier["name"]
                max_points = result["max_points"]
                evidence = result["evidence"]
                agent_note = result["agent_note"]
                criterion_name = result["criterion_name"]

                st.markdown(f"**{supplier_name}**")
                st.caption(f"{criterion_name} · max {max_points} pts")

                st.markdown(
                    f"""<div class="amber-box">
    <div class="ai-label">🤖 AI-generated — review required</div>
    <div class="evidence-text">{evidence}</div>
    <div class="agent-note">⚠️ {agent_note}</div>
</div>""",
                    unsafe_allow_html=True,
                )

                stored = st.session_state.scores[supplier["id"]][criterion["id"]]
                score = st.number_input(
                    label=f"Score (0–{max_points})",
                    min_value=0,
                    max_value=max_points,
                    value=stored if stored is not None else 0,
                    step=1,
                    key=f"score_{supplier['id']}_{criterion['id']}",
                )
                st.session_state.scores[supplier["id"]][criterion["id"]] = score

        # Cross-supplier comparison panel — shown once all three are scored
        all_scored_for_criterion = all(
            st.session_state.scores[s["id"]][criterion["id"]] is not None
            for s in SUPPLIERS
        )

        if all_scored_for_criterion:
            criterion_name = results[SUPPLIERS[0]["id"]][criterion["id"]]["criterion_name"]
            cache_key = f"comparison_{criterion['id']}"
            if cache_key not in st.session_state:
                with st.spinner(f"Generating comparison for {criterion_name}..."):
                    comparison_text = get_comparison(
                        criterion["id"], criterion_name, results
                    )
            else:
                comparison_text = st.session_state[cache_key]

            st.markdown(
                f"""<div class="comparison-panel">
    <div style="font-size:11px; font-weight:700; color:#86efac; margin-bottom:8px;">
        📊 Cross-supplier comparison — {criterion_name}
    </div>
    <div style="font-size:11px; color:#d1fae5; line-height:1.7;">
        {comparison_text}
    </div>
</div>""",
                unsafe_allow_html=True,
            )

    # ── Results table ─────────────────────────────────────────────────────────

    all_scored = all(
        st.session_state.scores[s["id"]][c["id"]] is not None
        for s in SUPPLIERS
        for c in CRITERION_QUERIES
    )

    if all_scored:
        st.divider()
        st.subheader("Evaluation Summary")

        table_data = []
        leading_supplier = None
        highest_total = -1

        for supplier in SUPPLIERS:
            row = {"Supplier": supplier["name"]}
            total = 0
            for criterion in CRITERION_QUERIES:
                score = st.session_state.scores[supplier["id"]][criterion["id"]] or 0
                row[criterion["id"]] = score
                total += score
            row["Total"] = total
            table_data.append(row)

            if total > highest_total:
                highest_total = total
                leading_supplier = supplier["name"]

        st.dataframe(table_data, use_container_width=True)
        st.success(
            f"Highest scoring supplier: {leading_supplier} "
            f"with {highest_total} / 49 points"
        )
        st.caption(
            "Automatic criteria (Sobre C, 51 points) are evaluated separately "
            "using the price formula from PCAP Annex 2.b. "
            "Final ranking requires combining both scores."
        )

        # ── Sign and submit ───────────────────────────────────────────────────

        st.divider()
        st.subheader("Sign and Submit Evaluation")

        evaluator_id = st.text_input(
            "Evaluator ID",
            placeholder="e.g. david.ferrer.ctti",
        )

        st.caption(
            "By submitting you confirm that you have independently reviewed all "
            "AI-generated evidence and assigned scores based on your own "
            "professional judgment. Law 40/2015 Art. 24."
        )

        submit_button = st.button(
            "✅ Sign and Submit Evaluation",
            type="primary",
            disabled=not evaluator_id or st.session_state.submitted,
        )

        if submit_button and evaluator_id:
            audit_entry = {
                "evaluator_id": evaluator_id,
                "timestamp": datetime.now().isoformat(),
                "contract": "CTTI-2026-36",
                "regulatory_note": (
                    "Law 40/2015 Art. 24 — evaluator signature recorded. "
                    "EU AI Act Annex III — human review completed prior "
                    "to all scoring decisions."
                ),
                "scores": {
                    s["id"]: {
                        c["id"]: st.session_state.scores[s["id"]][c["id"]]
                        for c in CRITERION_QUERIES
                    }
                    for s in SUPPLIERS
                },
                "evidence": {
                    supplier["id"]: {
                        criterion["id"]: {
                            "criterion_name": results[supplier["id"]][criterion["id"]]["criterion_name"],
                            "max_points": results[supplier["id"]][criterion["id"]]["max_points"],
                            "evidence_surfaced": results[supplier["id"]][criterion["id"]]["evidence"],
                            "agent_note": results[supplier["id"]][criterion["id"]]["agent_note"],
                        }
                        for criterion in CRITERION_QUERIES
                    }
                    for supplier in SUPPLIERS
                },
            }
            st.session_state.audit_log.append(audit_entry)
            st.session_state.submitted = True
            st.success("Evaluation submitted. Audit record created.")
            st.balloons()

# ═══════════════════════════════════════════════════════════════════════════════
# TAB 2 — AUDIT LOG
# ═══════════════════════════════════════════════════════════════════════════════

with tab2:
    st.title("Audit Log")
    st.caption(
        "Complete record of agent actions and human decisions. "
        "Law 40/2015 Art. 24 — EU AI Act Annex III."
    )

    if not st.session_state.audit_log:
        st.info(
            "No submissions yet. Complete the evaluation in Tab 1 "
            "and submit to generate the audit record."
        )
    else:
        for entry in st.session_state.audit_log:
            st.markdown(f"**Submitted by:** {entry['evaluator_id']}")
            st.markdown(f"**Timestamp:** {entry['timestamp']}")
            st.markdown(f"**Contract:** {entry['contract']}")
            st.markdown(f"**Regulatory note:** {entry['regulatory_note']}")

            st.markdown("**Scores recorded:**")
            table_data = []
            for supplier in SUPPLIERS:
                row = {"Supplier": supplier["name"]}
                total = 0
                for criterion in CRITERION_QUERIES:
                    score = entry["scores"][supplier["id"]][criterion["id"]] or 0
                    row[criterion["id"]] = score
                    total += score
                row["Total"] = total
                table_data.append(row)
            st.dataframe(table_data, use_container_width=True)

            st.markdown("**Agent evidence on record:**")
            for supplier in SUPPLIERS:
                with st.expander(supplier["name"]):
                    for criterion in CRITERION_QUERIES:
                        ev = entry["evidence"][supplier["id"]][criterion["id"]]
                        st.markdown(
                            f"**{ev['criterion_name']}** "
                            f"(max {ev['max_points']} pts)"
                        )
                        st.markdown(f"*Evidence surfaced:* {ev['evidence_surfaced']}")
                        st.markdown(f"*Agent note:* {ev['agent_note']}")
                        st.divider()

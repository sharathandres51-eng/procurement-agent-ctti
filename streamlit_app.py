import os
# macOS: FAISS and PyTorch both load libomp.dylib; without this flag the
# OS kills the process with "OMP Error #15". Must be set before any import
# that triggers FAISS or torch initialisation.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

from dotenv import load_dotenv
load_dotenv()

import streamlit as st
import json
import time
import httpx
from datetime import datetime
from langchain_mistralai import ChatMistralAI
from graph.pipeline import run_all_evaluations, TENDER_REGISTRY
from scoring.sobre_c import score_sobre_c
from db.audit import init_db, insert_entry, get_all_entries, export_json
from i18n import get_translations, SUPPORTED_LANGUAGES

init_db()

st.set_page_config(
    page_title="CTTI Tender Evaluation Workbench",
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

# ── Header: language selector ──────────────────────────────────────────────────

header_left, header_right = st.columns([4, 1])
with header_right:
    lang_labels = list(SUPPORTED_LANGUAGES.values())   # ["English", "Español", "Català"]
    lang_codes  = list(SUPPORTED_LANGUAGES.keys())     # ["en", "es", "ca"]
    selected_lang_label = st.selectbox(
        "🌐",
        options=lang_labels,
        index=lang_codes.index(st.session_state.get("language", "en")),
        label_visibility="collapsed",
    )
    language = lang_codes[lang_labels.index(selected_lang_label)]

t = get_translations(language)

# ── Sidebar: tender selector ───────────────────────────────────────────────────

tender_options = {v["label"]: k for k, v in TENDER_REGISTRY.items()}
selected_label = st.sidebar.selectbox(
    t["select_tender"],
    options=list(tender_options.keys()),
)
tender_id     = tender_options[selected_label]
tender_config = TENDER_REGISTRY[tender_id]
SUPPLIERS     = tender_config["suppliers"]
CRITERIA      = tender_config["criteria"]

# ── Session state (reset on tender or language change) ─────────────────────────

state_key = f"{tender_id}_{language}"
if st.session_state.get("active_state_key") != state_key:
    st.session_state.active_state_key = state_key
    st.session_state.language  = language
    st.session_state.results   = None
    st.session_state.scores    = {
        s["id"]: {c["id"]: None for c in CRITERIA}
        for s in SUPPLIERS
    }
    st.session_state.submitted = False
    for key in list(st.session_state.keys()):
        if key.startswith("comparison_"):
            del st.session_state[key]
else:
    st.session_state.language = language

# ── Comparison helper ──────────────────────────────────────────────────────────

_comparison_llm = ChatMistralAI(model="mistral-large-latest", temperature=0)


def get_comparison(criterion_id: str, criterion_name: str, results: dict) -> str:
    cache_key = f"comparison_{criterion_id}"
    if cache_key in st.session_state:
        return st.session_state[cache_key]

    prompt = f"""{t["comparison_prompt_intro"]}
{t["llm_language_instruction"]}

Criterion: {criterion_name}

Supplier A ({SUPPLIERS[0]['name']}):
{results[SUPPLIERS[0]['id']][criterion_id]['evidence']}

Supplier B ({SUPPLIERS[1]['name']}):
{results[SUPPLIERS[1]['id']][criterion_id]['evidence']}

Supplier C ({SUPPLIERS[2]['name']}):
{results[SUPPLIERS[2]['id']][criterion_id]['evidence']}

{t["comparison_prompt_instructions"]}
"""
    text = t["comparison_unavailable"]
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


# ── Tabs ───────────────────────────────────────────────────────────────────────

tab1, tab2, tab3 = st.tabs([
    t["tab_dashboard"],
    t["tab_audit"],
    t["tab_sobre_c"],
])

# ═══════════════════════════════════════════════════════════════════════════════
# TAB 1 — EVALUATION DASHBOARD
# ═══════════════════════════════════════════════════════════════════════════════

with tab1:
    with header_left:
        st.title(t["app_title"])
        st.caption(f"{tender_config['label']} · {t['app_caption']}")

    st.markdown(t["suppliers_loaded"])
    for supplier in SUPPLIERS:
        st.markdown(f"✓ {supplier['name']}")

    st.divider()

    run_button = st.button(
        t["run_button"],
        type="primary",
        disabled=st.session_state.results is not None,
    )

    if run_button:
        with st.spinner(t["run_spinner"]):
            st.session_state.results = run_all_evaluations(
                tender_id=tender_id,
                language=language,
            )
        st.rerun()

    if st.session_state.results is None:
        st.info(t["run_info"])
        st.stop()

    # ── Evaluation grid ────────────────────────────────────────────────────────

    results = st.session_state.results

    st.subheader(t["grid_subheader"])
    st.caption(t["grid_caption"])

    for criterion in CRITERIA:
        st.markdown("---")
        st.markdown(f"### {criterion['label']}")

        cols = st.columns(3)

        for supplier, col in zip(SUPPLIERS, cols):
            with col:
                result     = results[supplier["id"]][criterion["id"]]
                max_points = result["max_points"]
                evidence   = result["evidence"]
                agent_note = result["agent_note"]
                crit_name  = result["criterion_name"]

                st.markdown(f"**{supplier['name']}**")
                st.caption(t["max_pts_label"].format(max_points=max_points))

                st.markdown(
                    f"""<div class="amber-box">
    <div class="ai-label">{t["ai_label"]}</div>
    <div class="evidence-text">{evidence}</div>
    <div class="agent-note">⚠️ {agent_note}</div>
</div>""",
                    unsafe_allow_html=True,
                )

                stored = st.session_state.scores[supplier["id"]][criterion["id"]]
                score = st.number_input(
                    label=t["score_label"].format(max=max_points),
                    min_value=0,
                    max_value=max_points,
                    value=stored if stored is not None else 0,
                    step=1,
                    key=f"score_{supplier['id']}_{criterion['id']}",
                )
                st.session_state.scores[supplier["id"]][criterion["id"]] = score

        # Cross-supplier comparison panel
        all_scored_for_criterion = all(
            st.session_state.scores[s["id"]][criterion["id"]] is not None
            for s in SUPPLIERS
        )

        if all_scored_for_criterion:
            crit_name = results[SUPPLIERS[0]["id"]][criterion["id"]]["criterion_name"]
            cache_key = f"comparison_{criterion['id']}"
            if cache_key not in st.session_state:
                with st.spinner(t["comparison_spinner"].format(crit_name=crit_name)):
                    comparison_text = get_comparison(criterion["id"], crit_name, results)
            else:
                comparison_text = st.session_state[cache_key]

            st.markdown(
                f"""<div class="comparison-panel">
    <div style="font-size:11px; font-weight:700; color:#86efac; margin-bottom:8px;">
        {t["comparison_header"].format(crit_name=crit_name)}
    </div>
    <div style="font-size:11px; color:#d1fae5; line-height:1.7;">
        {comparison_text}
    </div>
</div>""",
                unsafe_allow_html=True,
            )

    # ── Results table ──────────────────────────────────────────────────────────

    all_scored = all(
        st.session_state.scores[s["id"]][c["id"]] is not None
        for s in SUPPLIERS
        for c in CRITERIA
    )

    if all_scored:
        st.divider()
        st.subheader(t["summary_subheader"])

        table_data = []
        leading_supplier = None
        highest_total    = -1

        for supplier in SUPPLIERS:
            row   = {t["supplier_col"]: supplier["name"]}
            total = 0
            for criterion in CRITERIA:
                score = st.session_state.scores[supplier["id"]][criterion["id"]] or 0
                row[criterion["id"]] = score
                total += score
            row["Total"] = total
            table_data.append(row)

            if total > highest_total:
                highest_total    = total
                leading_supplier = supplier["name"]

        st.dataframe(table_data, use_container_width=True)
        max_sobre_b = sum(c["max_points"] for c in CRITERIA)
        st.success(t["summary_winner"].format(
            name=leading_supplier, total=highest_total, max=max_sobre_b
        ))
        st.caption(t["summary_caption"])

        # ── Sign and submit ────────────────────────────────────────────────────

        st.divider()
        st.subheader(t["submit_subheader"])

        evaluator_id = st.text_input(
            t["evaluator_label"],
            placeholder=t["evaluator_placeholder"],
        )
        st.caption(t["submit_legal_caption"])

        submit_button = st.button(
            t["submit_button"],
            type="primary",
            disabled=not evaluator_id or st.session_state.submitted,
        )

        if submit_button and evaluator_id:
            audit_entry = {
                "evaluator_id":  evaluator_id,
                "timestamp":     datetime.now().isoformat(),
                "contract":      tender_id.upper().replace("_", "-"),
                "tender_label":  tender_config["label"],
                "language":      language,
                "regulatory_note": t["regulatory_note"],
                "scores": {
                    s["id"]: {
                        c["id"]: st.session_state.scores[s["id"]][c["id"]]
                        for c in CRITERIA
                    }
                    for s in SUPPLIERS
                },
                "evidence": {
                    supplier["id"]: {
                        criterion["id"]: {
                            "criterion_name":    results[supplier["id"]][criterion["id"]]["criterion_name"],
                            "max_points":        results[supplier["id"]][criterion["id"]]["max_points"],
                            "evidence_surfaced": results[supplier["id"]][criterion["id"]]["evidence"],
                            "agent_note":        results[supplier["id"]][criterion["id"]]["agent_note"],
                        }
                        for criterion in CRITERIA
                    }
                    for supplier in SUPPLIERS
                },
            }
            insert_entry(audit_entry)
            st.session_state.submitted = True
            st.success(t["submit_success"])
            st.balloons()

# ═══════════════════════════════════════════════════════════════════════════════
# TAB 2 — AUDIT LOG
# ═══════════════════════════════════════════════════════════════════════════════

with tab2:
    st.title(t["audit_title"])
    st.caption(t["audit_caption"])

    audit_entries = get_all_entries()

    if not audit_entries:
        st.info(t["audit_empty"])
    else:
        st.download_button(
            label=t["audit_export_btn"],
            data=export_json(),
            file_name=f"audit_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json",
            mime="application/json",
        )
        st.caption(t["audit_export_caption"].format(count=len(audit_entries)))
        st.divider()

        for i, entry in enumerate(audit_entries, start=1):
            st.markdown(f"### {t['audit_submission_header'].format(i=i)}")
            col_a, col_b, col_c = st.columns(3)
            col_a.markdown(t["audit_evaluator"].format(id=entry["evaluator_id"]))
            col_b.markdown(t["audit_timestamp"].format(ts=entry["timestamp"]))
            col_c.markdown(t["audit_contract"].format(
                contract=entry.get("tender_label", entry["contract"])
            ))
            st.caption(f"📋 {entry['regulatory_note']}")

            st.markdown(t["audit_scores_header"])
            entry_suppliers = list(entry["scores"].keys())
            entry_criteria  = list(next(iter(entry["scores"].values())).keys())

            table_data = []
            for sid in entry_suppliers:
                row   = {t["supplier_col"]: sid}
                total = 0
                for cid in entry_criteria:
                    score = entry["scores"][sid][cid] or 0
                    row[cid] = score
                    total   += score
                row[t["audit_total_col"]] = total
                table_data.append(row)
            st.dataframe(table_data, use_container_width=True)

            evidence = entry.get("evidence", {})
            if evidence:
                st.markdown(t["audit_evidence_header"])
                for sid in entry_suppliers:
                    if sid not in evidence:
                        continue
                    with st.expander(sid):
                        for cid in entry_criteria:
                            if cid not in evidence.get(sid, {}):
                                continue
                            ev = evidence[sid][cid]
                            st.markdown(f"**{ev['criterion_name']}** (max {ev['max_points']} pts)")
                            st.markdown(t["audit_evidence_surfaced"].format(text=ev["evidence_surfaced"]))
                            st.markdown(t["audit_agent_note"].format(text=ev["agent_note"]))
                            st.divider()

            if i < len(audit_entries):
                st.divider()

# ═══════════════════════════════════════════════════════════════════════════════
# TAB 3 — SOBRE C & FINAL RANKING
# ═══════════════════════════════════════════════════════════════════════════════

with tab3:
    st.title(t["sobre_c_title"])
    st.caption(f"{tender_config['label']} · {t['sobre_c_caption']}")
    st.info(t["sobre_c_info"], icon="ℹ️")

    sobre_c_results = score_sobre_c(tender_id=tender_id)

    # ── Declared values ────────────────────────────────────────────────────────
    st.subheader(t["declared_subheader"])
    declared_rows = []
    for supplier in SUPPLIERS:
        d   = sobre_c_results[supplier["id"]]["declared"]
        row = {t["supplier_col"]: supplier["name"]}
        row.update(d)
        declared_rows.append(row)
    st.dataframe(declared_rows, use_container_width=True)

    # ── Breakdown ──────────────────────────────────────────────────────────────
    st.subheader(t["breakdown_subheader"])
    st.caption(t["breakdown_caption"])
    breakdown_rows = []
    for supplier in SUPPLIERS:
        row = {t["supplier_col"]: supplier["name"]}
        for cid, detail in sobre_c_results[supplier["id"]]["criteria"].items():
            row[f"{detail['label']} (/{detail['max_points']})"] = detail["score"]
        row[f"Total Sobre C (/51)"] = sobre_c_results[supplier["id"]]["total"]
        breakdown_rows.append(row)
    st.dataframe(breakdown_rows, use_container_width=True)

    # ── Final ranking ──────────────────────────────────────────────────────────
    st.divider()
    st.subheader(t["ranking_subheader"])

    sobre_b_available = (
        st.session_state.results is not None
        and all(
            st.session_state.scores[s["id"]][c["id"]] is not None
            for s in SUPPLIERS
            for c in CRITERIA
        )
    )

    if not sobre_b_available:
        st.warning(t["ranking_warning"], icon="⚠️")
    else:
        final_rows   = []
        winner_name  = None
        winner_total = -1
        max_sobre_b  = sum(c["max_points"] for c in CRITERIA)

        for supplier in SUPPLIERS:
            sobre_b_total = sum(
                st.session_state.scores[supplier["id"]][c["id"]] or 0
                for c in CRITERIA
            )
            sobre_c_total = sobre_c_results[supplier["id"]]["total"]
            combined      = round(sobre_b_total + sobre_c_total, 2)

            final_rows.append({
                t["supplier_col"]:                      supplier["name"],
                t["sobre_b_col"].format(max=max_sobre_b): sobre_b_total,
                t["sobre_c_col"]:                       sobre_c_total,
                t["combined_col"]:                      combined,
            })

            if combined > winner_total:
                winner_total = combined
                winner_name  = supplier["name"]

        st.dataframe(final_rows, use_container_width=True)
        st.success(
            t["ranking_winner"].format(name=winner_name, total=winner_total),
            icon="🏆",
        )
        st.caption(t["ranking_caption"])

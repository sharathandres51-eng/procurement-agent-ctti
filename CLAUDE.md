# CLAUDE.md — Procurement Evaluation Agent (CTTI Capstone Prototype)

This file tracks development status and outstanding work for the CTTI submission prototype.

---

## What this project is

An AI-assisted tender evaluation workbench for the Generalitat de Catalunya's CTTI. The system uses a two-node LangGraph pipeline (retrieval → analysis) backed by a FAISS vector store to surface evidence from supplier proposals. Human evaluators retain all scoring authority. The prototype covers three synthetic tenders across different procurement domains.

---

## Completed features

### ✅ Task 1 — Multi-tender support
- `TENDER_REGISTRY` in `graph/pipeline.py` centralises all tender config (label, suppliers, criteria).
- Three tenders implemented: QKD Infrastructure, Cloud Migration, Cybersecurity SOC.
- `tender_id` flows through the entire stack: FAISS metadata filters, EvalState, LLM prompts.
- Adding a new tender = one dict entry + data files + index rebuild. Zero code changes elsewhere.

### ✅ Task 2 — PDF ingestion pipeline
- `rag/pdf_loader.py`: pdfplumber extracts text page-by-page → standard LangChain Documents.
- `rag/indexer.py` `load_document()` dispatches on `.pdf` vs `.txt` extension automatically.
- `data/ctti_2026_36/supplier_a.pdf` exists as a demo PDF (generated via `scripts/make_demo_pdf.py`).
- `TENDER_FILES` in `indexer.py` already registers `supplier_a.pdf` for `ctti_2026_36`.
- Limitation: scanned/image-only PDFs are silently skipped (OCR out of scope).

### ✅ Task 3 — Sobre C automatic price scoring (51 points)
- `scoring/sobre_c.py`: fully generic scorer driven by `sobre_c_submissions.json` per tender.
- JSON is self-describing with `_criteria`, `_max_points`, `_direction` metadata.
- Formula: `score = max * (best/this)` for "lower is better"; `max * (this/best)` for "higher is better".
- Tab 3 in the UI shows declared values, per-criterion breakdown, and combined 100-pt ranking.

### ✅ Task 4 — Persistent audit log
- `db/audit.py`: SQLite-backed store (`db/audit.db`, gitignored).
- Functions: `init_db()`, `insert_entry(entry)`, `get_all_entries()`, `export_json()`.
- Audit entries include: evaluator ID, timestamp, tender label, language, all scores, all AI evidence, agent notes, and regulatory metadata.
- JSON export aligned with Law 40/2015 Art. 24 and EU AI Act Annex III.

### ✅ Full EN / ES / CA internationalisation
- All UI strings externalised to `i18n/translations.json` (~60 keys × 3 languages).
- LLM language instruction injected into every prompt: responses in EN/ES/CA based on UI setting.
- Cross-supplier comparison also prompted in the selected language.
- Language selector in the page header (🌐 dropdown, top-right).
- Switching language or tender resets all cached LLM results and session state.

---

## Immediate next steps before CTTI submission

### 1. Rebuild the FAISS index
The index must be rebuilt after all structural changes:
```bash
python -m rag.indexer
```
This creates a multi-tender index stamped with `tender_id` metadata. The old single-tender index at `rag/faiss_index/` is stale.

### 2. Replace demo PDFs with richer synthetic content
- `supplier_a.pdf` was generated from `supplier_a.txt` via fpdf2 — it has the same content as the `.txt`.
- For a more convincing demo, generate PDFs with tables, headers, and multi-section layout.
- Or run `make_demo_pdf.py` for all three suppliers across all three tenders so every proposal is PDF-native.

### 3. Expand synthetic supplier proposals
- Current proposals are plausible but short (~1–2 pages equivalent).
- Real Sobre B envelopes are typically 20–80 pages. Expand each proposal to improve retrieval coverage.
- Add realistic technical detail (team CVs, Gantt charts described in text, tool names, certifications).

### 4. Add evaluator authentication
- The current evaluator ID is a free-text field — no identity verification.
- For a production-credible demo: integrate Streamlit-Authenticator or a simple token check.
- For production: Generalitat digital identity (IdCAT or Cl@ve).

---

## Path to production (post-submission, for reference)

### Phase 1 — Sovereignty & Infrastructure
- Self-host the LLM on CTTI / BSC infrastructure; swap Mistral API for **AINA** (Barcelona Supercomputing Center).
- Replace FAISS with a Generalitat-managed vector database (e.g. pgvector on Generalitat cloud).
- Deploy behind CTTI's internal network — no procurement data leaves Catalan infrastructure.
- Ensure compliance with ENS (Esquema Nacional de Seguretat) and GDPR.

### Phase 2 — Real Document Ingestion
- Connect directly to the **PSCP** (Plataforma de Serveis de Contractació Pública de Catalunya).
- Automate document ingestion at upload time; audit trail starts at ingestion, not evaluation.
- Add OCR step for scanned PDFs (e.g. `pytesseract` or `pypdfium2`).

### Phase 3 — Legal & Compliance Hardening
- Complete EU AI Act Annex III conformity assessment (this is a high-risk AI system).
- Replace free-text evaluator ID with **VALID** authentication (Generalitat digital identity).
- Ensure audit log is publishable under Llei 19/2014 (Catalan transparency law).

### Phase 4 — Expand Scope
- Multi-department support across all Generalitat bodies (salut, educació, etc.).
- Supplier-facing portal for proposal submission and preliminary feedback.
- Generalise to other public bodies as a reusable procurement intelligence platform.

---

## Model note

The prototype uses **Mistral Large** (`mistral-large-latest`) via API for both embeddings and inference. The architecture is model-agnostic — swapping the LLM is a one-line config change in `.env`. The production target is **AINA** (BSC) for data sovereignty and native Catalan language support.

---

## Key commands

```bash
# Rebuild FAISS index after any data change
python -m rag.indexer

# Generate demo PDF from txt (ctti_2026_36 / supplier_a only)
python -m scripts.make_demo_pdf

# Test PDF extraction in isolation
python -m rag.pdf_loader data/ctti_2026_36/supplier_a.pdf

# Launch the app
streamlit run streamlit_app.py
```

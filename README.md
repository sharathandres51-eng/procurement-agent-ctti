# Procurement Evaluation Agent — CTTI Capstone Prototype

AI-assisted procurement evaluation workbench for the Government of Catalonia (CTTI). Human evaluators retain all scoring authority; the system surfaces evidence from supplier proposals, scores price envelopes deterministically, and maintains a regulatory-compliant audit trail.

Supports **three synthetic tenders** across different procurement domains, with full **English / Spanish / Catalan** internationalisation and native PDF document ingestion.

---

## Overview

The system implements the Catalan public procurement three-envelope model:

| Envelope | Contents | Points | Scoring |
|---|---|---|---|
| **Sobre A** | Legal & financial solvency | — | Pass/fail (not in scope) |
| **Sobre B** | Technical proposal (judici de valor) | 49 | AI-assisted human judgment |
| **Sobre C** | Price & quantifiable offer | 51 | Deterministic formula (PCAP Annex 2.b) |

**Total: 100 points.** The prototype covers Sobre B and Sobre C in full.

### Synthetic tenders included

| Tender ID | Contract | Domain |
|---|---|---|
| `ctti_2026_36` | CTTI-2026-36 — QKD Infrastructure | Quantum Key Distribution |
| `ctti_2026_44` | CTTI-2026-44 — Cloud Infrastructure Migration | Cloud / Azure / AWS |
| `ctti_2026_51` | CTTI-2026-51 — Cybersecurity SOC Services | Security Operations Centre |

Each tender has three synthetic suppliers with realistic proposals, PCAP criteria files, PPT requirements, and Sobre C price/SLA declarations.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                          Streamlit Web UI                                │
│                                                                          │
│  🌐 Language selector (EN / ES / CA)   ←  header                        │
│  📋 Tender selector (3 tenders)        ←  sidebar                       │
│                                                                          │
│  Tab 1: Evaluation Dashboard           Tab 2: Audit Log                  │
│  - 3×N evidence grid                   - SQLite-backed records           │
│  - Human score inputs                  - Law 40/2015 Art. 24             │
│  - Cross-supplier comparisons          - EU AI Act Annex III             │
│  - Sobre B summary table               - JSON export                     │
│                                                                          │
│  Tab 3: Sobre C & Final Ranking                                          │
│  - Declared values table                                                 │
│  - Per-criterion breakdown                                               │
│  - Combined 100-pt ranking                                               │
└──────────────────────┬───────────────────────────────────────────────────┘
                       │ run_all_evaluations(tender_id, language)
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                       LangGraph Pipeline                                 │
│                       graph/pipeline.py + TENDER_REGISTRY                │
│  Orchestrates N×M evaluations (suppliers × criteria) sequentially       │
│  10s delay between calls to respect Mistral API rate limits             │
└──────────────────────┬───────────────────────────────────────────────────┘
                       │ EvalState (TypedDict)
                       ▼
┌────────────────────────────────┐     ┌─────────────────────────────────┐
│       retrieval_agent          │────▶│       analysis_agent            │
│  agents/retrieval_agent.py     │     │  agents/analysis_agent.py       │
│                                │     │                                 │
│  retrieve(supplier_id,         │     │  retrieve_criteria(query,       │
│    query, tender_id, k=5)      │     │    tender_id, k=5)              │
│  → raw_chunks                  │     │                                 │
│                                │     │  Mistral Large (temp=0)         │
│                                │     │  Language: EN / ES / CA         │
│                                │     │  → evidence, agent_note,        │
│                                │     │    criterion_name, max_points   │
└────────────────────────────────┘     └─────────────────────────────────┘
                       │ filtered semantic search (by tender_id + source)
                       ▼
┌──────────────────────────────────────────────────────────────────────────┐
│                          RAG Layer                                       │
│  rag/retriever.py                                                        │
│                                                                          │
│  ┌──────────────────────────────────────────────────────────────────┐   │
│  │          FAISS Vector Index (rag/faiss_index/)                   │   │
│  │                                                                  │   │
│  │  tender_id: ctti_2026_36  → pcap_criteria, ppt_requirements,    │   │
│  │                              supplier_a.pdf, supplier_b.txt, …  │   │
│  │  tender_id: ctti_2026_44  → [same structure, all .txt]          │   │
│  │  tender_id: ctti_2026_51  → [same structure, all .txt]          │   │
│  │                                                                  │   │
│  │  ~200–300 chunks · 500-char window · 50-char overlap            │   │
│  │  Embedded via mistral-embed · metadata-filtered at query time   │   │
│  └──────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  retrieve(supplier_id, query, tender_id, k)  → filter by source         │
│  retrieve_criteria(query, tender_id, k)      → filter by doc_type       │
└──────────────────────────────────────────────────────────────────────────┘
                 ▲
         Built once via python -m rag.indexer

┌──────────────────────────────────────────────────────────────────────────┐
│  Sobre C Scorer — scoring/sobre_c.py                                    │
│  Reads sobre_c_submissions.json (self-describing with _criteria,        │
│  _max_points, _direction). Applies PCAP Annex 2.b proportionality       │
│  formula: score = max * (best/this) or max * (this/best). No hardcoded  │
│  field names — adding new criteria requires only editing the JSON.       │
└──────────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────────┐
│  Audit Log — db/audit.py                                                │
│  SQLite-backed (db/audit.db, gitignored). Stores evaluator ID,          │
│  timestamp, tender label, language, all scores, all AI evidence,        │
│  and agent notes. Exportable as signed JSON.                            │
└──────────────────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Web UI | Streamlit |
| Agent orchestration | LangGraph 0.2.74 |
| LLM inference | Mistral Large (`mistral-large-latest`, temperature=0) |
| Embeddings | Mistral Embed |
| Vector store | FAISS (CPU) |
| LLM framework | LangChain + langchain-mistralai |
| PDF extraction | pdfplumber |
| Audit persistence | SQLite (db/audit.py) |
| Internationalisation | Custom i18n loader (EN / ES / CA) |
| Config | python-dotenv |
| Language | Python 3.13 |

---

## Project Structure

```
procurement-agent-ctti/
├── agents/
│   ├── retrieval_agent.py       # Fetches top-k proposal chunks via RAG (by tender + supplier)
│   └── analysis_agent.py        # LLM evidence extraction; injects language instruction into prompt
├── graph/
│   ├── state.py                 # EvalState TypedDict (shared schema across all agents)
│   └── pipeline.py              # TENDER_REGISTRY + LangGraph pipeline + run_all_evaluations()
├── rag/
│   ├── indexer.py               # FAISS index builder — run once per data change
│   ├── retriever.py             # retrieve() and retrieve_criteria() with tender_id filter
│   ├── pdf_loader.py            # pdfplumber-based PDF extractor → LangChain Documents
│   └── faiss_index/             # Persisted vector index (gitignored — rebuild locally)
├── scoring/
│   └── sobre_c.py               # Deterministic 51-point price scorer (PCAP Annex 2.b)
├── db/
│   └── audit.py                 # SQLite audit log (init_db, insert_entry, export_json)
├── i18n/
│   ├── __init__.py              # get_translations(lang) with lru_cache
│   └── translations.json        # ~60 UI + LLM strings in EN / ES / CA
├── scripts/
│   └── make_demo_pdf.py         # Converts supplier_a.txt → supplier_a.pdf (fpdf2)
├── data/
│   ├── ctti_2026_36/            # QKD Infrastructure
│   │   ├── pcap_criteria.txt
│   │   ├── ppt_requirements.txt
│   │   ├── supplier_a.pdf       # PDF ingestion demo (pdfplumber)
│   │   ├── supplier_b.txt
│   │   ├── supplier_c.txt
│   │   └── sobre_c_submissions.json
│   ├── ctti_2026_44/            # Cloud Infrastructure Migration
│   │   └── [same structure, all .txt]
│   └── ctti_2026_51/            # Cybersecurity SOC Services
│       └── [same structure, all .txt]
├── streamlit_app.py             # Application entry point
├── requirements.txt
├── .env.example
├── CLAUDE.md                    # Developer task log and production roadmap
└── README.md
```

---

## Setup

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Add your Mistral API key:
# MISTRAL_API_KEY=your_key_here
```

### 3. Build the vector index

Run once (or after adding / replacing any data file):

```bash
python -m rag.indexer
```

Output:
```
Tender: ctti_2026_36
  pcap_criteria.txt: 1 page(s) → 18 chunks
  supplier_a.pdf: N page(s) → M chunks   ← pdfplumber
  supplier_b.txt: 1 page(s) → 14 chunks
  ...
Total chunks across all tenders: ~280
Index saved to rag/faiss_index/
```

### 4. Launch the application

```bash
streamlit run streamlit_app.py
```

> **macOS note:** The app sets `KMP_DUPLICATE_LIB_OK=TRUE` at startup to prevent an OpenMP conflict between FAISS and PyTorch on Apple Silicon.

---

## Usage

### Tab 1 — Evaluation Dashboard

1. Select a tender from the **sidebar** and a language from the **🌐 dropdown** (top-right).
2. Click **Run Evaluation** to trigger the agent pipeline (≈2–4 min; progress shown in spinner).
3. Review AI-surfaced evidence for each supplier × criterion cell.
4. Enter scores independently in each number input (0 – max_points).
5. Once all cells are scored, a **cross-supplier comparison** is generated automatically per criterion.
6. Review the **Sobre B summary table** and winner highlight at the bottom.
7. Enter your **evaluator ID** and click **Sign and Submit** to persist the record.

### Tab 2 — Audit Log

View all submitted evaluations with full evidence chains. Download the complete log as a timestamped JSON file aligned with Law 40/2015 Art. 24 and EU AI Act Annex III requirements.

### Tab 3 — Sobre C & Final Ranking

View each supplier's declared values (price, SLA levels, training days, etc.), the deterministic per-criterion breakdown, and — once Sobre B scores are submitted — the combined 100-point final ranking.

---

## Adding a New Tender

1. Create `data/<new_tender_id>/` with `pcap_criteria.txt`, `ppt_requirements.txt`, supplier proposals, and `sobre_c_submissions.json`.
2. Add an entry to `TENDER_REGISTRY` in `graph/pipeline.py` (label, suppliers list, criteria list).
3. Add the corresponding entry to `TENDER_FILES` in `rag/indexer.py`.
4. Rebuild the index: `python -m rag.indexer`.
5. The new tender appears automatically in the UI dropdown — no other code changes needed.

---

## PDF Ingestion

Real supplier proposals from the PSCP portal are PDFs. The pipeline handles them natively:

```
supplier.pdf  →  rag/pdf_loader.py (pdfplumber)
              →  one LangChain Document per page
              →  chunked + embedded identically to .txt files
```

To replace a `.txt` with a real PDF: drop the file in the tender subdirectory, change the filename extension in `TENDER_FILES` in `rag/indexer.py`, and rebuild the index.

**Limitation:** Scanned / image-only PDFs are skipped silently. OCR (e.g. `pytesseract`) is out of scope for this prototype.

---

## Design Principles

- **Human-in-the-loop**: AI surfaces evidence only; all scoring is done by the procurement officer.
- **Deterministic LLM output**: Mistral Large at temperature=0 for reproducible analysis.
- **Dual-context retrieval**: Each analysis call retrieves both supplier proposal chunks and official criteria/requirements chunks, grounding the LLM in both the offer and the evaluation standard.
- **Data-driven Sobre C**: The price scorer is generic — all field names, weights, and directions live in the per-tender JSON file. No hardcoded field names in code.
- **Multi-tender by design**: `tender_id` flows through the entire stack (FAISS metadata, state, prompts). Adding a new tender is config, not code.
- **Full i18n**: All UI strings and LLM instructions are externalised to `translations.json`. Switching language resets all cached LLM results so comparisons are regenerated in the new language.
- **Regulatory compliance**: Audit log entries carry metadata aligned with Spanish public procurement law (Law 40/2015 Art. 24) and the EU AI Act Annex III high-risk system requirements.

---

## Key Agent Prompt Contract

The analysis agent instructs Mistral Large to respond in this exact format:

```
CRITERION_NAME: <name>
MAX_POINTS: <integer>
EVIDENCE: <verbatim 2+ sentence passage from proposal>
AGENT_NOTE: <2–3 sentence note on present/missing/uncertain evidence>
```

Parsing falls back gracefully if markdown wrappers or extra whitespace are present.

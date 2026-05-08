# Procurement Evaluation Agent — CTTI-2026-36

AI-assisted procurement evaluation workbench for the Government of Catalonia's Quantum Key Distribution (QKD) infrastructure tender. Human evaluators retain all scoring authority; the system surfaces evidence from supplier proposals and maintains a regulatory-compliant audit trail.

---

## Overview

Three suppliers submitted technical proposals for the CTTI-2026-36 QKD Infrastructure contract:

| Supplier | Company |
|----------|---------|
| A | QuantumNet Solutions SL |
| B | CyberQuantum Iberia SL |
| C | SecureComms Catalunya SA |

The system evaluates each supplier across **4 qualitative criteria** (49 points total). Price scoring (51 points, Sobre C) is handled separately via the PCAP Annex 2.b formula.

| Criterion ID | Description | Max Points |
|---|---|---|
| `pla_migracio` | Migration Plan | 9 |
| `execucio_critica` | Critical Execution & Deployment | 30 |
| `analisi_dades` | Data Analysis | 5 |
| `pla_devolucio` | Service Handover Plan | 5 |

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────┐
│                     Streamlit Web UI                             │
│  Tab 1: Evaluation Dashboard  │  Tab 2: Audit Log               │
│  - 3×4 evidence grid          │  - Regulatory records            │
│  - Human score inputs         │  - Law 40/2015 Art. 24           │
│  - Cross-supplier comparison  │  - EU AI Act Annex III           │
└──────────────────────┬───────────────────────────────────────────┘
                       │ run_all_evaluations()
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                  LangGraph Pipeline                              │
│              graph/pipeline.py                                   │
│  Orchestrates 12 evaluations (3 suppliers × 4 criteria)         │
│  Sequential runs with 10s delay to respect API rate limits      │
└──────────────────────┬───────────────────────────────────────────┘
                       │ EvalState
                       ▼
┌────────────────────────────────┐
│       retrieval_agent          │  agents/retrieval_agent.py
│  retrieve(supplier_id, query)  │
│  → raw_chunks (top-5 excerpts) │
└────────────────┬───────────────┘
                 │ state with raw_chunks
                 ▼
┌────────────────────────────────┐
│       analysis_agent           │  agents/analysis_agent.py
│  retrieve_criteria(query)      │  ← also queries criteria docs
│  Mistral Large (temp=0)        │
│  → evidence, agent_note,       │
│    criterion_name, max_points  │
└────────────────┬───────────────┘
                 │ semantic search
                 ▼
┌──────────────────────────────────────────────────────────────────┐
│                      RAG Layer                                   │
│  rag/retriever.py                                                │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │            FAISS Vector Index (rag/faiss_index/)         │   │
│  │                                                          │   │
│  │  doc_type: criteria       pcap_criteria.txt              │   │
│  │  doc_type: requirements   ppt_requirements.txt           │   │
│  │  source: supplier_a       supplier_a.txt                 │   │
│  │  source: supplier_b       supplier_b.txt                 │   │
│  │  source: supplier_c       supplier_c.txt                 │   │
│  │                                                          │   │
│  │  ~180–200 chunks · 500-char window · 50-char overlap     │   │
│  │  Embedded via mistral-embed                              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  retrieve(supplier_id, query, k)    → filter by source          │
│  retrieve_criteria(query, k)        → filter by doc_type        │
└──────────────────────────────────────────────────────────────────┘
                 ▲
         Built once via rag/indexer.py
```

---

## Data Flow — Single Evaluation

For one supplier-criterion pair (e.g., `supplier_a` × `pla_migracio`):

1. UI calls `run_evaluation("supplier_a", "Migration Plan ...", "pla_migracio", ...)`
2. `retrieval_agent` calls `retrieve("supplier_a", query, k=5)` → 5 proposal chunks
3. State (`raw_chunks`) passed to `analysis_agent`
4. `analysis_agent` additionally calls `retrieve_criteria(query, k=5)` → criteria + requirements chunks
5. Both chunk sets are sent to **Mistral Large** (temperature=0) with a structured prompt
6. LLM responds in fixed format: `CRITERION_NAME / MAX_POINTS / EVIDENCE / AGENT_NOTE`
7. Agent parses output (regex with line-by-line fallback; hardcoded `max_points` as final safety net)
8. Result dict returned to UI; displayed in dashboard cell
9. Human evaluator reads evidence and assigns a score independently
10. On sign-off, audit entry records evaluator ID, timestamp, all scores, all evidence, and regulatory metadata

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Web UI | Streamlit | — |
| Agent orchestration | LangGraph | 0.2.74 |
| LLM inference | Mistral Large (`mistral-large-latest`) | — |
| Embeddings | Mistral Embed | — |
| Vector store | FAISS (CPU) | — |
| LLM framework | LangChain + langchain-mistralai | 0.3.25 / 0.2.10 |
| Text splitting | langchain-text-splitters | 0.3.8 |
| Config | python-dotenv | — |
| Tokenisation | tiktoken | — |
| Language | Python 3.13 | — |

---

## Project Structure

```
procurement-agent-ctti/
├── agents/
│   ├── retrieval_agent.py    # Fetches top-k proposal chunks via RAG
│   └── analysis_agent.py     # LLM evidence extraction + dual-context retrieval
├── graph/
│   ├── state.py              # EvalState TypedDict (shared agent schema)
│   └── pipeline.py           # LangGraph compilation & 12-evaluation orchestration
├── rag/
│   ├── indexer.py            # One-time FAISS index builder (run before first use)
│   ├── retriever.py          # Semantic search helpers (retrieve / retrieve_criteria)
│   └── faiss_index/          # Persisted vector index (not committed to repo)
├── data/
│   ├── pcap_criteria.txt     # Official scoring criteria (PCAP Annex 2)
│   ├── ppt_requirements.txt  # Technical specification (PPT)
│   ├── supplier_a.txt        # QuantumNet Solutions SL proposal
│   ├── supplier_b.txt        # CyberQuantum Iberia SL proposal
│   └── supplier_c.txt        # SecureComms Catalunya SA proposal
├── streamlit_app.py          # Application entry point
├── requirements.txt
├── .env.example
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
# Add your Mistral API key to .env:
# MISTRAL_API_KEY=your_key_here
```

### 3. Build the vector index

Run this once to embed all documents and create `rag/faiss_index/`:

```bash
python -m rag.indexer
```

### 4. Launch the application

```bash
streamlit run streamlit_app.py
```

---

## Usage

**Tab 1 — Evaluation Dashboard**

1. Click **Run Evaluation** to trigger the 12-agent pipeline (approx. 2–3 min including API delays).
2. Review the AI-surfaced evidence for each supplier-criterion cell.
3. Enter a score (0 – max_points) for each cell independently.
4. Optionally trigger **Cross-Supplier Comparison** once all three suppliers are scored on a criterion.
5. Enter your evaluator ID and click **Sign and Submit** to lock scores.

**Tab 2 — Audit Log**

View the immutable record of submitted evaluations including timestamps, scores, evidence chains, and regulatory metadata (Law 40/2015 Art. 24 / EU AI Act Annex III).

---

## Design Principles

- **Human-in-the-loop**: AI provides advisory evidence only; all scoring decisions are made by the procurement officer.
- **Deterministic LLM output**: Mistral Large is invoked at temperature=0 for reproducible analysis.
- **Dual-context retrieval**: Each analysis call retrieves both supplier-specific proposal chunks and official criteria/requirements chunks, giving the model grounding in both the offer and the evaluation standard.
- **Robust parsing**: LLM output is parsed with regex, with a line-by-line fallback and hardcoded `max_points` values as a final safety net to prevent scoring errors.
- **Rate-limit resilience**: Mistral API calls are wrapped in a 5-attempt retry loop; 429 responses trigger exponential back-off (30 × attempt seconds).
- **Regulatory compliance**: Audit log entries carry metadata fields aligned with Spanish public procurement law and the EU AI Act.

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

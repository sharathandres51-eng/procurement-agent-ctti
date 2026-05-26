# Procurement Evaluation Workbench — CTTI

AI-assisted procurement evaluation workbench for the Generalitat de Catalunya (CTTI). Implements the standard 3-envelope PCAP model for public tenders. Human evaluators retain all scoring authority; the system surfaces evidence from supplier proposals, applies deterministic price formulae, and maintains a regulatory-compliant audit trail.

---

## The 3-Envelope PCAP Model

| Envelope | Route | Points | Method |
|---|---|---|---|
| **Sobre A** | `/sobre-a` | Pass/Fail | Administrative qualification checklist |
| **Sobre B** | `/` | 49 pts | Qualitative AI-assisted evaluation |
| **Sobre C** | `/sobre-c` | 51 pts | Deterministic price formula (PCAP Annex 2.b) |

Three synthetic tenders are bundled. The combined Sobre B + Sobre C score produces the final 100-pt ranking.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React 19 Frontend                            │
│                      (Vercel, TypeScript)                           │
│                                                                     │
│  /sobre-a        /            /sobre-c         /audit               │
│  SobreA.tsx   Dashboard.tsx  SobreC.tsx      AuditLog.tsx           │
│                                                                     │
│  React Router v7 · React Query v5 · Tailwind CSS v4                │
│  SSE streaming via fetch() + ReadableStream                         │
│  i18n: react-i18next (EN / ES / CA)                                 │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ HTTP / SSE   (VITE_API_URL)
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                       FastAPI Backend                               │
│                    (Railway, Python 3.13)                           │
│                                                                     │
│  api/main.py                                                        │
│  api/routers/                                                       │
│    tenders.py         GET  /tenders                                 │
│    evaluate.py        POST /tenders/{id}/evaluate  (SSE stream)     │
│    sobre_c.py         GET  /tenders/{id}/sobre-c                    │
│    compare.py         POST /tenders/{id}/compare                    │
│    source_chunks.py   GET  /tenders/{id}/source-chunks              │
│    audit.py           GET/POST /audit                               │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
┌─────────────────────────┐   ┌──────────────────────────────────────┐
│   LangGraph Pipeline    │   │        Scoring / Persistence         │
│   graph/pipeline.py     │   │                                      │
│                         │   │  scoring/sobre_c.py                  │
│  retrieval_agent        │   │    Deterministic 51-pt formula       │
│      ↓                  │   │    driven by sobre_c_submissions.json│
│  analysis_agent         │   │                                      │
│  Mistral Large (t=0)    │   │  db/audit.py                         │
└──────────┬──────────────┘   │    SQLite audit log                  │
           │                  │    Law 40/2015 + EU AI Act Annex III │
           ▼                  └──────────────────────────────────────┘
┌─────────────────────────┐
│     RAG Layer           │
│   rag/retriever.py      │
│                         │
│  FAISS index            │
│  tender_id + source     │
│  metadata filters       │
│  mistral-embed vectors  │
└─────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4 |
| Routing | React Router v7 |
| Data fetching | React Query v5 (TanStack) |
| HTTP client | Axios + native `fetch` (SSE streaming) |
| Markdown | react-markdown |
| i18n | react-i18next (EN / ES / CA) |
| Icons | lucide-react |
| Backend API | FastAPI + Uvicorn |
| Agent pipeline | LangGraph 0.2.74 |
| LLM inference | Mistral Large (`mistral-large-latest`, temperature=0) |
| Embeddings | Mistral Embed |
| Vector store | FAISS (CPU) |
| PDF extraction | pdfplumber |
| Audit persistence | SQLite (`db/audit.db`, gitignored) |
| Backend deploy | Railway |
| Frontend deploy | Vercel |
| Language | Python 3.13 / TypeScript |

---

## Project Structure

```
procurement-agent-ctti/
├── api/
│   ├── main.py                    # FastAPI entry point; mounts all routers
│   └── routers/
│       ├── tenders.py
│       ├── evaluate.py            # SSE streaming endpoint
│       ├── sobre_c.py
│       ├── compare.py
│       ├── source_chunks.py
│       └── audit.py
├── agents/
│   ├── retrieval_agent.py         # Fetches top-k proposal chunks via RAG
│   └── analysis_agent.py          # LLM evidence extraction; language-aware prompts
├── graph/
│   ├── state.py                   # EvalState TypedDict
│   └── pipeline.py                # LangGraph pipeline + TENDER_REGISTRY
├── rag/
│   ├── indexer.py                 # One-time FAISS index builder
│   ├── retriever.py               # Semantic search with tender_id + source filters
│   ├── pdf_loader.py              # pdfplumber PDF extractor → LangChain Documents
│   └── faiss_index/               # Persisted index (gitignored — rebuild locally)
├── scoring/
│   └── sobre_c.py                 # Deterministic 51-pt price scorer
├── db/
│   ├── audit.py                   # SQLite audit log helpers
│   └── audit.db                   # Runtime database (gitignored)
├── data/
│   ├── ctti_2026_36/              # QKD Infrastructure — 3 suppliers + PCAP + Sobre C
│   ├── ctti_2026_44/              # Cloud Infrastructure Migration
│   └── ctti_2026_51/              # Cybersecurity SOC Services
├── frontend/                      # React app (see frontend/README.md)
├── requirements.txt
├── .env.example
├── CLAUDE.md                      # Developer task log and production roadmap
└── README.md
```

---

## Setup

### Backend

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env
# Set MISTRAL_API_KEY in .env

# 3. Build the FAISS vector index (run once, or after adding new tender documents)
python -m rag.indexer

# 4. Start the API server
uvicorn api.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend

# 1. Install Node dependencies
npm install

# 2. Start the Vite dev server (proxies /api → localhost:8000)
npm run dev
# App runs at http://localhost:5173
```

### Production Deployment

| Service | Platform | Configuration |
|---|---|---|
| Backend | Railway | Set `MISTRAL_API_KEY` in Railway environment variables |
| Frontend | Vercel | Set `VITE_API_URL=https://your-project.railway.app` in Vercel environment variables |

---

## Usage Walkthrough

### Tab 1 — Sobre A (`/sobre-a`)

Administrative pass/fail qualification. Five PCAP criteria are checked per supplier using a three-state toggle (unchecked / pass / fail). Use **Mark all as passed** to expedite uncontested criteria. An evaluator sign-off is required to lock Sobre A before Sobre B can run.

### Tab 2 — Sobre B (`/`)

Main qualitative evaluation dashboard.

1. Select a tender from the header dropdown and a language from the globe icon (top-right).
2. Ensure Sobre A is locked — the amber gate banner will confirm if not.
3. Click **Run Evaluation** to start the SSE stream. Results appear cell-by-cell as each supplier × criterion pair completes.
4. Review the AI-surfaced evidence in each `EvidenceCard`.
5. Enter your human score (0 – max_points) for each cell independently.
6. A cross-supplier comparison is generated automatically per criterion once all suppliers have results. The comparison is cached for the session — navigating away and back does not re-fetch it.
7. Use **Review Evaluations** for a split-screen cell-by-cell walkthrough.
8. Enter your evaluator ID and click **Sign and Submit** to lock scores and write the audit entry.

### Tab 3 — Sobre C (`/sobre-c`)

Displays each supplier's declared values, the per-criterion deterministic score breakdown, and the combined 100-pt final ranking. Sobre B scores must be submitted before the combined ranking is available.

### Tab 4 — Audit Log (`/audit`)

Immutable record of all submitted evaluations. Scores table with expandable evidence accordion per entry. Export to a timestamped JSON file. Cache is refreshed automatically after each new submission.

---

## Adding a New Tender

1. Create `data/<tender_id>/` with:
   - `pcap_criteria.txt` — evaluation criteria and their weights
   - `ppt_requirements.txt` — technical prescription requirements
   - `supplier_a.txt` / `supplier_b.txt` / `supplier_c.txt` (or `.pdf`) — proposals
   - `sobre_c_submissions.json` — declared price and quantifiable values
2. Add an entry to `TENDER_REGISTRY` in `graph/pipeline.py` (label, suppliers list, criteria list).
3. Add the new tender's file list to `TENDER_FILES` in `rag/indexer.py`.
4. Rebuild the FAISS index: `python -m rag.indexer`
5. The tender appears automatically in the UI dropdown. No other code changes needed.

---

## PDF Ingestion

Real supplier proposals from the PSCP portal are PDFs. The pipeline handles them natively:

```
supplier.pdf  →  rag/pdf_loader.py (pdfplumber)
              →  one LangChain Document per page
              →  chunked + embedded identically to .txt files
```

To replace a `.txt` with a real PDF: drop the file in the tender subdirectory, update `TENDER_FILES` in `rag/indexer.py` with the `.pdf` extension, and rebuild the index.

**Limitation:** Scanned / image-only PDFs produce empty pages and are skipped silently. OCR is out of scope for this prototype.

---

## Design Principles

- **Human-in-the-loop**: AI surfaces evidence only; all scoring decisions belong to the procurement officer. The system cannot auto-score or submit without an identified human sign-off.
- **Deterministic LLM output**: Mistral Large is called at temperature=0 for reproducible analysis across evaluation sessions.
- **Dual-context retrieval**: Each analysis call retrieves both supplier-specific proposal chunks and official criteria/requirements chunks, grounding the model in both the offer and the evaluation standard.
- **Progressive disclosure**: Evidence streams in as it is produced; evaluators can start reviewing early cells while later ones are still running.
- **Regulatory compliance**: Audit log entries carry metadata aligned with Spanish public procurement law (Law 40/2015, Art. 24) and the EU AI Act (Annex III high-risk AI system requirements).
- **Backward compatibility**: The RAG retriever detects legacy FAISS indexes without `tender_id` metadata and falls back to source-only filtering automatically.

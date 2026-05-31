# Procurement Evaluation Workbench — CTTI

AI-assisted tender evaluation workbench for the Generalitat de Catalunya (CTTI). Implements the standard 3-envelope PCAP model for public tenders. Human evaluators retain all scoring authority; the system surfaces evidence from supplier proposals, applies deterministic price formulae, and maintains a regulatory-compliant audit trail.

---

## The 3-Envelope PCAP Model

| Envelope | Route | Points | Method |
|---|---|---|---|
| **Sobre A** | `/sobre-a` | Pass / Fail | Administrative qualification checklist |
| **Sobre B** | `/` | 49 pts | Qualitative AI-assisted evaluation |
| **Sobre C** | `/sobre-c` | 51 pts | Deterministic price formula (PCAP Annex 2.b) |

Three real CTTI tenders are bundled. The combined Sobre B + Sobre C score produces the final 100-pt ranking.

---

## Architecture

```mermaid
flowchart TD
    subgraph FE["🖥️  React Frontend  —  Vite · TypeScript · Tailwind CSS v4"]
        direction LR
        SA["Sobre A\n/sobre-a\nAdmin checklist"]
        SBD["Sobre B\n/\nSSE evaluation grid"]
        SC["Sobre C\n/sobre-c\nPrice input form"]
        AL["Audit Log\n/audit\nExport + accordion"]
    end

    subgraph BE["⚙️  FastAPI Backend  —  Python 3.13"]
        direction TB
        R1["GET  /tenders"]
        R2["GET  /tenders/{id}/plan"]
        R3["POST /tenders/{id}/evaluate   ← SSE stream"]
        R4["POST /tenders/{id}/sobre-c/calculate"]
        R5["GET  /tenders/{id}/sobre-c/criteria"]
        R6["POST /tenders/{id}/compare"]
        R7["GET | POST  /audit"]
    end

    subgraph LG["🔗  LangGraph Pipeline"]
        direction TB
        PA["Planning Agent\nReads PCAP via RAG\nGenerates eval plan\nMistral Large · t=0"]
        RA["Retrieval Agent\nTop-k proposal chunks\npgvector similarity search"]
        AA["Analysis Agent\nEvidence extraction\nMistral Large · t=0"]
        PA --> RA --> AA
    end

    subgraph SUP["🗄️  Supabase PostgreSQL"]
        PGV[("pgvector\nlangchain_pg_embedding\n≈ 3 000 chunks\nfiltered by tender_id + source")]
        AUD[("audit_log\nLaw 40/2015\nEU AI Act Annex III")]
        TPL[("tender_plans\nJSONB · per contract_id")]
        IDX[("indexed_documents\nSHA-256 hash cache")]
    end

    subgraph STARTUP["📥  FastAPI Lifespan — Startup Ingestion"]
        direction LR
        HC["SHA-256\nhash check"]
        MD["MarkItDown\nPDF → Markdown"]
        EMB["Mistral Embed\nmistral-embed"]
        HC -->|"changed / new"| MD --> EMB
    end

    subgraph DATA["📁  data/  —  Document Store"]
        direction TB
        D1["ctti_2026_36 · QKD Infrastructure\nsetup/  PCAP_T1 · PPTP_T1\nproposals/  t1_supplier_a/b/c"]
        D2["ctti_2026_1 · Connectivity Migration\nsetup/  PCAP_T2 · PPTP_T2\nproposals/  t2_supplier_a/b/c"]
        D3["ctti_2026_5 · Museums Collections\nsetup/  PCAP_T3 · PPTP_T3\nproposals/  t3_supplier_a/b/c"]
    end

    MISTRAL(["☁️  Mistral API\nmistral-large-latest\nmistral-embed"])

    FE <-->|"HTTP · SSE\naxios + fetch"| BE
    BE --> LG
    LG <-->|"similarity_search"| PGV
    PA <-->|"load / save plan"| TPL
    BE -->|"write entry"| AUD
    DATA --> STARTUP
    STARTUP <-->|"hash dedup"| IDX
    STARTUP -->|"add_documents"| PGV
    AA <-->|"inference"| MISTRAL
    PA <-->|"inference"| MISTRAL
    EMB <-->|"embeddings"| MISTRAL
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 8, Tailwind CSS v4 |
| Routing | React Router v7 |
| Data fetching | React Query v5 (TanStack) |
| HTTP client | Axios + native `fetch` (SSE streaming) |
| Markdown rendering | react-markdown |
| i18n | react-i18next (EN / ES / CA) |
| Icons | lucide-react |
| Backend API | FastAPI + Uvicorn |
| Agent pipeline | LangGraph 0.2.74 |
| LLM inference | Mistral Large (`mistral-large-latest`, temperature=0) |
| Embeddings | Mistral Embed (`mistral-embed`) |
| Vector store | Supabase pgvector (`langchain-postgres`) |
| Document extraction | MarkItDown (PDF + TXT → Markdown) |
| Audit persistence | Supabase PostgreSQL (`audit_log` table) |
| Plan persistence | Supabase PostgreSQL (`tender_plans` table, JSONB) |
| Backend deploy | Railway |
| Frontend deploy | Vercel |
| Language | Python 3.13 / TypeScript |

---

## Project Structure

```
procurement-agent-ctti/
├── api/
│   ├── main.py                    # FastAPI entry point; lifespan ingestion on startup
│   ├── schemas.py                 # Pydantic request/response models
│   └── routers/
│       ├── tenders.py             # GET /tenders, GET /tenders/{id}/plan
│       ├── evaluate.py            # POST /tenders/{id}/evaluate  (SSE stream)
│       ├── sobre_c.py             # GET /criteria, POST /calculate
│       ├── compare.py             # POST /tenders/{id}/compare
│       ├── source_chunks.py       # GET source chunk previews
│       └── audit.py               # GET/POST /audit
├── agents/
│   ├── planning_agent.py          # Reads PCAP via RAG → generates eval plan; DB-backed
│   ├── retrieval_agent.py         # Fetches top-k proposal chunks from pgvector
│   └── analysis_agent.py          # LLM evidence extraction; language-aware prompts
├── graph/
│   ├── state.py                   # EvalState TypedDict
│   └── pipeline.py                # LangGraph pipeline + TENDER_REGISTRY (3 real tenders)
├── rag/
│   ├── indexer.py                 # MarkItDown → chunk → embed → pgvector; hash dedup
│   └── retriever.py               # Semantic search with tender_id + source + doc_type filters
├── scoring/
│   └── sobre_c.py                 # Deterministic 51-pt price scorer (no file I/O)
├── db/
│   ├── audit.py                   # Supabase audit log helpers
│   └── audit.db                   # Legacy SQLite (superseded by Supabase)
├── data/
│   ├── ctti_2026_36/              # QKD Infrastructure
│   │   ├── setup/                 # PCAP_T1.pdf · PPTP_T1.pdf · *.txt criteria
│   │   ├── proposals/             # t1_supplier_a/b/c.pdf
│   │   └── sobre_c_submissions.json
│   ├── ctti_2026_1/               # Connectivity Migration Support
│   │   ├── setup/                 # PCAP_T2.pdf · PPTP_T2.pdf
│   │   └── proposals/             # t2_supplier_a/b/c.pdf
│   └── ctti_2026_5/               # Museums Collections System
│       ├── setup/                 # PCAP_T3.pdf · PPTP_T3.pdf
│       └── proposals/             # t3_supplier_a/b/c.pdf
├── tender_plans/                  # JSON plan cache (fallback if DB unavailable)
├── frontend/                      # React app (see frontend/src/)
├── requirements.txt
├── .env.example
├── CLAUDE.md                      # Developer task log and production roadmap
└── README.md
```

---

## Setup

### Prerequisites

- Python 3.13+
- Node.js 18+
- A Supabase project with the following tables created (see **Database Schema** below)
- Mistral API key

### Environment

```bash
cp .env.example .env
```

Edit `.env`:

```env
MISTRAL_API_KEY=your_mistral_api_key
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:5432/postgres
```

### Database Schema (Supabase)

Run these in the Supabase SQL editor before first startup:

```sql
-- pgvector extension (enable in Supabase dashboard under Extensions)
create extension if not exists vector;

-- LangChain PGVector tables (auto-created by langchain-postgres on first run)

-- Hash-based deduplication tracker
create table indexed_documents (
    id          serial primary key,
    tender_id   text not null,
    filename    text not null,
    file_hash   text not null,
    chunk_count int  not null,
    indexed_at  timestamptz not null default now(),
    unique (tender_id, filename)
);

-- Evaluation plan persistence
create table tender_plans (
    id          serial primary key,
    contract_id text not null unique,
    pcap_hash   text not null default '',
    plan        jsonb not null,
    updated_at  timestamptz not null default now()
);
```

### Backend

```bash
# 1. Install Python dependencies
pip install -r requirements.txt

# 2. Index PCAP and PPTP files for each tender (run once per tender)
python -m rag.indexer setup ctti_2026_36
python -m rag.indexer setup ctti_2026_1
python -m rag.indexer setup ctti_2026_5

# 3. Start the API server
#    On first startup, proposal PDFs are ingested automatically.
#    On subsequent startups, unchanged files are skipped (SHA-256 hash check).
PYTHONUNBUFFERED=1 python -m uvicorn api.main:app --reload --port 8000
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
| Backend | Railway | Set `MISTRAL_API_KEY` and `DATABASE_URL` in Railway environment variables |
| Frontend | Vercel | Set `VITE_API_URL=https://your-project.railway.app` in Vercel environment variables |

---

## Usage Walkthrough

### Tab 1 — Sobre A (`/sobre-a`)

Administrative pass/fail qualification. Five PCAP criteria are checked per supplier using a three-state toggle (unchecked / pass / fail). Use **Mark all as passed** to expedite uncontested criteria. An evaluator sign-off is required to lock Sobre A before Sobre B can run.

### Tab 2 — Sobre B (`/`)

Main qualitative evaluation dashboard.

1. Select a tender from the header dropdown and a language from the globe icon (top-right).
2. Ensure Sobre A is locked — the amber gate banner will confirm if not.
3. Click **Run Evaluation** to start the SSE stream. The planning agent reads the PCAP and generates a structured evaluation plan (cached in Supabase after first generation). Results appear cell-by-cell as each supplier × criterion pair completes.
4. Review the AI-surfaced evidence in each `EvidenceCard`.
5. Enter your human score (0 – max_points) for each cell independently.
6. A cross-supplier comparison is generated automatically per criterion once all suppliers have results. Cached for the session.
7. Use **Review Evaluations** for a split-screen cell-by-cell walkthrough.
8. Enter your evaluator ID and click **Sign and Submit** to lock scores and write the audit entry.

### Tab 3 — Sobre C (`/sobre-c`)

Enter each supplier's declared values from their Sobre C envelope (price, SLA commitments, delivery times, etc.). Click **Calculate Scores** to apply the proportionality formula from Directriu 1/2020. The combined 100-pt final ranking appears once Sobre B scores have also been submitted.

### Tab 4 — Audit Log (`/audit`)

Immutable record of all submitted evaluations. Scores table with expandable evidence accordion per entry. Export to a timestamped JSON file aligned with Law 40/2015 Art. 24 and EU AI Act Annex III.

---

## Adding a New Tender

1. Create the directory structure:
   ```
   data/<tender_id>/
   ├── setup/        ← PCAP and PPTP PDFs go here
   └── proposals/    ← supplier proposal PDFs go here
   ```
2. Add an entry to `TENDER_REGISTRY` in `graph/pipeline.py` with `contract_id`, `label`, and `suppliers`.
3. Add the Sobre C criteria definition to `SOBRE_C_CRITERIA` in `api/routers/sobre_c.py`.
4. Index the setup documents: `python -m rag.indexer setup <tender_id>`
5. Drop proposal PDFs into `data/<tender_id>/proposals/` — they are ingested automatically on the next API startup.
6. The tender appears in the UI dropdown immediately. No other code changes needed.

---

## Document Ingestion Pipeline

```
PDF / TXT files
    │
    ▼
MarkItDown              converts to clean Markdown text
    │
    ▼
SHA-256 hash check      skips file if hash matches indexed_documents table
    │  (new or changed)
    ▼
RecursiveCharacterTextSplitter   chunk_size=500, chunk_overlap=100
    │
    ▼
Mistral Embed           mistral-embed vectors
    │
    ▼
Supabase pgvector       stored in langchain_pg_embedding
                        metadata: { tender_id, source, doc_type }
```

**Setup documents** (`setup/`) are indexed manually once per tender via `python -m rag.indexer setup <tender_id>`.

**Proposal documents** (`proposals/`) are checked and ingested automatically every time the API starts. Files are skipped if their SHA-256 hash matches the `indexed_documents` table — so restarts are fast after the first ingestion.

---

## Design Principles

- **Human-in-the-loop**: AI surfaces evidence only; all scoring decisions belong to the procurement officer. The system cannot auto-score or submit without an identified human sign-off.
- **Deterministic LLM output**: Mistral Large is called at temperature=0 for reproducible analysis across evaluation sessions.
- **Dual-context retrieval**: Each analysis call retrieves both supplier-specific proposal chunks and official criteria/requirements chunks, grounding the model in both the offer and the evaluation standard.
- **Progressive disclosure**: Evidence streams in as it is produced; evaluators can start reviewing early cells while later ones are still running.
- **Hash-based deduplication**: The indexer tracks a SHA-256 hash per file. Unchanged files are never re-embedded, keeping startup fast and Mistral API costs predictable.
- **Regulatory compliance**: Audit log entries carry metadata aligned with Spanish public procurement law (Law 40/2015, Art. 24) and the EU AI Act (Annex III high-risk AI system requirements).
- **Data sovereignty path**: The architecture is model-agnostic. Swapping Mistral for AINA (Barcelona Supercomputing Center) is a one-line `.env` change, enabling fully on-premises deployment within Catalan infrastructure.

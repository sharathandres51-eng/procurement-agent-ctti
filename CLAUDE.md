# CLAUDE.md — Developer Task Log

## What this project is

AI-assisted procurement evaluation workbench for the Generalitat de Catalunya (CTTI). Implements the Spanish 3-envelope PCAP model: Sobre A (administrative pass/fail), Sobre B (qualitative AI-assisted, 49 pts), Sobre C (deterministic price formula, 51 pts). Three synthetic tenders. Human evaluators retain all scoring authority; the system surfaces evidence and maintains a regulatory-compliant audit trail.

---

## Completed features

### Core pipeline
- [x] LangGraph pipeline (`planning_agent` → `retrieval_agent` → `analysis_agent`) in `graph/pipeline.py`
- [x] Planning Agent reads the PCAP via RAG and generates a structured eval plan, cached in Supabase (`tender_plans` table)
- [x] Supabase **pgvector** semantic search with `tender_id` + `source` + `doc_type` filters (`rag/retriever.py`)
- [x] Deterministic 51-pt Sobre C price scorer (`scoring/sobre_c.py`, no file I/O — values posted by the evaluator)
- [x] Supabase **PostgreSQL** audit log compliant with Law 40/2015 + EU AI Act Annex III (`db/audit.py`; legacy `audit.db` SQLite superseded)
- [x] `TENDER_REGISTRY` in `graph/pipeline.py` for multi-tender support (3 real tenders: ctti_2026_36 / _1 / _5)
- [x] **MarkItDown** PDF + TXT → Markdown ingestion (`rag/indexer.py`) with SHA-256 hash dedup (`indexed_documents` table)
- [x] Startup ingestion runs as a FastAPI lifespan **background thread** so Railway's health check passes immediately

### React + FastAPI architecture (replaced Streamlit prototype)
- [x] FastAPI backend with modular routers: `tenders`, `evaluate` (SSE), `sobre_c`, `compare`, `source_chunks`, `audit`
- [x] React 19 + TypeScript + Vite 8 + Tailwind CSS v4 frontend
- [x] React Router v7 — `/` redirects to `/sobre-a` (default landing); `/sobre-b`, `/sobre-c`, `/audit`
- [x] React Query v5 — global `staleTime: 5 min`; audit prefetched on app load
- [x] Eval state lifted in `App.tsx` (`TenderEvalState`) — survives tab navigation per tender
- [x] Streaming evaluation via `fetch()` + ReadableStream with functional updater pattern (no stale closures)
- [x] `useMemo` on `activeEval` — prevents downstream re-renders when eval state is uninitialised
- [x] Error boundary (`components/ErrorBoundary.tsx`) — render-time throws show a readable error instead of a blank screen

### Sobre A tab (`/sobre-a`)
- [x] Administrative pass/fail checklist — 5 PCAP criteria per supplier
- [x] Three-state toggle (null / pass / fail)
- [x] "Mark all as passed" shortcut per supplier row
- [x] Lock + evaluator sign-off gate; Sobre B is disabled until Sobre A is locked

### Sobre B (`/sobre-b`)
- [x] SSE stream from `/tenders/{id}/evaluate` — results appear cell-by-cell
- [x] `EvidenceCard` per supplier × criterion with human score input
- [x] Cross-supplier `ComparisonPanel` — `useQuery` with `staleTime: Infinity` (computed once, cached for session)
- [x] `react-markdown` renders LLM comparison output (bold, lists, headers) via custom Tailwind component map
- [x] Split-screen review mode (evidence left / source chunks right)
- [x] Summary table + Sign & Submit → writes audit entry + invalidates `['audit']` cache

### Sobre C tab (`/sobre-c`)
- [x] Declared values table
- [x] Per-criterion score breakdown
- [x] Combined 100-pt ranking (Sobre B + Sobre C)

### Audit Log tab (`/audit`)
- [x] All submitted evaluations with expandable evidence accordion
- [x] JSON export (timestamped, with regulatory metadata header)
- [x] Cache invalidated via `queryClient.invalidateQueries` after each submission

### i18n
- [x] Full EN / ES / CA support via react-i18next
- [x] ~60 translation keys in `frontend/src/i18n/translations.json`
- [x] Language picker in the header (globe icon)
- [x] LLM prompts inject language instruction — responses match UI language

### UI / UX
- [x] CTTI logo (`frontend/public/ctti_logo.jpeg`) as favicon, header brand (`Layout.tsx`), and login page
- [x] Page title: "CTTI Procurement Evaluation"
- [x] Tender selector in header (`Layout.tsx`)
- [x] lucide-react icon set; no emoji in navigation

### Access control (deployed app)
- [x] Vercel Edge Middleware password gate (`middleware.ts` + identical `frontend/middleware.ts`)
- [x] Branded **password-only** login page (CTTI logo + single field) instead of the native Basic Auth dialog
- [x] Password checked against a committed **SHA-256 hash** (no env var; safe in a public repo) via Web Crypto in the Edge runtime
- [x] `HttpOnly; Secure` cookie (`ctti_pw`) keeps the session for 24 h; change password by replacing `PASSWORD_SHA256` in both files

### Deployment fixes (Railway + Vercel)
- [x] Lazy-init `ChatMistralAI` (`agents/*.py`) so a missing `MISTRAL_API_KEY` can't crash on import
- [x] Background-thread startup ingestion so Railway health check passes immediately
- [x] Hardcoded Railway API URL fallback in `frontend/src/api/client.ts` (Vercel env vars weren't reaching the build)
- [x] Production Vercel origin baked into CORS defaults + `*.vercel.app` preview regex (`api/main.py`)

### Bug fixes
- [x] Stale closure in SSE stream — `handleResultsUpdate` uses `setEvalState(prev => ...)` functional updater
- [x] i18n interpolation — all `{variable}` → `{{variable}}` (react-i18next double-brace syntax)
- [x] ComparisonPanel reloads on every visit — replaced `useMutation` (no cache) with `useQuery` (`staleTime: Infinity`)
- [x] Markdown rendered literally — added `react-markdown` with custom Tailwind component map
- [x] Audit slow first load — query prefetched from `App.tsx` on mount
- [x] Audit stale after submission — `queryClient.invalidateQueries(['audit'])` called post-submit
- [x] `activeEval` reference instability — wrapped in `useMemo`

---

## Next steps

### Hardening
- [x] PostgreSQL (Supabase) for audit log, plans, and vector store — done
- [x] Site-level password gate on the deployed app — done
- [ ] Per-evaluator authentication / identity (current gate is a shared password; evaluator ID is still free text)
- [ ] Role-based access for sign-off
- [ ] Rate-limit the `/evaluate` endpoint per evaluator session
- [ ] Optimistic locking — prevent two evaluators from submitting conflicting scores for the same tender
- [ ] Fix the Vercel env-var pipeline (repo likely linked to two projects) so secrets don't need to be hardcoded

### Evaluation quality
- [ ] Allow evaluators to add freetext annotations per cell (currently score only)
- [ ] Surface source PDF page numbers alongside each evidence chunk
- [ ] "Re-evaluate this cell" button without re-running the full pipeline
- [ ] Confidence signal from the LLM alongside evidence

### Tender management
- [ ] Admin UI for uploading new tender documents (currently requires CLI + re-index)
- [ ] Per-tender PCAP criteria config stored in the database rather than in `TENDER_REGISTRY`
- [ ] Sobre A criteria configurable per tender

### Observability
- [ ] Structured logging per pipeline run (model version, latency, token counts)
- [ ] Prometheus metrics endpoint for Railway monitoring
- [ ] Sentry integration for frontend error tracking

---

## Path to production

| Concern | Current state | Production target |
|---|---|---|
| Authentication | Shared site password + free-text evaluator ID | VALID / IdCAT / Cl@ve (Generalitat identity) |
| Data isolation | `tender_id` filter in RAG | Tenant-isolated database per procurement body |
| Audit immutability | Supabase PostgreSQL (append-only writes) | Managed Postgres + WAL + signed export |
| LLM traceability | temperature=0, prompt stored in audit | Full model card + Annex III conformity assessment |
| Sovereignty | Mistral API (external) | AINA (BSC) — native Catalan, on-premises |
| GDPR | Real CTTI tender docs (PDF) | Legal review for supplier PII |
| Accessibility | Basic Tailwind | axe-core audit + ARIA annotations |

---

## Model note

All LLM calls use `mistral-large-latest` at temperature=0 via `langchain-mistralai`. Embeddings use `mistral-embed`. Both are called through the standard Mistral API. The production target is **AINA** (Barcelona Supercomputing Center) for data sovereignty and native Catalan language support. Swapping models is a one-line change in `.env` — the architecture is model-agnostic.

---

## Key commands

### Backend
```bash
# Install dependencies
pip install -r requirements.txt

# Requires .env with MISTRAL_API_KEY and DATABASE_URL (Supabase pooler string)

# Index a tender's setup docs (PCAP + PPTP) into pgvector — run once per tender
python -m rag.indexer setup ctti_2026_36

# Start API server (development, hot-reload).
# Proposal PDFs are ingested automatically on startup (SHA-256 dedup skips unchanged files).
PYTHONUNBUFFERED=1 python -m uvicorn api.main:app --reload --port 8000
```

### Frontend
```bash
cd frontend

# Install dependencies
npm install

# Start Vite dev server (proxies /api/* → localhost:8000)
npm run dev

# Type-check without emitting
npx tsc --noEmit

# Production build
npm run build

# Preview production build locally
npm run preview
```

### Database (Supabase PostgreSQL)
```bash
# Tables: langchain_pg_embedding (pgvector), audit_log, tender_plans, indexed_documents.
# Create them via the SQL in README.md → "Database Schema (Supabase)".
# To force re-ingestion of a file, delete its row from indexed_documents (or TRUNCATE it).
```

### Deployment / access
```bash
# Change the site access password — update PASSWORD_SHA256 in BOTH middleware files:
printf '%s' 'newpassword' | shasum -a 256
# then paste the hash into middleware.ts and frontend/middleware.ts
```

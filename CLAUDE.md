# CLAUDE.md — Developer Task Log

## What this project is

AI-assisted procurement evaluation workbench for the Generalitat de Catalunya (CTTI). Implements the Spanish 3-envelope PCAP model: Sobre A (administrative pass/fail), Sobre B (qualitative AI-assisted, 49 pts), Sobre C (deterministic price formula, 51 pts). Three synthetic tenders. Human evaluators retain all scoring authority; the system surfaces evidence and maintains a regulatory-compliant audit trail.

---

## Completed features

### Core pipeline
- [x] LangGraph 2-node pipeline (`retrieval_agent` → `analysis_agent`) in `graph/pipeline.py`
- [x] FAISS semantic search with `tender_id` + `source` metadata filters (`rag/retriever.py`)
- [x] Backward-compat fallback: detects legacy indexes without `tender_id` and filters by source only
- [x] Deterministic 51-pt Sobre C price scorer driven by `sobre_c_submissions.json` (`scoring/sobre_c.py`)
- [x] SQLite audit log compliant with Law 40/2015 + EU AI Act Annex III (`db/audit.py`)
- [x] `TENDER_REGISTRY` in `graph/pipeline.py` for multi-tender support (3 tenders)
- [x] pdfplumber-based PDF document ingestion (`rag/pdf_loader.py`)

### React + FastAPI migration (replaced Streamlit prototype)
- [x] FastAPI backend with modular routers: `tenders`, `evaluate` (SSE), `sobre_c`, `compare`, `source_chunks`, `audit`
- [x] React 19 + TypeScript + Vite 8 + Tailwind CSS v4 frontend
- [x] React Router v7 — 4 routes: `/sobre-a`, `/` (Sobre B), `/sobre-c`, `/audit`
- [x] React Query v5 — global `staleTime: 5 min`; Sobre C + audit prefetched on app load
- [x] Eval state lifted in `App.tsx` (`TenderEvalState`) — survives tab navigation per tender
- [x] Streaming evaluation via `fetch()` + ReadableStream with functional updater pattern (no stale closures)
- [x] `useMemo` on `activeEval` — prevents downstream re-renders when eval state is uninitialised

### Sobre A tab (`/sobre-a`)
- [x] Administrative pass/fail checklist — 5 PCAP criteria per supplier
- [x] Three-state toggle (null / pass / fail)
- [x] "Mark all as passed" shortcut per supplier row
- [x] Lock + evaluator sign-off gate; Sobre B is disabled until Sobre A is locked

### Sobre B (`/`)
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
- [x] CTTI logo favicon (`frontend/public/ctti_logo.jpeg`)
- [x] Page title: "CTTI Procurement Evaluation"
- [x] Tender selector in header (`Layout.tsx`)
- [x] lucide-react icon set; no emoji in navigation

### Bug fixes
- [x] RAG zero chunks — legacy FAISS indexes without `tender_id` now fall back to source-only filtering
- [x] Stale closure in SSE stream — `handleResultsUpdate` uses `setEvalState(prev => ...)` functional updater
- [x] i18n interpolation — all `{variable}` → `{{variable}}` (react-i18next double-brace syntax)
- [x] ComparisonPanel reloads on every visit — replaced `useMutation` (no cache) with `useQuery` (`staleTime: Infinity`)
- [x] Markdown rendered literally — added `react-markdown` with custom Tailwind component map
- [x] Sobre C / Audit slow first load — both queries prefetched from `App.tsx` on mount
- [x] Audit stale after submission — `queryClient.invalidateQueries(['audit'])` called post-submit
- [x] `activeEval` reference instability — wrapped in `useMemo`

---

## Next steps

### Hardening
- [ ] Replace SQLite with PostgreSQL for production multi-user concurrency
- [ ] Add authentication (evaluator login, role-based access for sign-off)
- [ ] Rate-limit the `/evaluate` endpoint per evaluator session
- [ ] Optimistic locking — prevent two evaluators from submitting conflicting scores for the same tender

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
| Authentication | Free-text evaluator ID | VALID / IdCAT / Cl@ve (Generalitat identity) |
| Data isolation | `tender_id` filter in RAG | Tenant-isolated database per procurement body |
| Audit immutability | Append-only SQLite | PostgreSQL + WAL + signed export |
| LLM traceability | temperature=0, prompt stored in audit | Full model card + Annex III conformity assessment |
| Sovereignty | Mistral API (external) | AINA (BSC) — native Catalan, on-premises |
| GDPR | Synthetic data only | Legal review before loading real supplier docs |
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

# Build / rebuild FAISS index (run after adding or replacing any data file)
python -m rag.indexer

# Start API server (development, hot-reload)
uvicorn api.main:app --reload --port 8000

# Run backend tests
pytest
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

### Database
```bash
# The audit database is created automatically on first API startup.
# To reset it during development:
rm db/audit.db
```

# Frontend — CTTI Procurement Evaluation Workbench

React 19 + TypeScript frontend for the CTTI procurement evaluation workbench. Communicates with a FastAPI backend over HTTP and SSE.

---

## Tech Stack

| | |
|---|---|
| Framework | React 19 + TypeScript |
| Build tool | Vite 8 |
| Styling | Tailwind CSS v4 |
| Routing | React Router v7 |
| Data fetching | React Query v5 (TanStack) |
| HTTP | Axios (standard requests) + native `fetch` (SSE streaming) |
| Markdown | react-markdown |
| i18n | react-i18next (EN / ES / CA) |
| Icons | lucide-react |

---

## Dev Setup

```bash
npm install
npm run dev        # Vite dev server at http://localhost:5173
                   # /api/* proxied to http://localhost:8000
```

The backend must be running on port 8000. See the root `README.md` for backend setup.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `VITE_API_URL` | Production only | Full URL of the Railway backend, e.g. `https://your-project.railway.app`. Omit in development — Vite's proxy handles `/api` automatically. |

Set in Vercel project settings. Never commit to the repo.

---

## Directory Structure (`src/`)

```
src/
├── App.tsx                        # Root: state lifting, prefetching, route wiring
├── main.tsx                       # ReactDOM entry + QueryClient + BrowserRouter + i18n
├── api/
│   ├── client.ts                  # Axios instance (baseURL from VITE_API_URL or /api)
│   ├── evaluate.ts                # SSE streaming via fetch() + ReadableStream
│   ├── tenders.ts
│   ├── audit.ts
│   ├── sobreC.ts
│   ├── compare.ts
│   └── sourceChunks.ts
├── components/
│   ├── Layout.tsx                 # Header: brand, tender selector, tab nav, language picker
│   ├── ComparisonPanel.tsx        # Cross-supplier comparison (cached, react-markdown)
│   ├── EvidenceCard.tsx           # Single supplier × criterion result cell
│   ├── SourceChunksPanel.tsx      # Expandable RAG source excerpts (split-screen)
│   ├── PlanTable.tsx              # Evaluation plan table
│   └── Spinner.tsx
├── pages/
│   ├── SobreA.tsx                 # /sobre-a — administrative qualification checklist
│   ├── Dashboard.tsx              # /        — Sobre B streaming evaluation
│   ├── SobreC.tsx                 # /sobre-c — price scoring + final ranking
│   └── AuditLog.tsx               # /audit   — submitted evaluations log
├── i18n/
│   ├── index.ts                   # i18next init + SUPPORTED_LANGUAGES map
│   └── translations.json          # ~60 keys × EN / ES / CA
└── types/
    └── index.ts                   # SobreAState, TenderEvalState, EvaluationResults, etc.
```

---

## Routes

| Path | Component | Description |
|---|---|---|
| `/sobre-a` | `SobreA.tsx` | Administrative pass/fail checklist. Must be locked before Sobre B can run. |
| `/` | `Dashboard.tsx` | Sobre B streaming evaluation, evidence grid, comparison, sign & submit. |
| `/sobre-c` | `SobreC.tsx` | Price scoring breakdown and 100-pt combined ranking. |
| `/audit` | `AuditLog.tsx` | Immutable evaluation records with JSON export. |

---

## Key Architectural Decisions

### State lifting in `App.tsx`

All evaluation state per tender (`TenderEvalState`) is held in `App.tsx` and passed down as props. This ensures in-progress evaluations and human-entered scores survive React Router tab navigation without a global store or URL serialisation. `useMemo` stabilises the per-tender state reference so children don't re-render unnecessarily.

### Prefetching strategy

`App.tsx` calls `queryClient.prefetchQuery` for the Sobre C data and the audit log on mount (and on tender change). This ensures navigating to `/sobre-c` or `/audit` for the first time is instant — the data is already in cache before the user clicks.

`ComparisonPanel` uses `useQuery` with `staleTime: Infinity`. Cross-supplier comparisons are expensive LLM calls; once computed they are cached for 30 minutes and never re-fetched during the session unless the language changes.

### SSE streaming pattern

The `/tenders/{id}/evaluate` endpoint streams one Server-Sent Event per supplier × criterion cell. `api/evaluate.ts` opens the stream with native `fetch()` (not axios, which doesn't support streaming responses). Each incoming event is applied with a functional updater:

```ts
// In App.tsx
const handleResultsUpdate = (tenderId, updater) => {
  setEvalState(prev => {
    const current = prev[tenderId] ?? { ... }
    return { ...prev, [tenderId]: { ...current, results: updater(current.results) } }
  })
}
```

The functional updater ensures every event always accumulates into the latest queued state rather than the snapshot captured when the stream handler was created.

### Audit cache invalidation

After `submitAuditEntry` resolves in `Dashboard.tsx`, `queryClient.invalidateQueries({ queryKey: ['audit'] })` triggers a background refresh. When the user navigates to `/audit`, the new submission is already present.

### Markdown rendering

LLM comparison responses contain markdown (`**bold**`, bullet lists, `###` headers). `ComparisonPanel` uses `react-markdown` with a custom `components` map that applies Tailwind classes directly — no `@tailwindcss/typography` plugin required.

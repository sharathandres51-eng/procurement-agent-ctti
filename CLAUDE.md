# CLAUDE.md — Procurement Evaluation Agent (CTTI-2026-36)

This file tracks outstanding work required before this prototype is ready for CTTI submission.

---

## What this project is

An AI-assisted tender evaluation workbench for the Generalitat de Catalunya's CTTI. The system uses a two-node LangGraph pipeline (retrieval → analysis) backed by a FAISS vector store to surface evidence from supplier proposals. Human evaluators retain all scoring authority. The current prototype covers one fictional tender (QKD infrastructure, CTTI-2026-36) with three synthetic supplier proposals.

---

## Outstanding tasks for CTTI submission

### 1. Add more synthetic tender cases
- Currently only one tender scenario is loaded (QKD infrastructure).
- Add at least 2–3 more synthetic tenders in different domains (e.g. cloud services, cybersecurity consultancy) to demonstrate the system generalises beyond a single contract type.
- Each new tender needs: a `pcap_criteria.txt`, a `ppt_requirements.txt`, and proposal files for at least two suppliers.
- Re-run `rag/indexer.py` after adding new documents to rebuild the FAISS index.

### 2. Build a PDF ingestion pipeline
- Supplier proposals are currently plain `.txt` files. Real Sobre B envelopes submitted through the PSCP portal are PDFs.
- Add a PDF parsing step (e.g. `pypdf` or `pdfplumber`) upstream of the existing chunking logic in `rag/indexer.py`.
- The pipeline should handle multi-column layouts and extract text faithfully enough for semantic search.

### 3. Implement Sobre C automatic price scoring (51 points)
- The current prototype only covers the 49 qualitative points (Sobre B / judici de valor).
- The full evaluation model is 100 points. Without Sobre C, no final ranking can be produced.
- Add synthetic price data and declared values (SLA levels, training days, energy consumption, warranty times) for each supplier.
- Implement the 6 sub-criteria from PCAP Annex 2.b using their respective formulas:
  - 2.1 Valoració econòmica (20 pts) — standard lowest-bid formula
  - 2.2 Increment de nivell d'ANS (5 pts)
  - 2.3 Serveis professionals de fabricant (10 pts)
  - 2.4 Formació de la solució implantada (5 pts)
  - 2.5 Eficiència energètica (3 pts)
  - 2.6 Temps de resolució garantia fabricant (8 pts)
- Display the combined 100-point ranking in the Streamlit UI.

### 4. Persist the audit log
- The audit log currently lives in Streamlit session state and is wiped on page refresh.
- Replace with a database-backed store (e.g. SQLite for the prototype, PostgreSQL for production).
- Add an export function (signed PDF or JSON) so the audit record can be shared with the Mesa de Contractació.
- This is necessary for the compliance story to be credible to a government audience (Law 40/2015 Art. 24 / EU AI Act Annex III).

---

## Path to production (post-submission, for reference)

### Phase 1 — Sovereignty & Infrastructure
- Self-host the LLM on CTTI / BSC infrastructure; swap Mistral API for AINA (Barcelona Supercomputing Center).
- Replace FAISS with a Generalitat-managed vector database (e.g. pgvector).
- Deploy behind CTTI's internal network — no procurement data should leave Catalan infrastructure.
- Ensure compliance with ENS (Esquema Nacional de Seguretat) and GDPR.

### Phase 2 — Real Document Ingestion
- Connect directly to the PSCP (Plataforma de Serveis de Contractació Pública de Catalunya).
- Automate document ingestion at upload time; audit trail starts at ingestion, not evaluation.

### Phase 3 — Legal & Compliance Hardening
- Complete EU AI Act Annex III conformity assessment (this is a high-risk AI system).
- Replace free-text evaluator ID with VALID authentication (Generalitat digital identity).
- Ensure audit log is publishable under Llei 19/2014 (Catalan transparency law).

### Phase 4 — Expand Scope
- Multi-tender support across all Generalitat departments (salut, educació, etc.).
- Supplier-facing portal for proposal submission and preliminary feedback.
- Generalise to other public bodies as a reusable procurement intelligence platform.

---

## Model note

The prototype uses **Mistral Large** (`mistral-large-latest`) via API for both embeddings and inference. The architecture is model-agnostic — swapping the LLM is a one-line config change in `.env`. The target for production is **AINA** (BSC) for data sovereignty and native Catalan language support.

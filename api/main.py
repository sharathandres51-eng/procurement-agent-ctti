"""
api/main.py
-----------
FastAPI application entry point for the CTTI Procurement Evaluation API.

Run with:
    uvicorn api.main:app --reload --port 8000

Interactive docs available at:
    http://localhost:8000/docs    (Swagger UI)
    http://localhost:8000/redoc  (ReDoc)
"""

import os
# macOS: FAISS and PyTorch both load libomp.dylib; must be set before any
# import that triggers FAISS or torch initialisation.
os.environ.setdefault("KMP_DUPLICATE_LIB_OK", "TRUE")

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import tenders, evaluate, compare, sobre_c, audit

app = FastAPI(
    title="CTTI Procurement Evaluation API",
    description=(
        "AI-assisted tender evaluation backend for the Government of Catalonia (CTTI). "
        "Exposes RAG-based evidence extraction, deterministic Sobre C scoring, "
        "and a SQLite-backed regulatory audit log."
    ),
    version="0.1.0",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# In development, allow requests from the Vite dev server.
# In production, restrict to the deployed frontend origin.

ALLOWED_ORIGINS = os.getenv(
    "ALLOWED_ORIGINS",
    "http://localhost:5173,http://localhost:3000",
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in ALLOWED_ORIGINS],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ───────────────────────────────────────────────────────────────────

app.include_router(tenders.router)
app.include_router(evaluate.router)
app.include_router(compare.router)
app.include_router(sobre_c.router)
app.include_router(audit.router)


# ── Health check ──────────────────────────────────────────────────────────────

@app.get("/health", tags=["meta"])
def health():
    return {"status": "ok", "service": "ctti-procurement-api"}


@app.get("/", tags=["meta"])
def root():
    return {
        "message": "CTTI Procurement Evaluation API",
        "docs": "/docs",
        "health": "/health",
    }

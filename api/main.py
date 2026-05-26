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

from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import tenders, evaluate, compare, sobre_c, audit

INDEX_DIR = Path(__file__).parent.parent / "rag" / "faiss_index"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    On startup: build the FAISS index if it doesn't exist.
    This is a safety net for Railway deployments where the Nixpacks
    build phase ran the indexer but the filesystem may not have persisted,
    or for first-time local runs before `python -m rag.indexer` has been run.
    """
    if not INDEX_DIR.exists() or not any(INDEX_DIR.iterdir()):
        print("FAISS index not found — building now (this takes ~2 minutes)…")
        try:
            from rag.indexer import build_index
            build_index()
            print("FAISS index built successfully.")
        except Exception as exc:
            print(f"WARNING: Failed to build FAISS index on startup: {exc}")
            print("The /evaluate endpoint will not work until the index is built.")
            print("Run: python -m rag.indexer")
    else:
        print(f"FAISS index found at {INDEX_DIR} — ready.")
    yield


app = FastAPI(
    title="CTTI Procurement Evaluation API",
    description=(
        "AI-assisted tender evaluation backend for the Government of Catalonia (CTTI). "
        "Exposes RAG-based evidence extraction, deterministic Sobre C scoring, "
        "and a SQLite-backed regulatory audit log."
    ),
    version="0.1.0",
    lifespan=lifespan,
)

# ── CORS ──────────────────────────────────────────────────────────────────────
# In development, allow requests from the Vite dev server.
# In production, set ALLOWED_ORIGINS to your Vercel frontend URL.
# e.g. ALLOWED_ORIGINS=https://procurement-ctti.vercel.app

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
    index_ready = INDEX_DIR.exists() and any(INDEX_DIR.iterdir())
    return {
        "status": "ok",
        "service": "ctti-procurement-api",
        "faiss_index": "ready" if index_ready else "missing",
    }


@app.get("/", tags=["meta"])
def root():
    return {
        "message": "CTTI Procurement Evaluation API",
        "docs": "/docs",
        "health": "/health",
    }

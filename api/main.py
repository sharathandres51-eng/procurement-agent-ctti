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
import threading

from dotenv import load_dotenv
load_dotenv()

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.routers import tenders, evaluate, compare, sobre_c, audit
from rag.indexer import ingest_all_proposals


def _ingest_background():
    """Run proposal ingestion in a daemon thread so startup doesn't block."""
    try:
        print("Background ingestion: starting…")
        ingest_all_proposals()
        print("Background ingestion: complete.")
    except Exception as exc:
        print(f"Background ingestion: failed — {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start ingestion in a background thread so Railway's health check
    # is satisfied immediately — ingestion may take 30–120 s on cold start.
    t = threading.Thread(target=_ingest_background, daemon=True)
    t.start()
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
    return {
        "status": "ok",
        "service": "ctti-procurement-api",
    }


@app.get("/", tags=["meta"])
def root():
    return {
        "message": "CTTI Procurement Evaluation API",
        "docs": "/docs",
        "health": "/health",
    }

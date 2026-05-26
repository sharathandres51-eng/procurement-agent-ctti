"""
api/routers/audit.py
---------------------
GET  /audit         — list all submitted audit entries (newest first)
POST /audit         — submit a new audit entry
GET  /audit/export  — download full audit log as JSON
"""

import json
from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from datetime import datetime
from db.audit import init_db, insert_entry, get_all_entries, export_json
from api.schemas import AuditEntryCreate, AuditEntryResponse

router = APIRouter(prefix="/audit", tags=["audit"])

init_db()


@router.get("", response_model=list[AuditEntryResponse])
def list_entries():
    entries = get_all_entries()
    return [AuditEntryResponse(**e) for e in entries]


@router.post("", response_model=AuditEntryResponse, status_code=201)
def create_entry(body: AuditEntryCreate):
    entry = body.model_dump()
    try:
        insert_entry(entry)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))
    return AuditEntryResponse(**entry)


@router.get("/export")
def export_audit():
    """Return the full audit log as a downloadable JSON file."""
    payload = export_json()
    filename = f"audit_log_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    return Response(
        content=payload,
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )

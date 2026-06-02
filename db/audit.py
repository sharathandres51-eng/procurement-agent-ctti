"""
db/audit.py
-----------
SQLite-backed audit log for CTTI procurement evaluations.

Replaces the session-state list used in the prototype's first version.
The database file (audit.db) is gitignored; use export_json() to produce
a shareable record for the Mesa de Contractació.

Schema
------
  id            INTEGER  PK AUTOINCREMENT
  evaluator_id  TEXT     evaluator login (VALID ID in production)
  timestamp     TEXT     ISO-8601 datetime of submission
  contract      TEXT     e.g. "CTTI-2026-36"
  entry_json    TEXT     full audit entry serialised as JSON

Regulatory alignment
--------------------
  Law 40/2015 Art. 24  - evaluator identity and timestamp recorded at submission
  EU AI Act Annex III  - AI-generated evidence stored alongside human decisions,
                         demonstrating human-in-the-loop compliance
  Llei 19/2014         - log structure supports future publication obligations
"""

import json
import sqlite3
from datetime import datetime
from pathlib import Path

DB_PATH = Path(__file__).parent / "audit.db"


def init_db() -> None:
    """Create the audit table if it does not exist. Safe to call on every startup."""
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                evaluator_id  TEXT    NOT NULL,
                timestamp     TEXT    NOT NULL,
                contract      TEXT    NOT NULL,
                entry_json    TEXT    NOT NULL
            )
        """)
        conn.commit()


def insert_entry(entry: dict) -> int:
    """
    Persist a single audit entry. Returns the new row id.

    The full entry dict is stored as JSON so no schema migration is needed
    when additional fields are added in future.
    """
    with sqlite3.connect(DB_PATH) as conn:
        cursor = conn.execute(
            """
            INSERT INTO audit_log (evaluator_id, timestamp, contract, entry_json)
            VALUES (?, ?, ?, ?)
            """,
            (
                entry["evaluator_id"],
                entry["timestamp"],
                entry["contract"],
                json.dumps(entry, ensure_ascii=False, indent=2),
            ),
        )
        conn.commit()
        return cursor.lastrowid


def get_all_entries() -> list[dict]:
    """Return all audit entries ordered by submission time (newest first)."""
    if not DB_PATH.exists():
        return []
    with sqlite3.connect(DB_PATH) as conn:
        rows = conn.execute(
            "SELECT entry_json FROM audit_log ORDER BY id DESC"
        ).fetchall()
    return [json.loads(row[0]) for row in rows]


def get_entry_count() -> int:
    """Return the total number of submitted evaluations."""
    if not DB_PATH.exists():
        return 0
    with sqlite3.connect(DB_PATH) as conn:
        return conn.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0]


def export_json() -> str:
    """
    Serialise the full audit log to a JSON string suitable for download.

    The export includes a metadata header with generation timestamp and
    record count for traceability.
    """
    entries = get_all_entries()
    payload = {
        "export_metadata": {
            "generated_at": datetime.now().isoformat(),
            "record_count": len(entries),
            "regulatory_basis": (
                "Law 40/2015 Art. 24 - evaluator signatures recorded at submission. "
                "EU AI Act Annex III - AI evidence retained alongside human decisions."
            ),
        },
        "entries": entries,
    }
    return json.dumps(payload, ensure_ascii=False, indent=2)

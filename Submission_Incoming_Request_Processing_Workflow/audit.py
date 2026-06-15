"""
Compliance-grade audit trail.

Every processed request is written to an append-only SQLite log capturing the
full decision: input, classification, urgency, confidence, the manager's
rationale, every action taken, and whether it was escalated to a human. In a
healthcare contact center this is the difference between "the AI did something"
and "we can show exactly what the AI did and why" — which is what auditability,
service-quality review, and oversight require.
"""

import json
import sqlite3
from datetime import datetime, timezone

from models import ProcessedRequest
import config


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    with _conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS audit_log (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id      TEXT NOT NULL,
                processed_at    TEXT NOT NULL,
                channel         TEXT,
                member_name     TEXT,
                request_body    TEXT,
                type            TEXT,
                urgency         TEXT,
                confidence      REAL,
                language        TEXT,
                clinical_flag   INTEGER,
                phi_present     INTEGER,
                rationale       TEXT,
                classifier_source TEXT,
                assigned_team   TEXT,
                requires_human_review INTEGER,
                escalation_reason TEXT,
                actions_json    TEXT,
                draft_response  TEXT
            )
            """
        )


def record(pr: ProcessedRequest) -> None:
    t, r, req = pr.type_decision, pr.remediation, pr.request
    with _conn() as conn:
        conn.execute(
            """INSERT INTO audit_log (
                request_id, processed_at, channel, member_name, request_body,
                type, urgency, confidence, language, clinical_flag, phi_present,
                rationale, classifier_source, assigned_team,
                requires_human_review, escalation_reason, actions_json,
                draft_response
            ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (
                req.id, pr.processed_at, req.channel, req.member_name, req.body,
                t.type.value, t.urgency.value, t.confidence, t.language.value,
                int(t.clinical_flag), int(t.phi_present), t.rationale, t.source,
                r.assigned_team, int(r.requires_human_review),
                r.escalation_reason,
                json.dumps([a.model_dump() for a in r.actions]),
                r.draft_response,
            ),
        )


def all_entries() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM audit_log ORDER BY id DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def summary() -> dict:
    """Operations dashboard aggregates: volume, urgency mix, escalations."""
    with _conn() as conn:
        total = conn.execute("SELECT COUNT(*) c FROM audit_log").fetchone()["c"]
        by_type = {
            row["type"]: row["c"]
            for row in conn.execute(
                "SELECT type, COUNT(*) c FROM audit_log GROUP BY type"
            ).fetchall()
        }
        by_urgency = {
            row["urgency"]: row["c"]
            for row in conn.execute(
                "SELECT urgency, COUNT(*) c FROM audit_log GROUP BY urgency"
            ).fetchall()
        }
        pending_human = conn.execute(
            "SELECT COUNT(*) c FROM audit_log WHERE requires_human_review = 1"
        ).fetchone()["c"]
        avg_conf = conn.execute(
            "SELECT AVG(confidence) a FROM audit_log"
        ).fetchone()["a"]
    return {
        "total_processed": total,
        "by_type": by_type,
        "by_urgency": by_urgency,
        "pending_human_review": pending_human,
        "avg_confidence": round(avg_conf, 3) if avg_conf is not None else None,
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


def reset() -> None:
    """Clear the log — used to re-run a clean demo."""
    with _conn() as conn:
        conn.execute("DELETE FROM audit_log")

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

from models import IncomingRequest, ProcessedRequest
import config


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(config.DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


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
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS inbox_requests (
                id           TEXT PRIMARY KEY,
                channel      TEXT NOT NULL,
                member_name  TEXT,
                subject      TEXT NOT NULL,
                body         TEXT NOT NULL,
                source       TEXT NOT NULL DEFAULT 'sample',
                status       TEXT NOT NULL DEFAULT 'queued',
                created_at   TEXT NOT NULL,
                updated_at   TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS cases (
                request_id            TEXT PRIMARY KEY,
                processed_at          TEXT NOT NULL,
                request_json          TEXT NOT NULL,
                type_decision_json    TEXT NOT NULL,
                remediation_json      TEXT NOT NULL,
                type                  TEXT NOT NULL,
                urgency               TEXT NOT NULL,
                confidence            REAL NOT NULL,
                language              TEXT NOT NULL,
                clinical_flag         INTEGER NOT NULL,
                phi_present           INTEGER NOT NULL,
                classifier_source     TEXT NOT NULL,
                assigned_team         TEXT NOT NULL,
                requires_human_review INTEGER NOT NULL,
                escalation_reason     TEXT,
                status                TEXT NOT NULL DEFAULT 'processed',
                updated_at            TEXT NOT NULL,
                FOREIGN KEY(request_id) REFERENCES inbox_requests(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS case_actions (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id   TEXT NOT NULL,
                action_order INTEGER NOT NULL,
                step         TEXT NOT NULL,
                detail       TEXT NOT NULL,
                created_at   TEXT NOT NULL,
                FOREIGN KEY(request_id) REFERENCES cases(request_id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS case_overrides (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                request_id  TEXT NOT NULL,
                action      TEXT NOT NULL,
                note        TEXT,
                created_at  TEXT NOT NULL,
                FOREIGN KEY(request_id) REFERENCES cases(request_id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_audit_request_id ON audit_log(request_id)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cases_type ON cases(type)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cases_urgency ON cases(urgency)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cases_human_review ON cases(requires_human_review)"
        )
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_overrides_request_id ON case_overrides(request_id)"
        )


def seed_inbox(requests: list[IncomingRequest]) -> None:
    """Persist the demo inbox without overwriting processed state."""
    now = _now()
    with _conn() as conn:
        conn.executemany(
            """
            INSERT OR IGNORE INTO inbox_requests (
                id, channel, member_name, subject, body, source, status,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 'sample', 'queued', ?, ?)
            """,
            [
                (
                    r.id,
                    r.channel,
                    r.member_name,
                    r.subject,
                    r.body,
                    now,
                    now,
                )
                for r in requests
            ],
        )


def enqueue_request(request: IncomingRequest, source: str = "factory") -> dict:
    """Add one request to the live inbox without processing it yet."""
    now = _now()
    with _conn() as conn:
        existing = conn.execute(
            "SELECT id FROM inbox_requests WHERE id = ?",
            (request.id,),
        ).fetchone()
        if existing is not None:
            raise ValueError(f"Inbox request already exists: id={request.id}")
        conn.execute(
            """
            INSERT INTO inbox_requests (
                id, channel, member_name, subject, body, source, status,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)
            """,
            (
                request.id,
                request.channel,
                request.member_name,
                request.subject,
                request.body,
                source,
                now,
                now,
            ),
        )
    return {
        "status": "queued",
        "id": request.id,
        "source": source,
        "created_at": now,
    }


def inbox_entries() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT id, channel, member_name, subject, body
            FROM inbox_requests
            WHERE status != 'processed'
            ORDER BY created_at ASC, id ASC
            """
        ).fetchall()
    return [dict(row) for row in rows]


def _upsert_inbox(conn: sqlite3.Connection, request: IncomingRequest, status: str) -> None:
    now = _now()
    conn.execute(
        """
        INSERT INTO inbox_requests (
            id, channel, member_name, subject, body, source, status,
            created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, 'ad_hoc', ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
            channel = excluded.channel,
            member_name = excluded.member_name,
            subject = excluded.subject,
            body = excluded.body,
            status = excluded.status,
            updated_at = excluded.updated_at
        """,
        (
            request.id,
            request.channel,
            request.member_name,
            request.subject,
            request.body,
            status,
            now,
            now,
        ),
    )


def record(pr: ProcessedRequest) -> None:
    t, r, req = pr.type_decision, pr.remediation, pr.request
    with _conn() as conn:
        _upsert_inbox(conn, req, "processed")
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
        conn.execute(
            """
            INSERT INTO cases (
                request_id, processed_at, request_json, type_decision_json,
                remediation_json, type, urgency, confidence, language,
                clinical_flag, phi_present, classifier_source, assigned_team,
                requires_human_review, escalation_reason, status, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'processed', ?)
            ON CONFLICT(request_id) DO UPDATE SET
                processed_at = excluded.processed_at,
                request_json = excluded.request_json,
                type_decision_json = excluded.type_decision_json,
                remediation_json = excluded.remediation_json,
                type = excluded.type,
                urgency = excluded.urgency,
                confidence = excluded.confidence,
                language = excluded.language,
                clinical_flag = excluded.clinical_flag,
                phi_present = excluded.phi_present,
                classifier_source = excluded.classifier_source,
                assigned_team = excluded.assigned_team,
                requires_human_review = excluded.requires_human_review,
                escalation_reason = excluded.escalation_reason,
                status = excluded.status,
                updated_at = excluded.updated_at
            """,
            (
                req.id,
                pr.processed_at,
                json.dumps(req.model_dump()),
                json.dumps(t.model_dump(mode="json")),
                json.dumps(r.model_dump(mode="json")),
                t.type.value,
                t.urgency.value,
                t.confidence,
                t.language.value,
                int(t.clinical_flag),
                int(t.phi_present),
                t.source,
                r.assigned_team,
                int(r.requires_human_review),
                r.escalation_reason,
                _now(),
            ),
        )
        conn.execute("DELETE FROM case_actions WHERE request_id = ?", (req.id,))
        conn.executemany(
            """
            INSERT INTO case_actions (
                request_id, action_order, step, detail, created_at
            ) VALUES (?, ?, ?, ?, ?)
            """,
            [
                (req.id, index, action.step, action.detail, _now())
                for index, action in enumerate(r.actions, start=1)
            ],
        )


def processed_cases() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT request_json, type_decision_json, remediation_json, processed_at
            FROM cases
            ORDER BY processed_at DESC
            """
        ).fetchall()

    cases: list[dict] = []
    for row in rows:
        cases.append(
            ProcessedRequest.model_validate(
                {
                    "request": json.loads(row["request_json"]),
                    "type_decision": json.loads(row["type_decision_json"]),
                    "remediation": json.loads(row["remediation_json"]),
                    "processed_at": row["processed_at"],
                }
            ).model_dump()
        )
    return cases


def record_override(request_id: str, action: str, note: str = "") -> dict:
    now = _now()
    with _conn() as conn:
        existing = conn.execute(
            "SELECT request_id FROM cases WHERE request_id = ?",
            (request_id,),
        ).fetchone()
        if existing is None:
            raise ValueError(f"No processed case found for request_id={request_id}")
        conn.execute(
            """
            INSERT INTO case_overrides (request_id, action, note, created_at)
            VALUES (?, ?, ?, ?)
            """,
            (request_id, action, note, now),
        )
        if action == "send_to_human":
            conn.execute(
                """
                UPDATE cases
                SET requires_human_review = 1,
                    status = 'human_review',
                    updated_at = ?
                WHERE request_id = ?
                """,
                (now, request_id),
            )
        elif action in {"approve", "reassign"}:
            conn.execute(
                """
                UPDATE cases
                SET status = ?, updated_at = ?
                WHERE request_id = ?
                """,
                (action, now, request_id),
            )
    return {
        "status": "recorded",
        "request_id": request_id,
        "action": action,
        "note": note,
        "created_at": now,
    }


def latest_overrides() -> dict[str, str]:
    with _conn() as conn:
        rows = conn.execute(
            """
            SELECT o.request_id, o.action, o.note
            FROM case_overrides o
            JOIN (
                SELECT request_id, MAX(id) latest_id
                FROM case_overrides
                GROUP BY request_id
            ) latest ON latest.latest_id = o.id
            """
        ).fetchall()
    return {
        row["request_id"]: f"{row['action'].replace('_', ' ')}: {row['note'] or 'No note'}"
        for row in rows
    }


def all_entries() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM audit_log ORDER BY id DESC"
        ).fetchall()
    return [dict(row) for row in rows]


def summary() -> dict:
    """Operations dashboard aggregates: volume, urgency mix, escalations."""
    with _conn() as conn:
        total = conn.execute("SELECT COUNT(*) c FROM cases").fetchone()["c"]
        by_type = {
            row["type"]: row["c"]
            for row in conn.execute(
                "SELECT type, COUNT(*) c FROM cases GROUP BY type"
            ).fetchall()
        }
        by_urgency = {
            row["urgency"]: row["c"]
            for row in conn.execute(
                "SELECT urgency, COUNT(*) c FROM cases GROUP BY urgency"
            ).fetchall()
        }
        pending_human = conn.execute(
            "SELECT COUNT(*) c FROM cases WHERE requires_human_review = 1"
        ).fetchone()["c"]
        avg_conf = conn.execute(
            "SELECT AVG(confidence) a FROM cases"
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
    """Clear demo database state — used to re-run a clean demo."""
    with _conn() as conn:
        conn.execute("DELETE FROM case_overrides")
        conn.execute("DELETE FROM case_actions")
        conn.execute("DELETE FROM cases")
        conn.execute("DELETE FROM inbox_requests")
        conn.execute("DELETE FROM audit_log")

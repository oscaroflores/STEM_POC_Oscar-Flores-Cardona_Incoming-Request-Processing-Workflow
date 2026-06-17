"""
Internal PHI masking gateway for Conductor.

This service is intentionally separate from the workflow API. It owns the PHI
vault database, calls AWS Comprehend/Comprehend Medical, and exposes a small
HTTP API used by the rest of the app over Docker networking. Downstream services
receive only tokenized text and mask metadata.
"""

from __future__ import annotations

import json
import os
import sqlite3
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, Field


AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
DB_PATH = os.getenv(
    "CONDUCTOR_PHI_DB_PATH",
    os.path.join(os.path.dirname(__file__), "phi_vault.db"),
)
MASK_MIN_SCORE = float(os.getenv("CONDUCTOR_MASK_MIN_SCORE", "0.5"))

AUTHORIZED_ROLES = {"supervisor", "compliance"}
MASKABLE_PII_TYPES = {
    "NAME": "NAME",
    "ADDRESS": "ADDR",
    "EMAIL": "EMAIL",
    "PHONE": "PHONE",
    "PHONE_OR_FAX": "PHONE",
    "SSN": "ACCT",
    "ID": "ACCT",
    "BANK_ACCOUNT_NUMBER": "ACCT",
    "BANK_ROUTING": "ACCT",
    "CREDIT_DEBIT_NUMBER": "ACCT",
    "CREDIT_DEBIT_CVV": "ACCT",
    "PASSPORT_NUMBER": "ACCT",
    "DRIVER_ID": "ACCT",
    "AGE": "DOB",
}
DATE_TYPES = {"DATE", "DATE_TIME"}
MONEY_TYPES = {"AMOUNT", "QUANTITY"}


app = FastAPI(title="Conductor PHI Masking Gateway", version="1.0.0")


class RawRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    channel: str
    member_name: str | None = None
    subject: str | None = None
    body: str


class MaskRequest(BaseModel):
    request: RawRequest


class ResolveRequest(BaseModel):
    mask_id: str
    token: str | None = None
    actor_role: str = Field(alias="role")
    reason: str = ""


class Span(BaseModel):
    begin: int
    end: int
    kind: str
    score: float
    source: str
    aws_type: str


@dataclass(frozen=True)
class TokenizedField:
    text: str | None
    mappings: list[dict[str, Any]]


def _conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def init_db() -> None:
    with _conn() as conn:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS phi_vault (
                mask_id     TEXT NOT NULL,
                token       TEXT NOT NULL,
                kind        TEXT NOT NULL,
                value       TEXT NOT NULL,
                created_at  TEXT NOT NULL,
                PRIMARY KEY (mask_id, token)
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS phi_access_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                mask_id     TEXT NOT NULL,
                token       TEXT,
                actor_role  TEXT NOT NULL,
                reason      TEXT,
                authorized  INTEGER NOT NULL,
                accessed_at TEXT NOT NULL
            )
            """
        )
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS masking_requests (
                mask_id     TEXT PRIMARY KEY,
                request_id  TEXT NOT NULL,
                channel     TEXT NOT NULL,
                language    TEXT NOT NULL,
                token_count INTEGER NOT NULL,
                kinds_json  TEXT NOT NULL,
                created_at  TEXT NOT NULL
            )
            """
        )
        conn.execute("CREATE INDEX IF NOT EXISTS idx_phi_access_mask_id ON phi_access_log(mask_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_phi_vault_kind ON phi_vault(kind)")


@app.on_event("startup")
def _startup() -> None:
    init_db()


@app.get("/health")
def health() -> dict[str, Any]:
    init_db()
    with _conn() as conn:
        tokens_vaulted = conn.execute("SELECT COUNT(*) c FROM phi_vault").fetchone()["c"]
        requests_masked = conn.execute("SELECT COUNT(*) c FROM masking_requests").fetchone()["c"]
    return {
        "status": "ok",
        "service": "phi_masking_gateway",
        "aws_region": AWS_REGION,
        "min_score": MASK_MIN_SCORE,
        "tokens_vaulted": tokens_vaulted,
        "requests_masked": requests_masked,
    }


@app.post("/mask")
def mask(payload: MaskRequest) -> dict[str, Any]:
    init_db()
    request = payload.request
    mask_id = str(uuid.uuid4())
    language = _detect_language(_language_text(request))
    token_state: dict[str, Any] = {"counts": {}, "by_value": {}}

    member = _mask_known_member_name(request.member_name, token_state)
    subject = _mask_field(request.subject or "", language, token_state)
    body = _mask_field(request.body, language, token_state)
    mappings = member.mappings + subject.mappings + body.mappings
    kinds = _kind_counts(mappings)
    entities = _extract_entities(mappings)

    with _conn() as conn:
        now = _now()
        conn.executemany(
            """
            INSERT OR IGNORE INTO phi_vault (mask_id, token, kind, value, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            [
                (mask_id, item["token"], item["kind"], item["value"], now)
                for item in mappings
            ],
        )
        conn.execute(
            """
            INSERT INTO masking_requests (
                mask_id, request_id, channel, language, token_count, kinds_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                mask_id,
                request.id,
                request.channel,
                language,
                len(mappings),
                json.dumps(kinds, sort_keys=True),
                now,
            ),
        )

    return {
        "mask_id": mask_id,
        "id": request.id,
        "channel": request.channel,
        "member_name": member.text,
        "subject": subject.text,
        "body": body.text,
        "entities": entities,
        "phi": {
            "count": len(mappings),
            "tokens": [item["token"] for item in mappings],
            "kinds": kinds,
        },
        "language": language,
    }


@app.post("/resolve")
def resolve(payload: ResolveRequest) -> dict[str, Any]:
    init_db()
    role = payload.actor_role.lower().strip()
    authorized = role in AUTHORIZED_ROLES
    _record_access(payload.mask_id, payload.token, role, payload.reason, authorized)
    if not authorized:
        return {"authorized": False, "revealed": [] if payload.token is None else None}

    with _conn() as conn:
        if payload.token:
            row = conn.execute(
                """
                SELECT token, kind, value FROM phi_vault
                WHERE mask_id = ? AND token = ?
                """,
                (payload.mask_id, payload.token),
            ).fetchone()
            return {
                "authorized": True,
                "revealed": None if row is None else dict(row),
            }

        rows = conn.execute(
            """
            SELECT token, kind, value FROM phi_vault
            WHERE mask_id = ?
            ORDER BY token ASC
            """,
            (payload.mask_id,),
        ).fetchall()
    return {"authorized": True, "revealed": [dict(row) for row in rows]}


@app.get("/access-log")
def access_log(limit: int = 100) -> list[dict[str, Any]]:
    init_db()
    safe_limit = max(1, min(limit, 500))
    with _conn() as conn:
        rows = conn.execute(
            "SELECT * FROM phi_access_log ORDER BY id DESC LIMIT ?",
            (safe_limit,),
        ).fetchall()
    return [dict(row) for row in rows]


def _language_text(request: RawRequest) -> str:
    return "\n\n".join(
        part for part in [request.member_name, request.subject, request.body] if part
    )


def _detect_language(text: str) -> str:
    if not text.strip():
        return "en"
    import boto3
    from botocore.config import Config as BotoConfig

    client = boto3.client(
        "comprehend",
        region_name=AWS_REGION,
        config=BotoConfig(retries={"max_attempts": 1}),
    )
    response = client.detect_dominant_language(Text=text[:5000])
    languages = response.get("Languages", [])
    if not languages:
        raise HTTPException(status_code=502, detail="AWS Comprehend returned no language result")
    code = str(languages[0].get("LanguageCode", "en")).lower()
    return "es" if code.startswith("es") else "en"


def _mask_known_member_name(member_name: str | None, token_state: dict[str, Any]) -> TokenizedField:
    if not member_name:
        return TokenizedField(text=member_name, mappings=[])
    token = _token_for("NAME", member_name, token_state)
    return TokenizedField(
        text=token,
        mappings=[
            {
                "token": token,
                "kind": "NAME",
                "value": member_name,
                "source": "schema:member_name",
                "aws_type": "NAME",
            }
        ],
    )


def _mask_field(text: str | None, language: str, token_state: dict[str, Any]) -> TokenizedField:
    if text is None:
        return TokenizedField(text=None, mappings=[])
    if not text.strip():
        return TokenizedField(text=text, mappings=[])

    spans = _merged_spans(_detect_spans(text, language))
    if not spans:
        return TokenizedField(text=text, mappings=[])

    masked = text
    mappings: list[dict[str, Any]] = []
    for span in sorted(spans, key=lambda item: item.begin, reverse=True):
        value = masked[span.begin:span.end]
        token = _token_for(span.kind, value, token_state)
        masked = f"{masked[:span.begin]}{token}{masked[span.end:]}"
        mappings.append(
            {
                "token": token,
                "kind": span.kind,
                "value": value,
                "source": span.source,
                "aws_type": span.aws_type,
            }
        )

    mappings.reverse()
    return TokenizedField(text=masked, mappings=mappings)


def _detect_spans(text: str, language: str) -> list[Span]:
    spans = _detect_pii_spans(text, language)
    if language == "en":
        spans.extend(_detect_phi_spans(text))
    return spans


def _detect_pii_spans(text: str, language: str) -> list[Span]:
    import boto3
    from botocore.config import Config as BotoConfig

    client = boto3.client(
        "comprehend",
        region_name=AWS_REGION,
        config=BotoConfig(retries={"max_attempts": 1}),
    )
    response = client.detect_pii_entities(Text=text, LanguageCode=language)
    spans: list[Span] = []
    for entity in response.get("Entities", []):
        span = _span_from_entity(entity, source="comprehend_pii")
        if span:
            spans.append(span)
    return spans


def _detect_phi_spans(text: str) -> list[Span]:
    import boto3
    from botocore.config import Config as BotoConfig

    client = boto3.client(
        "comprehendmedical",
        region_name=AWS_REGION,
        config=BotoConfig(retries={"max_attempts": 1}),
    )
    response = client.detect_phi(Text=text)
    spans: list[Span] = []
    for entity in response.get("Entities", []):
        span = _span_from_entity(entity, source="comprehend_medical_phi")
        if span:
            spans.append(span)
    return spans


def _span_from_entity(entity: dict[str, Any], source: str) -> Span | None:
    score = float(entity.get("Score", 0.0))
    if score < MASK_MIN_SCORE:
        return None

    aws_type = str(entity.get("Type") or entity.get("Category") or "").upper()
    kind = _kind_for_type(aws_type, entity)
    if kind is None:
        return None
    return Span(
        begin=int(entity["BeginOffset"]),
        end=int(entity["EndOffset"]),
        kind=kind,
        score=score,
        source=source,
        aws_type=aws_type,
    )


def _kind_for_type(aws_type: str, entity: dict[str, Any]) -> str | None:
    if aws_type in MONEY_TYPES:
        return None
    if aws_type in DATE_TYPES:
        return "DOB" if _looks_like_dob(entity) else None
    return MASKABLE_PII_TYPES.get(aws_type)


def _looks_like_dob(entity: dict[str, Any]) -> bool:
    text = str(entity.get("Text", "")).lower()
    return any(marker in text for marker in ["dob", "date of birth", "birth", "nacimiento"])


def _merged_spans(spans: list[Span]) -> list[Span]:
    valid = sorted(
        (span for span in spans if span.end > span.begin),
        key=lambda item: (item.begin, item.end),
    )
    if not valid:
        return []

    merged: list[Span] = [valid[0]]
    for span in valid[1:]:
        current = merged[-1]
        if span.begin <= current.end:
            merged[-1] = Span(
                begin=current.begin,
                end=max(current.end, span.end),
                kind=_merge_kind(current.kind, span.kind),
                score=max(current.score, span.score),
                source=f"{current.source}+{span.source}" if span.source not in current.source else current.source,
                aws_type=current.aws_type if current.score >= span.score else span.aws_type,
            )
        else:
            merged.append(span)
    return merged


def _merge_kind(left: str, right: str) -> str:
    priority = ["ACCT", "NAME", "DOB", "EMAIL", "PHONE", "ADDR"]
    for kind in priority:
        if kind in {left, right}:
            return kind
    return left


def _token_for(kind: str, value: str, token_state: dict[str, Any]) -> str:
    key = f"{kind}\u241f{value.strip().lower()}"
    by_value: dict[str, str] = token_state["by_value"]
    if key in by_value:
        return by_value[key]

    counts: dict[str, int] = token_state["counts"]
    counts[kind] = counts.get(kind, 0) + 1
    token = f"[{kind}-{counts[kind]}]"
    by_value[key] = token
    return token


def _kind_counts(mappings: list[dict[str, Any]]) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in mappings:
        kind = str(item["kind"])
        counts[kind] = counts.get(kind, 0) + 1
    return counts


def _extract_entities(mappings: list[dict[str, Any]]) -> dict[str, Any]:
    acct_tokens = [item["token"] for item in mappings if item["kind"] == "ACCT"]
    entities: dict[str, Any] = {}
    if acct_tokens:
        entities["account_ref_token"] = acct_tokens[0]
        entities["account_tokens"] = acct_tokens
    return entities


def _record_access(
    mask_id: str,
    token: str | None,
    actor_role: str,
    reason: str,
    authorized: bool,
) -> None:
    with _conn() as conn:
        conn.execute(
            """
            INSERT INTO phi_access_log (
                mask_id, token, actor_role, reason, authorized, accessed_at
            ) VALUES (?, ?, ?, ?, ?, ?)
            """,
            (mask_id, token, actor_role, reason, int(authorized), _now()),
        )

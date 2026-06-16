"""
Conductor API — FastAPI backend for the autonomous AI intake manager.

Endpoints
  GET  /health                 - liveness + active classifier mode
  GET  /api/inbox              - the seeded sample inbox (mixed ES/EN requests)
  POST /api/inbox              - enqueue one request for later processing
  POST /api/process            - process one ad-hoc request, return full result
  GET  /api/process-stream     - SSE: drain the inbox one-by-one, live
  GET  /api/cases              - persisted processed case records
  GET  /api/overrides          - latest supervisor override note per case
  GET  /api/dashboard          - operations summary aggregates
  GET  /api/audit              - full audit trail (most recent first)
  POST /api/override           - management override of a processed case
  POST /api/reset              - reset demo database state and reseed inbox

The SSE stream is what makes the demo feel like an agent at work: the queue
drains in real time and the dashboard ticks up as each case is decided.
"""

import json
import asyncio

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from models import IncomingRequest
import orchestrator
import audit
import config
import masking_client

app = FastAPI(title="Conductor — AI Intake Manager", version="1.0.0")

# Next.js dev server runs on a different port; allow it in the demo.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup() -> None:
    audit.init_db()
    if audit.inbox_total_count() == 0:
        audit.seed_inbox(_mask_all(_load_sample_inbox()))


def _load_sample_inbox() -> list[IncomingRequest]:
    with open(config.SAMPLE_DATA_PATH, encoding="utf-8") as fh:
        return [IncomingRequest(**item) for item in json.load(fh)]


def _load_inbox() -> list[IncomingRequest]:
    rows = audit.inbox_entries()
    if not rows and audit.inbox_total_count() == 0:
        audit.seed_inbox(_mask_all(_load_sample_inbox()))
        rows = audit.inbox_entries()
    return [IncomingRequest(**item) for item in rows]


def _mask_or_503(request: IncomingRequest) -> IncomingRequest:
    try:
        return masking_client.mask_request(request)
    except masking_client.MaskingServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def _mask_all(requests: list[IncomingRequest]) -> list[IncomingRequest]:
    return [_mask_or_503(request) for request in requests]


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "classifier_mode": "bedrock_ai_only",
        "model_id": config.BEDROCK_MODEL_ID,
        "confidence_threshold": config.CONFIDENCE_THRESHOLD,
    }


@app.get("/api/inbox")
def inbox(role: str = "agent") -> list[dict]:
    return [r.model_dump() for r in _load_inbox()]


@app.post("/api/inbox", status_code=201)
def enqueue_inbox(request: IncomingRequest) -> dict:
    """Queue one generated/manual request without processing it immediately."""
    try:
        return audit.enqueue_request(_mask_or_503(request))
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.get("/api/cases")
def cases(role: str = "agent") -> list[dict]:
    return audit.processed_cases()


@app.get("/api/overrides")
def overrides(role: str = "agent") -> dict[str, str]:
    return audit.latest_overrides()


@app.post("/api/process")
def process(request: IncomingRequest) -> dict:
    """Process a single ad-hoc request (e.g. typed live into the UI)."""
    return orchestrator.process_one(_mask_or_503(request)).model_dump()


@app.get("/api/process-stream")
async def process_stream(role: str = "agent") -> StreamingResponse:
    """Autonomously drain the seeded inbox, emitting one SSE event per request."""

    async def event_gen():
        requests = _load_inbox()
        total = len(requests)
        for idx, req in enumerate(requests, start=1):
            # Run the (sync) processing off the event loop.
            processed = await asyncio.to_thread(orchestrator.process_one, req)
            payload = {
                "index": idx,
                "total": total,
                "result": processed.model_dump(),
                "dashboard": audit.summary(),
            }
            yield f"data: {json.dumps(payload)}\n\n"
            if config.PROCESS_DELAY_SECONDS:
                await asyncio.sleep(config.PROCESS_DELAY_SECONDS)
        yield f"data: {json.dumps({'done': True})}\n\n"

    return StreamingResponse(event_gen(), media_type="text/event-stream")


@app.get("/api/dashboard")
def dashboard(role: str = "agent") -> dict:
    return audit.summary()


@app.get("/api/audit")
def audit_trail(role: str = "agent") -> list[dict]:
    return audit.all_entries()


@app.get("/api/masking/health")
def masking_health() -> dict:
    try:
        return masking_client.health()
    except masking_client.MaskingServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


class MaskingResolve(BaseModel):
    mask_id: str
    token: str | None = None
    role: str = "agent"
    reason: str = ""


@app.post("/api/masking/resolve")
def masking_resolve(payload: MaskingResolve) -> dict:
    try:
        return masking_client.resolve(
            mask_id=payload.mask_id,
            token=payload.token,
            role=payload.role,
            reason=payload.reason,
        )
    except masking_client.MaskingServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.post("/api/reveal")
def reveal(payload: MaskingResolve) -> dict:
    return masking_resolve(payload)


@app.get("/api/phi-access-log")
def phi_access_log(role: str = "agent") -> list[dict]:
    try:
        return masking_client.access_log()
    except masking_client.MaskingServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


class Override(BaseModel):
    request_id: str
    action: str          # e.g. "reassign", "approve", "send_to_human"
    note: str = ""


@app.post("/api/override")
def override(o: Override) -> dict:
    """Management override hook. Recorded as a note; in production this would
    update the case and re-route. Demonstrates human control over the agent."""
    try:
        return audit.record_override(o.request_id, o.action, o.note)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/api/reset")
def reset() -> dict:
    audit.reset()
    audit.seed_inbox(_mask_all(_load_sample_inbox()))
    return {"status": "database reset and sample inbox reseeded"}

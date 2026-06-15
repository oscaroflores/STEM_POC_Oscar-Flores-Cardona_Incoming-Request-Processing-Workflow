"""
Conductor API — FastAPI backend for the autonomous AI intake manager.

Endpoints
  GET  /health                 - liveness + active classifier mode
  GET  /api/inbox              - the seeded sample inbox (mixed ES/EN requests)
  POST /api/process            - process one ad-hoc request, return full result
  GET  /api/process-stream     - SSE: drain the inbox one-by-one, live
  GET  /api/dashboard          - operations summary aggregates
  GET  /api/audit              - full audit trail (most recent first)
  POST /api/override           - management override of a processed case
  POST /api/reset              - clear the audit log for a clean demo

The SSE stream is what makes the demo feel like an agent at work: the queue
drains in real time and the dashboard ticks up as each case is decided.
"""

import json
import asyncio

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from models import IncomingRequest
import orchestrator
import audit
import config

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


def _load_inbox() -> list[IncomingRequest]:
    with open(config.SAMPLE_DATA_PATH, encoding="utf-8") as fh:
        return [IncomingRequest(**item) for item in json.load(fh)]


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "classifier_mode": "bedrock_ai_only",
        "model_id": config.BEDROCK_MODEL_ID,
        "confidence_threshold": config.CONFIDENCE_THRESHOLD,
    }


@app.get("/api/inbox")
def inbox() -> list[dict]:
    return [r.model_dump() for r in _load_inbox()]


@app.post("/api/process")
def process(request: IncomingRequest) -> dict:
    """Process a single ad-hoc request (e.g. typed live into the UI)."""
    return orchestrator.process_one(request).model_dump()


@app.get("/api/process-stream")
async def process_stream() -> StreamingResponse:
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
def dashboard() -> dict:
    return audit.summary()


@app.get("/api/audit")
def audit_trail() -> list[dict]:
    return audit.all_entries()


class Override(BaseModel):
    request_id: str
    action: str          # e.g. "reassign", "approve", "send_to_human"
    note: str = ""


@app.post("/api/override")
def override(o: Override) -> dict:
    """Management override hook. Recorded as a note; in production this would
    update the case and re-route. Demonstrates human control over the agent."""
    return {
        "status": "recorded",
        "request_id": o.request_id,
        "action": o.action,
        "note": o.note,
    }


@app.post("/api/reset")
def reset() -> dict:
    audit.reset()
    return {"status": "audit log cleared"}

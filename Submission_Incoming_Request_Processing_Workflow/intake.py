"""Single approved raw-request intake boundary for Conductor.

All new channels should enter through this module or the public FastAPI intake
routes. Anything below this layer (`audit`, `orchestrator`, classifier, SSE)
expects a `MaskedIncomingRequest` and fails closed if raw text reaches it.
"""

from __future__ import annotations

from models import MaskedIncomingRequest, ProcessedRequest, RawIncomingRequest
import audit
import masking_client
import orchestrator


def mask_raw_request(request: RawIncomingRequest) -> MaskedIncomingRequest:
    return masking_client.mask_request(request)


def mask_raw_requests(requests: list[RawIncomingRequest]) -> list[MaskedIncomingRequest]:
    return [mask_raw_request(request) for request in requests]


def seed_raw_requests(requests: list[RawIncomingRequest]) -> None:
    audit.seed_inbox(mask_raw_requests(requests))


def enqueue_raw_request(request: RawIncomingRequest, source: str = "factory") -> dict:
    return audit.enqueue_request(mask_raw_request(request), source=source)


def process_raw_request(request: RawIncomingRequest) -> ProcessedRequest:
    return orchestrator.process_one(mask_raw_request(request))

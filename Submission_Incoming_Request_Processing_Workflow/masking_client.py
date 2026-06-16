"""HTTP client for the internal PHI masking gateway."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from models import IncomingRequest
import config


class MaskingServiceError(RuntimeError):
    pass


def _request_json(path: str, payload: dict[str, Any] | None = None, method: str = "GET") -> Any:
    data = None if payload is None else json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        f"{config.PHI_MASKING_SERVICE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=config.MASKING_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise MaskingServiceError(f"PHI masking service returned {exc.code}: {detail}") from exc
    except Exception as exc:
        raise MaskingServiceError(f"PHI masking service unavailable: {exc}") from exc


def mask_request(request: IncomingRequest) -> IncomingRequest:
    """Fail-closed tokenization chokepoint for raw intake."""
    if request.mask_id:
        return request
    data = _request_json("/mask", {"request": request.model_dump()}, method="POST")
    return IncomingRequest(
        id=request.id,
        channel=str(data["channel"]),
        mask_id=str(data["mask_id"]),
        member_name=data.get("member_name"),
        subject=str(data["subject"] or ""),
        body=str(data["body"]),
        entities=data.get("entities") or {},
        phi=data.get("phi") or {"count": 0, "tokens": [], "kinds": {}},
    )


def health() -> dict[str, Any]:
    return _request_json("/health")


def resolve(mask_id: str, role: str, reason: str, token: str | None = None) -> dict[str, Any]:
    payload = {"mask_id": mask_id, "role": role, "reason": reason}
    if token:
        payload["token"] = token
    return _request_json("/resolve", payload, method="POST")


def access_log() -> list[dict[str, Any]]:
    return _request_json("/access-log")

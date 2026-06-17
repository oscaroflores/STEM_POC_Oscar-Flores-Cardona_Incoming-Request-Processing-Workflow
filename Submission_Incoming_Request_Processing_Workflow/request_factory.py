"""
Request Factory - opt-in synthetic inbox generator.

The factory is a separate worker process. It chooses the request category,
language, and inbound channel with a seeded RNG, asks Bedrock to write a
realistic synthetic member request for those attributes, then queues it through
the Conductor API. It never writes SQLite directly, so the FastAPI service
remains the single database owner.
"""

import json
import os
import random
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any

from botocore.config import Config as BotoConfig
import boto3

import config
from models import RawIncomingRequest, RequestType


DEFAULT_CATEGORY_WEIGHTS = {
    RequestType.COMPLAINT.value: 2.0,
    RequestType.BENEFITS_ENQUIRY.value: 3.0,
    RequestType.SERVICE_REQUEST.value: 3.0,
    RequestType.BILLING_DISPUTE.value: 2.0,
    RequestType.CLINICAL_URGENT.value: 1.0,
}

DEFAULT_LANGUAGE_WEIGHTS = {
    "en": 1.0,
    "es": 1.0,
}

DEFAULT_CHANNEL_WEIGHTS = {
    "email": 2.0,
    "inbox": 2.0,
    "web_form": 1.0,
}

CATEGORY_GUIDANCE = {
    RequestType.COMPLAINT.value: (
        "A dissatisfied member is upset about contact center service, delays, "
        "dropped calls, unresolved prior requests, or poor follow-up."
    ),
    RequestType.BENEFITS_ENQUIRY.value: (
        "A member asks a benefits or eligibility question about coverage, plan "
        "limits, pharmacy benefits, referrals, network status, or covered services."
    ),
    RequestType.SERVICE_REQUEST.value: (
        "A member needs operational help such as scheduling, rescheduling, "
        "replacement ID cards, records, forms, transportation, or service coordination."
    ),
    RequestType.BILLING_DISPUTE.value: (
        "A member disputes a charge, copay, statement, refund, duplicate payment, "
        "or claims/billing issue."
    ),
    RequestType.CLINICAL_URGENT.value: (
        "A member describes symptoms, medication side effects, injury, or a possible "
        "medical concern that should be routed to a human. Do not provide advice."
    ),
}

SYSTEM_PROMPT = """You generate synthetic inbound requests for Conductor, an AI intake
manager proof of concept for a healthcare contact center in Puerto Rico.

Return ONLY a JSON object, no prose, no markdown, with exactly these keys:
{
  "channel": one of ["email", "web_form", "inbox"],
  "member_name": fictional full name or null,
  "subject": concise inbox subject,
  "body": realistic member message
}

Rules:
- Use only synthetic fictional data. Never include real people, real addresses,
  Social Security numbers, full dates of birth, or proprietary data.
- Match the requested category and language exactly.
- Match the requested inbound channel exactly.
- Keep the body between 35 and 95 words.
- Healthcare-safe: do not give medical advice, diagnosis, or treatment.
- Spanish requests should sound natural for Puerto Rico without stereotypes.
- It is acceptable to include fake account/reference numbers when useful.
"""


def _env_float(name: str, default: float) -> float:
    raw = os.getenv(name)
    return default if raw is None or raw == "" else float(raw)


def _env_optional_float(name: str) -> float | None:
    raw = os.getenv(name)
    return None if raw is None or raw == "" else float(raw)


def _env_int(name: str, default: int) -> int:
    raw = os.getenv(name)
    return default if raw is None or raw == "" else int(raw)


def _parse_weights(raw: str | None, defaults: dict[str, float]) -> dict[str, float]:
    if not raw:
        return defaults

    weights = defaults.copy()
    for item in raw.split(","):
        piece = item.strip()
        if not piece:
            continue
        if "=" in piece:
            key, value = piece.split("=", 1)
        elif ":" in piece:
            key, value = piece.split(":", 1)
        else:
            raise ValueError(f"Invalid weight entry: {piece}")
        key = key.strip()
        if key not in weights:
            raise ValueError(f"Unknown weight key: {key}")
        weights[key] = float(value)

    if sum(weights.values()) <= 0:
        raise ValueError("At least one factory weight must be greater than zero")
    return weights


def _weighted_choice(rng: random.Random, weights: dict[str, float]) -> str:
    keys = list(weights.keys())
    values = list(weights.values())
    return rng.choices(keys, weights=values, k=1)[0]


def _extract_json(raw: str) -> dict[str, Any]:
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValueError(f"Model did not return JSON: {raw[:200]}")
    data = json.loads(match.group(0))
    if not isinstance(data, dict):
        raise ValueError("Model JSON output must be an object")
    return data


def _client():
    return boto3.client(
        "bedrock-runtime",
        region_name=config.AWS_REGION,
        config=BotoConfig(
            read_timeout=_env_float("REQUEST_FACTORY_LLM_TIMEOUT", config.BEDROCK_TIMEOUT_SECONDS),
            retries={"max_attempts": 1},
        ),
    )


def _generate_request(
    client,
    model_id: str,
    category: str,
    language: str,
    channel: str,
    variation_seed: int,
    request_id: str,
) -> RawIncomingRequest:
    prompt = f"""Generate one synthetic inbound request.

Category: {category}
Language: {language}
Inbound channel: {channel}
Category guidance: {CATEGORY_GUIDANCE[category]}
Variation seed: {variation_seed}

The generated request id will be {request_id}; do not include it in the JSON.
"""
    resp = client.converse(
        modelId=model_id,
        system=[{"text": SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": [{"text": prompt}]}],
        inferenceConfig={"maxTokens": 500, "temperature": 0.8, "topP": 0.9},
    )
    raw = resp["output"]["message"]["content"][0]["text"]
    data = _extract_json(raw)
    return RawIncomingRequest(
        id=request_id,
        channel=channel,
        member_name=data.get("member_name"),
        subject=str(data["subject"]),
        body=str(data["body"]),
    )


def _post_request(api_base_url: str, request: RawIncomingRequest) -> dict:
    payload = json.dumps(request.model_dump()).encode("utf-8")
    http_request = urllib.request.Request(
        f"{api_base_url.rstrip('/')}/api/inbox",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(http_request, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def _factory_id(counter: int) -> str:
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d%H%M%S")
    return f"FACT-{stamp}-{counter:04d}"


def main() -> None:
    api_base_url = os.getenv("CONDUCTOR_API_BASE_URL", "http://localhost:8000")
    model_id = (
        os.getenv("REQUEST_FACTORY_MODEL_ID")
        or os.getenv("CONDUCTOR_FACTORY_MODEL_ID")
        or os.getenv("CONDUCTOR_MODEL_ID")
        or config.BEDROCK_MODEL_ID
    )
    fixed_interval_seconds = _env_optional_float("REQUEST_FACTORY_INTERVAL_SECONDS")
    min_interval_seconds = _env_float("REQUEST_FACTORY_MIN_INTERVAL_SECONDS", 4.0)
    max_interval_seconds = _env_float("REQUEST_FACTORY_MAX_INTERVAL_SECONDS", 20.0)
    if min_interval_seconds < 0 or max_interval_seconds < 0:
        raise ValueError("Factory interval values must be zero or greater")
    if max_interval_seconds < min_interval_seconds:
        raise ValueError("REQUEST_FACTORY_MAX_INTERVAL_SECONDS must be >= REQUEST_FACTORY_MIN_INTERVAL_SECONDS")
    max_requests = _env_int("REQUEST_FACTORY_MAX_REQUESTS", 12)
    seed = _env_int("REQUEST_FACTORY_SEED", 20260616)
    category_weights = _parse_weights(
        os.getenv("REQUEST_FACTORY_CATEGORY_WEIGHTS"),
        DEFAULT_CATEGORY_WEIGHTS,
    )
    language_weights = _parse_weights(
        os.getenv("REQUEST_FACTORY_LANGUAGE_WEIGHTS"),
        DEFAULT_LANGUAGE_WEIGHTS,
    )
    channel_weights = _parse_weights(
        os.getenv("REQUEST_FACTORY_CHANNEL_WEIGHTS"),
        DEFAULT_CHANNEL_WEIGHTS,
    )

    rng = random.Random(seed)
    client = _client()
    counter = 0

    print(
        "request_factory started "
        f"api={api_base_url} model={model_id} seed={seed} max_requests={max_requests} "
        f"fixed_interval={fixed_interval_seconds} "
        f"random_interval_range={min_interval_seconds}-{max_interval_seconds}",
        flush=True,
    )

    while max_requests == 0 or counter < max_requests:
        counter += 1
        category = _weighted_choice(rng, category_weights)
        language = _weighted_choice(rng, language_weights)
        channel = _weighted_choice(rng, channel_weights)
        variation_seed = rng.randint(1, 999_999)
        request_id = _factory_id(counter)

        try:
            request = _generate_request(
                client=client,
                model_id=model_id,
                category=category,
                language=language,
                channel=channel,
                variation_seed=variation_seed,
                request_id=request_id,
            )
            result = _post_request(api_base_url, request)
            print(
                f"queued {request.id} category={category} language={language} channel={channel} "
                f"mask_id={result.get('mask_id', 'pending')} result={result['status']}",
                flush=True,
            )
        except Exception as exc:
            print(f"request_factory error request_id={request_id}: {exc}", flush=True)

        if max_requests == 0 or counter < max_requests:
            delay = (
                fixed_interval_seconds
                if fixed_interval_seconds is not None
                else rng.uniform(min_interval_seconds, max_interval_seconds)
            )
            if delay > 0:
                print(f"waiting {delay:.1f}s before next generated request", flush=True)
                time.sleep(delay)

    print("request_factory finished", flush=True)


if __name__ == "__main__":
    main()

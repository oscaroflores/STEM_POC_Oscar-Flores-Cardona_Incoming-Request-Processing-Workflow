"""
Classification — the one place the AI manager "reasons."

The classifier is AI-only: Bedrock reads each inbound request and emits a
structured `TypeDecision`. Downstream remediation stays deterministic and
auditable, but request type and urgency classification are never replaced with
keyword heuristics.
"""

import json
import re

from models import TypeDecision, RequestType, Urgency, Language
import config

_SYSTEM_PROMPT = """You are the triage classifier for a healthcare contact \
center in Puerto Rico. Members write in Spanish or English. Classify the \
incoming request. You ONLY classify — you never write a reply and never give \
medical advice.

The request text has already passed through an internal PHI masking gateway. \
Names, account numbers, emails, phones, addresses, and clinical identifiers may \
appear as tokens such as [NAME-1] or [ACCT-1]. Treat those tokens as references \
for routing only. Do not infer or invent original personal data.

Return ONLY a JSON object, no prose, with exactly these keys:
{
  "type": one of ["complaint","benefits_enquiry","service_request","billing_dispute","clinical_urgent"],
  "urgency": one of ["low","medium","high","critical"],
  "confidence": number between 0 and 1,
  "language": "es" or "en",
  "clinical_flag": true if the message mentions symptoms, medications, injuries, \
or anything needing clinical decision-making,
  "phi_present": true if it contains personal health information,
  "rationale": one short sentence explaining the classification,
  "key_entities": object with any masked account tokens, amounts, or dates found
}

If the message describes symptoms or a possible medical emergency, set \
type="clinical_urgent", urgency="critical", and clinical_flag=true."""


def classify_bedrock(text: str) -> TypeDecision:
    """Live classification via Bedrock using model-agnostic structured output."""
    import boto3
    from botocore.config import Config as BotoConfig

    client = boto3.client(
        "bedrock-runtime",
        region_name=config.AWS_REGION,
        config=BotoConfig(
            read_timeout=config.BEDROCK_TIMEOUT_SECONDS,
            retries={"max_attempts": 1},
        ),
    )

    resp = client.converse(
        modelId=config.BEDROCK_MODEL_ID,
        system=[{"text": _SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": [{"text": text}]}],
        inferenceConfig={"maxTokens": 400, "temperature": 0.0},
    )

    raw = resp["output"]["message"]["content"][0]["text"]
    # Strip any stray fences / prose; isolate the JSON object.
    match = re.search(r"\{.*\}", raw, re.DOTALL)
    if not match:
        raise ValueError(f"Model did not return JSON: {raw[:200]}")
    data = json.loads(match.group(0))

    return TypeDecision(
        type=RequestType(data["type"]),
        urgency=Urgency(data["urgency"]),
        confidence=float(data["confidence"]),
        language=Language(data.get("language", "en")),
        clinical_flag=bool(data.get("clinical_flag", False)),
        phi_present=bool(data.get("phi_present", False)),
        rationale=str(data.get("rationale", "")),
        key_entities=data.get("key_entities", {}) or {},
        source=f"bedrock:{config.BEDROCK_MODEL_ID}",
    )


def classify(text: str) -> TypeDecision:
    """Public entry point. Runs AI classification and lets failures surface."""
    return classify_bedrock(text)

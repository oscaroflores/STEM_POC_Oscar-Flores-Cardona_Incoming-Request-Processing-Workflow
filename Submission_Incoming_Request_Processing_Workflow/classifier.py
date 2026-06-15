"""
Classification — the one place the AI manager "reasons."

AI is the primary, intended classifier (the brief requires AI to classify each
request). Two implementations sit behind ONE `Judgment` contract:

  * classify_bedrock()       - live LLM via boto3 Bedrock, structured JSON. PRIMARY.
  * classify_deterministic() - keyword + heuristic rules. RESILIENCE FALLBACK only.

`classify()` runs the live model by default and falls back to the rule layer
ONLY if the model errors or times out — so the workflow keeps moving in a
healthcare setting even during a model outage. The fallback is a business-
continuity safeguard, not the normal path; every fallback is flagged in the
judgment's rationale so it is visible in the audit trail.
"""

import json
import re

from .models import Judgment, RequestType, Urgency, Language
from . import config


# --------------------------------------------------------------------------- #
# Deterministic classifier (RESILIENCE FALLBACK — fires only if the model fails)
# --------------------------------------------------------------------------- #

# Bilingual keyword signals per branch. Spanish and English are both first-class
# because TeleMedik's member base is largely Spanish-speaking in Puerto Rico.
_CLINICAL_SIGNALS = [
    # english
    "chest pain", "can't breathe", "cant breathe", "shortness of breath",
    "bleeding", "suicidal", "overdose", "allergic reaction", "symptom",
    "fever", "dizzy", "faint", "side effect", "dosage", "prescription",
    "emergency", "severe pain",
    # spanish
    "dolor en el pecho", "dolor de pecho", "no puedo respirar", "sangrado",
    "sangre", "suicid", "sobredosis", "reacción alérgica", "reaccion alergica",
    "síntoma", "sintoma", "fiebre", "mareo", "desmayo", "efecto secundario",
    "dosis", "receta", "emergencia", "dolor fuerte", "me duele",
]

_BRANCH_SIGNALS: dict[RequestType, list[str]] = {
    RequestType.COMPLAINT: [
        "complaint", "unacceptable", "terrible", "rude", "worst", "furious",
        "disappointed", "never again", "report you", "demand",
        "queja", "inaceptable", "pésimo", "pesimo", "grosero", "indignado",
        "molesto", "decepcionado", "exijo", "reclamo", "maltrato",
    ],
    RequestType.BILLING_DISPUTE: [
        "bill", "charge", "charged", "invoice", "payment", "refund", "copay",
        "overcharged", "statement", "premium",
        "factura", "cobro", "cobraron", "pago", "reembolso", "copago",
        "cobro indebido", "estado de cuenta", "prima", "me cobraron",
    ],
    RequestType.SERVICE_REQUEST: [
        "appointment", "schedule", "reschedule", "referral", "authorization",
        "book", "cancel my appointment", "id card", "new card",
        "cita", "agendar", "reagendar", "referido", "autorización",
        "autorizacion", "tarjeta", "renovar", "solicito", "necesito una cita",
    ],
    RequestType.BENEFITS_ENQUIRY: [
        "covered", "coverage", "benefit", "eligible", "eligibility", "plan",
        "deductible", "network", "in-network", "does my plan",
        "cubre", "cubierto", "cobertura", "beneficio", "elegible",
        "elegibilidad", "deducible", "red", "mi plan", "incluye",
    ],
}

_URGENCY_SIGNALS = [
    "urgent", "asap", "immediately", "right now", "emergency",
    "urgente", "de inmediato", "ahora mismo", "cuanto antes", "emergencia",
]


def _detect_language(text: str) -> Language:
    """Lightweight ES/EN heuristic via common-word frequency."""
    t = f" {text.lower()} "
    es_markers = [" el ", " la ", " los ", " las ", " que ", " de ", " mi ",
                  " no ", " por ", " para ", " con ", " una ", " está ",
                  " esta ", " pero ", " porque ", " cita ", " factura ",
                  " ñ", "í", "ó", "á", "é", "ú"]
    en_markers = [" the ", " and ", " my ", " is ", " to ", " for ", " with ",
                  " your ", " was ", " but ", " because ", " appointment ",
                  " bill ", " charged ", " please "]
    es = sum(t.count(m) for m in es_markers)
    en = sum(t.count(m) for m in en_markers)
    return Language.ES if es >= en else Language.EN


def _extract_entities(text: str) -> dict:
    """Pull obvious structured references for the audit trail and handoff."""
    entities: dict = {}
    acct = re.search(r"\b(?:acct|account|cuenta|member id|id)\D{0,5}(\d{5,})",
                     text, re.IGNORECASE)
    if acct:
        entities["account_ref"] = acct.group(1)
    amount = re.search(r"\$\s?\d[\d,]*(?:\.\d{2})?", text)
    if amount:
        entities["amount"] = amount.group(0).replace(" ", "")
    return entities


def classify_deterministic(text: str) -> Judgment:
    low = text.lower()
    language = _detect_language(text)

    clinical = any(sig in low for sig in _CLINICAL_SIGNALS)

    # Score each branch by keyword hits.
    scores: dict[RequestType, int] = {}
    for branch, signals in _BRANCH_SIGNALS.items():
        scores[branch] = sum(1 for s in signals if s in low)

    if clinical:
        req_type = RequestType.CLINICAL_URGENT
        urgency = Urgency.CRITICAL
        top_score = 1
    else:
        req_type = max(scores, key=scores.get)
        top_score = scores[req_type]
        if top_score == 0:
            # No clear signal -> default to a low-confidence benefits enquiry,
            # which the confidence gate will push to human review.
            req_type = RequestType.BENEFITS_ENQUIRY

    # Urgency mapping.
    if clinical:
        urgency = Urgency.CRITICAL
    elif any(sig in low for sig in _URGENCY_SIGNALS):
        urgency = Urgency.HIGH
    else:
        urgency = {
            RequestType.COMPLAINT: Urgency.HIGH,
            RequestType.BILLING_DISPUTE: Urgency.MEDIUM,
            RequestType.SERVICE_REQUEST: Urgency.MEDIUM,
            RequestType.BENEFITS_ENQUIRY: Urgency.LOW,
            RequestType.CLINICAL_URGENT: Urgency.CRITICAL,
        }[req_type]

    # Confidence: more keyword hits -> more confident, capped. No signal -> low.
    if clinical:
        confidence = 0.95
    elif top_score == 0:
        confidence = 0.45
    else:
        confidence = min(0.6 + 0.12 * top_score, 0.97)

    return Judgment(
        type=req_type,
        urgency=urgency,
        confidence=round(confidence, 2),
        language=language,
        clinical_flag=clinical,
        phi_present=clinical,
        rationale=(
            f"Matched {top_score} keyword signal(s) for '{req_type.value}'"
            + ("; clinical content detected" if clinical else "")
            + f"; language detected as {language.value}."
        ),
        key_entities=_extract_entities(text),
        source="deterministic",
    )


# --------------------------------------------------------------------------- #
# Bedrock classifier (PRIMARY — the intended classification path)
# --------------------------------------------------------------------------- #

_SYSTEM_PROMPT = """You are the triage classifier for a healthcare contact \
center in Puerto Rico. Members write in Spanish or English. Classify the \
incoming request. You ONLY classify — you never write a reply and never give \
medical advice.

Return ONLY a JSON object, no prose, with exactly these keys:
{
  "type": one of ["complaint","benefits_enquiry","service_request","billing_dispute","clinical_urgent"],
  "urgency": one of ["low","medium","high","critical"],
  "confidence": number between 0 and 1,
  "language": "es" or "en",
  "clinical_flag": true if the message mentions symptoms, medications, injuries, \
or anything needing clinical judgment,
  "phi_present": true if it contains personal health information,
  "rationale": one short sentence explaining the classification,
  "key_entities": object with any account numbers, amounts, or dates found
}

If the message describes symptoms or a possible medical emergency, set \
type="clinical_urgent", urgency="critical", and clinical_flag=true."""


def classify_bedrock(text: str) -> Judgment:
    """Live classification via Bedrock. Raises on any failure so the caller
    can fall back. Uses the Converse API for model-agnostic structured output."""
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

    return Judgment(
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


def classify(text: str) -> Judgment:
    """Public entry point. Runs the live AI model by default; falls back to the
    deterministic rule layer ONLY on error or timeout. Never raises — healthcare
    ops cannot stall on a model hiccup, and every fallback is flagged in the
    judgment rationale so it shows up in the audit trail."""
    if config.USE_BEDROCK:
        try:
            return classify_bedrock(text)
        except Exception as exc:  # noqa: BLE001 - intentional broad fallback
            fallback = classify_deterministic(text)
            fallback.rationale += (
                f" [fell back to deterministic classifier: {type(exc).__name__}]"
            )
            return fallback
    return classify_deterministic(text)

from enum import Enum
from datetime import datetime, timezone

from pydantic import BaseModel, ConfigDict, Field


class RequestType(str, Enum):
    COMPLAINT = "complaint"
    BENEFITS_ENQUIRY = "benefits_enquiry"
    SERVICE_REQUEST = "service_request"
    BILLING_DISPUTE = "billing_dispute"
    CLINICAL_URGENT = "clinical_urgent"


class Urgency(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class Language(str, Enum):
    EN = "en"
    ES = "es"


class RawIncomingRequest(BaseModel):
    """Raw intake payload accepted only at the platform edge."""

    model_config = ConfigDict(extra="forbid")

    id: str
    channel: str
    member_name: str | None = None
    subject: str
    body: str


class MaskedIncomingRequest(RawIncomingRequest):
    """De-identified request after the PHI masking gateway."""

    mask_id: str
    entities: dict = Field(default_factory=dict)
    phi: dict = Field(default_factory=lambda: {"count": 0, "tokens": [], "kinds": {}})


def assert_masked_request(request: MaskedIncomingRequest) -> None:
    if not getattr(request, "mask_id", None):
        raise ValueError("Request has not passed through the PHI masking gateway: missing mask_id")
    if not isinstance(getattr(request, "entities", None), dict):
        raise ValueError("Request has not passed through the PHI masking gateway: invalid entities metadata")
    phi = getattr(request, "phi", None)
    if not isinstance(phi, dict) or "count" not in phi:
        raise ValueError("Request has not passed through the PHI masking gateway: invalid phi metadata")


class TypeDecision(BaseModel):
    type: RequestType
    urgency: Urgency
    confidence: float = Field(ge=0, le=1)
    language: Language
    clinical_flag: bool = False
    phi_present: bool = False
    rationale: str
    key_entities: dict = Field(default_factory=dict)
    source: str


class Action(BaseModel):
    step: str
    detail: str


class RemediationResult(BaseModel):
    request_id: str
    branch: RequestType
    urgency: Urgency
    assigned_team: str
    actions: list[Action]
    draft_response: str
    follow_up: str | None = None
    sla: str | None = None
    requires_human_review: bool = False
    escalation_reason: str | None = None


class ProcessedRequest(BaseModel):
    request: MaskedIncomingRequest
    type_decision: TypeDecision
    remediation: RemediationResult
    processed_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

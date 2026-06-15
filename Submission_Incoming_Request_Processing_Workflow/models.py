from enum import Enum
from datetime import datetime, timezone

from pydantic import BaseModel, Field


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


class IncomingRequest(BaseModel):
    id: str
    channel: str
    member_name: str | None = None
    subject: str
    body: str


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
    request: IncomingRequest
    type_decision: TypeDecision
    remediation: RemediationResult
    processed_at: str = Field(
        default_factory=lambda: datetime.now(timezone.utc).isoformat()
    )

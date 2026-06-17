from models import MaskedIncomingRequest, ProcessedRequest, assert_masked_request
import audit
import branches
import classifier


def process_one(request: MaskedIncomingRequest) -> ProcessedRequest:
    assert_masked_request(request)
    type_decision = classifier.classify(f"{request.subject}\n\n{request.body}")
    type_decision.key_entities = {
        **(type_decision.key_entities or {}),
        **(request.entities or {}),
    }
    type_decision.phi_present = bool((request.phi or {}).get("count", 0))
    remediation = branches.remediate(request.id, type_decision, request.member_name)
    processed = ProcessedRequest(
        request=request,
        type_decision=type_decision,
        remediation=remediation,
    )
    audit.record(processed)
    return processed

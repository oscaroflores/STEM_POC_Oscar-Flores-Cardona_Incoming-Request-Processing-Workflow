from models import IncomingRequest, ProcessedRequest
import audit
import branches
import classifier


def process_one(request: IncomingRequest) -> ProcessedRequest:
    type_decision = classifier.classify(f"{request.subject}\n\n{request.body}")
    remediation = branches.remediate(request.id, type_decision, request.member_name)
    processed = ProcessedRequest(
        request=request,
        type_decision=type_decision,
        remediation=remediation,
    )
    audit.record(processed)
    return processed

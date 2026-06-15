from models import IncomingRequest, ProcessedRequest
import audit
import branches
import classifier


def process_one(request: IncomingRequest) -> ProcessedRequest:
    judgment = classifier.classify(f"{request.subject}\n\n{request.body}")
    remediation = branches.remediate(request.id, judgment, request.member_name)
    processed = ProcessedRequest(
        request=request,
        judgment=judgment,
        remediation=remediation,
    )
    audit.record(processed)
    return processed

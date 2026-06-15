"""
Remediation branches — where "rules act."

Each branch is a deterministic function that turns a Judgment into a complete
handoff package: which team gets it, what ordered steps were taken, a draft
acknowledgement in the member's language, and any SLA / follow-up markers.

Design principles enforced here:
  * The AI manager ROUTES and PREPARES; it never resolves the request itself.
  * Every branch executes at least two distinct downstream steps (brief floor).
  * Drafts are template-driven and bilingual — consistent, compliant, and safe.
    They never contain clinical or treatment language.
  * The escalation branch refuses to auto-route and produces a neutral,
    non-clinical acknowledgement only.
"""

from models import (
    Judgment, RemediationResult, Action, RequestType, Language,
)
from teams import team
from safety import gate_check


def _name(member: str | None, lang: Language) -> str:
    if member:
        return member
    return "estimado/a miembro" if lang == Language.ES else "valued member"


# --------------------------------------------------------------------------- #
# Bilingual draft templates (acknowledgements only — never resolutions)
# --------------------------------------------------------------------------- #

def _draft_complaint(member, lang, ref):
    if lang == Language.ES:
        return (
            f"Estimado/a {_name(member, lang)}:\n\n"
            "Lamentamos su experiencia y hemos recibido su queja. Un especialista "
            "senior de resolución la revisará con prioridad y le contactará "
            f"dentro de 2 horas. Número de caso: {ref}.\n\n"
            "Gracias por permitirnos atenderle.\nEquipo de TeleMedik"
        )
    return (
        f"Dear {_name(member, lang)},\n\n"
        "We're sorry about your experience and have received your complaint. A "
        "senior resolution specialist will review it as a priority and contact "
        f"you within 2 hours. Case number: {ref}.\n\n"
        "Thank you for allowing us to make this right.\nThe TeleMedik Team"
    )


def _draft_benefits(member, lang):
    if lang == Language.ES:
        return (
            f"Estimado/a {_name(member, lang)}:\n\n"
            "Hemos recibido su consulta sobre beneficios y cobertura. Nuestro "
            "equipo de Beneficios y Elegibilidad le responderá con la información "
            "de su plan. Este mensaje confirma que su consulta está en proceso.\n\n"
            "Equipo de TeleMedik"
        )
    return (
        f"Dear {_name(member, lang)},\n\n"
        "We've received your benefits/coverage question. Our Benefits & "
        "Eligibility team will respond with your plan details. This message "
        "confirms your enquiry is being handled.\n\nThe TeleMedik Team"
    )


def _draft_service(member, lang):
    if lang == Language.ES:
        return (
            f"Estimado/a {_name(member, lang)}:\n\n"
            "Hemos recibido su solicitud de servicio y la hemos enviado a nuestro "
            "equipo de Programación. Le confirmaremos los detalles a la brevedad "
            "posible.\n\nEquipo de TeleMedik"
        )
    return (
        f"Dear {_name(member, lang)},\n\n"
        "We've received your service request and routed it to our Scheduling "
        "team. We'll confirm the details with you shortly.\n\nThe TeleMedik Team"
    )


def _draft_billing(member, lang, ref):
    if lang == Language.ES:
        return (
            f"Estimado/a {_name(member, lang)}:\n\n"
            "Hemos recibido su disputa de facturación y la hemos enviado a nuestro "
            "equipo de Facturación y Reclamaciones para revisión. Caso: "
            f"{ref}. Le contactaremos con el resultado de la revisión.\n\n"
            "Equipo de TeleMedik"
        )
    return (
        f"Dear {_name(member, lang)},\n\n"
        "We've received your billing dispute and routed it to our Billing & "
        f"Claims team for review. Case: {ref}. We'll follow up with the outcome "
        "of that review.\n\nThe TeleMedik Team"
    )


def _draft_escalation(member, lang):
    """Neutral, NON-CLINICAL acknowledgement. Directs to emergency care without
    offering any medical assessment or advice."""
    if lang == Language.ES:
        return (
            f"Estimado/a {_name(member, lang)}:\n\n"
            "Hemos recibido su mensaje y lo hemos referido de inmediato a un "
            "supervisor para atención prioritaria por una persona. Si se trata de "
            "una emergencia médica, por favor llame al 9-1-1 o acuda a la sala de "
            "emergencias más cercana ahora mismo.\n\nEquipo de TeleMedik"
        )
    return (
        f"Dear {_name(member, lang)},\n\n"
        "We've received your message and immediately referred it to a supervisor "
        "for priority handling by a person. If this is a medical emergency, "
        "please call 9-1-1 or go to your nearest emergency room right now.\n\n"
        "The TeleMedik Team"
    )


# --------------------------------------------------------------------------- #
# Branch handlers
# --------------------------------------------------------------------------- #

def _complaint(j: Judgment, member) -> RemediationResult:
    ref = f"CMP-{j.key_entities.get('account_ref', '0000')}"
    return RemediationResult(
        request_id="", branch=RequestType.COMPLAINT, urgency=j.urgency,
        assigned_team=team("senior_handler").name,
        actions=[
            Action(step="acknowledge", detail="Drafted bilingual acknowledgement of the complaint."),
            Action(step="assign_team", detail=f"Routed to {team('senior_handler').name} ({team('senior_handler').queue})."),
            Action(step="log_priority", detail=f"Logged priority case {ref} with high-urgency flag."),
            Action(step="set_follow_up", detail="Set a 2-hour follow-up reminder for the handler."),
        ],
        draft_response=_draft_complaint(member, j.language, ref),
        follow_up="2-hour follow-up reminder",
    )


def _benefits(j: Judgment, member) -> RemediationResult:
    return RemediationResult(
        request_id="", branch=RequestType.BENEFITS_ENQUIRY, urgency=j.urgency,
        assigned_team=team("benefits_team").name,
        actions=[
            Action(step="classify_subtopic", detail="Identified as a benefits/eligibility enquiry."),
            Action(step="draft_holding", detail="Drafted a bilingual holding acknowledgement."),
            Action(step="assign_team", detail=f"Routed to {team('benefits_team').name} ({team('benefits_team').queue})."),
            Action(step="log_pending", detail="Logged as pending response from the benefits team."),
        ],
        draft_response=_draft_benefits(member, j.language),
        sla="Respond within 1 business day",
    )


def _service(j: Judgment, member) -> RemediationResult:
    return RemediationResult(
        request_id="", branch=RequestType.SERVICE_REQUEST, urgency=j.urgency,
        assigned_team=team("scheduling").name,
        actions=[
            Action(step="extract_details", detail=f"Extracted request details: {j.key_entities or 'none found'}."),
            Action(step="assign_team", detail=f"Routed to {team('scheduling').name} ({team('scheduling').queue})."),
            Action(step="draft_confirmation", detail="Drafted a bilingual confirmation message."),
            Action(step="set_sla", detail="Started a 4-hour service SLA timer."),
        ],
        draft_response=_draft_service(member, j.language),
        sla="4-hour service SLA",
    )


def _billing(j: Judgment, member) -> RemediationResult:
    ref = f"BIL-{j.key_entities.get('account_ref', '0000')}"
    return RemediationResult(
        request_id="", branch=RequestType.BILLING_DISPUTE, urgency=j.urgency,
        assigned_team=team("billing").name,
        actions=[
            Action(step="extract_account", detail=f"Extracted billing references: {j.key_entities or 'none found'}."),
            Action(step="assign_team", detail=f"Routed to {team('billing').name} ({team('billing').queue})."),
            Action(step="draft_acknowledgement", detail=f"Drafted bilingual acknowledgement, case {ref}."),
            Action(step="set_follow_up", detail="Set a billing-review follow-up flag."),
        ],
        draft_response=_draft_billing(member, j.language, ref),
        follow_up="Billing-review follow-up flag",
    )


def _escalation(j: Judgment, member, reason: str) -> RemediationResult:
    return RemediationResult(
        request_id="", branch=RequestType.CLINICAL_URGENT, urgency=j.urgency,
        assigned_team=team("human_review").name,
        actions=[
            Action(step="flag_human_review", detail="Immediately flagged for human review — auto-resolution paused."),
            Action(step="draft_neutral_ack", detail="Drafted a neutral, NON-CLINICAL acknowledgement (no medical advice)."),
            Action(step="notify_supervisor", detail=f"Notified supervisor desk ({team('human_review').queue})."),
            Action(step="pause_auto", detail="Withheld automated routing to any standard team."),
        ],
        draft_response=_draft_escalation(member, j.language),
        requires_human_review=True,
        escalation_reason=reason,
    )


_BRANCH_MAP = {
    RequestType.COMPLAINT: _complaint,
    RequestType.BENEFITS_ENQUIRY: _benefits,
    RequestType.SERVICE_REQUEST: _service,
    RequestType.BILLING_DISPUTE: _billing,
}


def remediate(request_id: str, judgment: Judgment, member: str | None) -> RemediationResult:
    """
    Apply safety gates first, then route to the type-specific branch.
    A fired gate overrides the predicted type and forces the escalation branch.
    """
    force_human, reason = gate_check(judgment)
    if force_human:
        result = _escalation(judgment, member, reason or "Routed to human review.")
    else:
        result = _BRANCH_MAP[judgment.type](judgment, member)
    result.request_id = request_id
    return result

"""
Safety gates.

The AI manager is autonomous in *processing* the queue, but two gates can
override its routing and force a case to the human-review desk. This is how the
system "knows the limits of its authority":

  1. Clinical gate  - any request flagged as containing clinical content
                      (symptoms, medication, anything that could need a clinical
                      decisions) is never auto-resolved or routed to a normal
                      queue. The manager does not give medical advice.
  2. Confidence gate - any classification below the configured threshold is
                      routed to a human, with the uncertainty made visible.

Either gate firing converts the case into a CLINICAL_URGENT / escalation branch.
"""

from models import TypeDecision
import config


def gate_check(type_decision: TypeDecision) -> tuple[bool, str | None]:
    """
    Returns (force_human_review, reason).

    Reason is a short, ops-legible string explaining exactly why the manager
    declined to handle the case autonomously — this string is logged and shown
    on the dashboard, never hidden.
    """
    if type_decision.clinical_flag or type_decision.type.value == "clinical_urgent":
        return True, (
            "Clinical content detected — routed to a human supervisor. "
            "The AI manager does not make clinical or treatment decisions."
        )

    if type_decision.confidence < config.CONFIDENCE_THRESHOLD:
        return True, (
            f"Low classification confidence "
            f"({type_decision.confidence:.0%} < {config.CONFIDENCE_THRESHOLD:.0%}) "
            f"— routed to a human to avoid acting on an uncertain read."
        )

    return False, None

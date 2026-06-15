# AI Orchestrator Workflows and Branches

This document describes the workflows currently available to Conductor, the AI intake orchestrator for the FirstSource / TeleMedik Incoming Request Processing Workflow POC.

Source of truth in the codebase:

- `Submission_Incoming_Request_Processing_Workflow/orchestrator.py`
- `Submission_Incoming_Request_Processing_Workflow/classifier.py`
- `Submission_Incoming_Request_Processing_Workflow/safety.py`
- `Submission_Incoming_Request_Processing_Workflow/branches.py`
- `Submission_Incoming_Request_Processing_Workflow/models.py`
- `Submission_Incoming_Request_Processing_Workflow/teams.py`

## Orchestrator Decision Model

The AI component does one job: classify each incoming request into a request `type`. The API carries that type plus confidence, urgency, language, rationale, and extracted entities in `type_decision`. Deterministic workflow code then applies safety gates, selects the remediation branch, generates draft outputs, routes the case, and records the audit trail.

Design rule: AI reasons, rules act.

## End-to-End Processing Workflow

Every incoming request follows this top-level workflow.

| Node | Code location | What happens | Output |
| --- | --- | --- | --- |
| 1. Receive request | `main.py` | Request arrives from the sample inbox, SSE stream, or ad-hoc `POST /api/process` call. | `IncomingRequest` with id, channel, member name, subject, and body. |
| 2. Classify | `classifier.py` | Bedrock AI is the only classifier. Model errors or invalid output surface as operational failures rather than falling back to keyword heuristics. | Request `type` plus urgency, confidence, language, clinical flag, PHI flag, rationale, entities, and source in `type_decision`. |
| 3. Apply safety gates | `safety.py` | Clinical content or low confidence can override normal routing. | Either continue to the predicted branch or force human review. |
| 4. Remediate | `branches.py` | The selected branch creates ordered downstream action nodes, assigned team, draft acknowledgement, SLA/follow-up, and escalation metadata. | `RemediationResult`. |
| 5. Build processed result | `orchestrator.py` | The original request, type decision, and remediation package are combined. | `ProcessedRequest`. |
| 6. Audit | `audit.py` | The decision, rationale, action list, draft, routing, and escalation flags are written to SQLite. | Persistent audit log and dashboard aggregates. |

## Classifications Available to the AI

The AI classifier can choose from these request types.

| Classification label | Enum value | Normal remediation branch | Notes |
| --- | --- | --- | --- |
| Complaint | `complaint` | Complaint workflow | Member dissatisfaction, poor service, demand to escalate, rude or unacceptable experience. |
| Benefits Enquiry | `benefits_enquiry` | Benefits enquiry workflow | Coverage, eligibility, plan benefit, network, deductible, or benefit inclusion question. |
| Service Request | `service_request` | Service request workflow | Appointment support, scheduling, rescheduling, referrals, authorizations, ID card requests. |
| Billing Dispute | `billing_dispute` | Billing dispute workflow | Charges, invoices, refunds, copays, overcharges, payment or statement disputes. |
| Clinical / Urgent | `clinical_urgent` | Human review escalation workflow | Symptoms, medication, possible emergency, injury, side effects, or anything needing clinical decision-making. |

## Safety Gate Workflow

Safety gates run before branch-specific remediation. They can override the AI's predicted branch.

| Gate | Trigger | Result | Reason shown to operations |
| --- | --- | --- | --- |
| Clinical gate | `type_decision.clinical_flag == true` or `type_decision.type == clinical_urgent` | Forces the `clinical_urgent` escalation branch. | Clinical content detected; the AI manager does not make clinical or treatment decisions. |
| Confidence gate | `type_decision.confidence < CONDUCTOR_CONF_THRESHOLD` | Forces the `clinical_urgent` escalation branch. | Low classification confidence; routed to a human to avoid acting on an uncertain read. |

Default confidence threshold: `0.70`, configured by `CONDUCTOR_CONF_THRESHOLD` in `config.py`.

## Workflow 1: Complaint Branch

Branch value: `complaint`

Assigned team: `Senior Resolution Desk`

Queue: `tmk-priority-complaints`

Default urgency: `high`

Human review by default: no, unless a safety gate fires first.

Generated outputs:

- Bilingual complaint acknowledgement.
- Priority case reference in the form `CMP-{account_ref}` or `CMP-0000`.
- Follow-up marker: `2-hour follow-up reminder`.

Action nodes:

| Order | Node / step | Current behavior |
| --- | --- | --- |
| 1 | `acknowledge` | Drafts a bilingual acknowledgement of the complaint. |
| 2 | `assign_team` | Routes the case to Senior Resolution Desk. |
| 3 | `log_priority` | Logs a priority case reference with a high-urgency flag. |
| 4 | `set_follow_up` | Sets a 2-hour follow-up reminder for the handler. |

Example sample requests: `REQ-1001`, `REQ-1009`.

## Workflow 2: Benefits Enquiry Branch

Branch value: `benefits_enquiry`

Assigned team: `Benefits & Eligibility Team`

Queue: `tmk-benefits-eligibility`

Default urgency: `low`

Human review by default: no, unless a safety gate fires first.

Generated outputs:

- Bilingual holding acknowledgement.
- SLA marker: `Respond within 1 business day`.
- Pending-response log marker for the benefits team.

Action nodes:

| Order | Node / step | Current behavior |
| --- | --- | --- |
| 1 | `classify_subtopic` | Identifies the request as a benefits or eligibility enquiry. |
| 2 | `draft_holding` | Drafts a bilingual holding acknowledgement. |
| 3 | `assign_team` | Routes the case to Benefits & Eligibility Team. |
| 4 | `log_pending` | Logs the case as pending response from the benefits team. |

Example sample requests: `REQ-1002`, `REQ-1010`.

## Workflow 3: Service Request Branch

Branch value: `service_request`

Assigned team: `Scheduling & Service Coordination`

Queue: `tmk-service-scheduling`

Default urgency: `medium`

Human review by default: no, unless a safety gate fires first.

Generated outputs:

- Extracted request details from `type_decision.key_entities` when available.
- Bilingual confirmation draft.
- SLA marker: `4-hour service SLA`.

Action nodes:

| Order | Node / step | Current behavior |
| --- | --- | --- |
| 1 | `extract_details` | Extracts available request details and references from the classified request. |
| 2 | `assign_team` | Routes the case to Scheduling & Service Coordination. |
| 3 | `draft_confirmation` | Drafts a bilingual confirmation message. |
| 4 | `set_sla` | Starts a 4-hour service SLA timer. |

Example sample requests: `REQ-1003`, `REQ-1006`, `REQ-1012`.

## Workflow 4: Billing Dispute Branch

Branch value: `billing_dispute`

Assigned team: `Billing & Claims Review`

Queue: `tmk-billing-disputes`

Default urgency: `medium`, or `high` when urgency signals are present.

Human review by default: no, unless a safety gate fires first.

Generated outputs:

- Extracted billing references from `type_decision.key_entities`.
- Billing case reference in the form `BIL-{account_ref}` or `BIL-0000`.
- Bilingual acknowledgement draft.
- Follow-up marker: `Billing-review follow-up flag`.

Action nodes:

| Order | Node / step | Current behavior |
| --- | --- | --- |
| 1 | `extract_account` | Extracts billing references, account numbers, and amounts when available. |
| 2 | `assign_team` | Routes the case to Billing & Claims Review. |
| 3 | `draft_acknowledgement` | Drafts a bilingual billing acknowledgement and includes the billing case reference. |
| 4 | `set_follow_up` | Sets a billing-review follow-up flag. |

Example sample requests: `REQ-1004`, `REQ-1007`.

## Workflow 5: Clinical / Urgent Human Review Branch

Branch value: `clinical_urgent`

Assigned team: `Human Review Supervisor Desk`

Queue: `tmk-supervisor-review`

Default urgency: `critical`

Human review by default: yes.

This branch is used when the AI classifies a request as clinical/urgent or when either safety gate forces escalation. The branch intentionally refuses standard auto-routing and does not generate clinical advice.

Generated outputs:

- Neutral bilingual acknowledgement.
- Emergency-care instruction for possible medical emergencies.
- Supervisor notification.
- `requires_human_review = true`.
- `escalation_reason` explaining the gate or clinical trigger.

Action nodes:

| Order | Node / step | Current behavior |
| --- | --- | --- |
| 1 | `flag_human_review` | Immediately flags the case for human review and pauses auto-resolution. |
| 2 | `draft_neutral_ack` | Drafts a neutral, non-clinical acknowledgement with no medical advice. |
| 3 | `notify_supervisor` | Notifies the Human Review Supervisor Desk queue. |
| 4 | `pause_auto` | Withholds automated routing to any standard team. |

Example sample requests: `REQ-1005`, `REQ-1011`.

Low-confidence example routed here by safety gate: `REQ-1008`.

## Management Override Workflow

The UI and API also expose a management override hook.

Endpoint: `POST /api/override`

Purpose: demonstrate human control over the agent after a processed case appears in the operations console.

Current override payload:

| Field | Meaning |
| --- | --- |
| `request_id` | Processed request to override. |
| `action` | Management action, for example `reassign`, `approve`, or `send_to_human`. |
| `note` | Optional management note. |

Current behavior: records and returns the override request as an acknowledgement. In a production build, this would update the case state or trigger a re-route.

## Dashboard and Audit Workflow

The orchestrator records each processed request for operational visibility.

Audit log captures:

- Original request id, channel, subject, and body.
- Classification type, urgency, confidence, language, clinical flag, PHI flag, rationale, and classifier source.
- Assigned team and branch selected.
- Ordered branch action list.
- Draft response.
- SLA and follow-up markers.
- Human review flag and escalation reason.
- Processed timestamp.

Dashboard aggregates currently available:

- Total processed requests.
- Counts by request type.
- Counts by urgency.
- Pending human review count.
- Average confidence.

## Current Branch Map

Normal branch routing is defined in `branches.py` as `_BRANCH_MAP`.

| Request type | Branch handler |
| --- | --- |
| `complaint` | `_complaint` |
| `benefits_enquiry` | `_benefits` |
| `service_request` | `_service` |
| `billing_dispute` | `_billing` |

The `clinical_urgent` path is intentionally not part of the normal branch map. It is selected through safety-gate escalation or direct clinical/urgent classification and handled by `_escalation`.

## Notes for Demo Reviewers

- The AI classifier chooses the request type and urgency, but it does not write final responses or make final healthcare decisions.
- Each branch has at least four deterministic downstream nodes, exceeding the POC requirement of at least two downstream steps per branch.
- Clinical and low-confidence cases are made visible instead of hidden behind automation.
- All member-facing draft responses are acknowledgements, not final resolutions.
- Spanish and English requests are supported through language-aware classification and bilingual templates.

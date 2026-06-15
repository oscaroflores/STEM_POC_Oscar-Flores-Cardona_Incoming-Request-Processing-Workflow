# Incoming Request Processing Workflow POC - Agent Instructions

This directory is the submission workspace for the FirstSource / TeleMedik proof of concept.

The immediate assignment is to build the **Incoming Request Processing Workflow** POC end to end. The real objective is to use the POC to stand out, over-deliver, and earn the job or the next interview.

## Source Context

Before making major product, architecture, or copy decisions, read these source files from the parent directory:

- `../FirstSource_POC_Competition_Instructions.md`
- `../PoC-Options/Incoming_Request_Processing_Workflow.docx`

The first file contains the broader hiring and competition context from the email thread. The second file is the official selected POC brief.

## Hiring Context

TeleMedik is a healthcare services company in Puerto Rico with over 30 years of experience and nearly 2 million lives impacted annually through its contact centers. It was recently acquired by Firstsource, which is positioned as expanding TeleMedik's digital capabilities, accelerating innovation, and supporting growth into the U.S. healthcare technology market.

The POC should therefore feel like a practical healthcare contact center operations tool, not a generic AI chatbot demo.

Optimize every artifact for this message:

**Oscar can build practical AI workflow automation for healthcare operations, explain it clearly, and reason about escalation, auditability, service quality, and human oversight.**

## Official POC Objective

Design and develop an AI-powered prototype that automatically receives, classifies, and processes incoming requests such as customer queries, complaints, or service requests.

The solution must demonstrate multi-step branching logic, where each request type triggers a distinct remediation workflow rather than a single generic response.

## Minimum Requirements From Brief

The prototype must:

- Accept incoming requests through a form, file upload, simulated inbox, or equivalent input.
- Use AI to classify each request by type and urgency.
- Branch into a type-specific remediation workflow.
- Execute at least two downstream steps per branch.
- Support at least three distinct request types.
- Produce legible outputs for an operations team.

For each processed request, output:

- Classification label.
- Urgency level.
- Branch-specific action summary.
- Generated outputs such as draft response, routing notification, follow-up task, escalation notice, or case log entry.

## Strategic Over-Delivery Targets

Meeting the brief is not enough. Prefer features that attack the company's implicit pain points:

- Healthcare contact center framing.
- Realistic member/patient/provider service request examples.
- At least four remediation branches if feasible.
- Classification confidence score.
- Human-in-the-loop routing for urgent, sensitive, or low-confidence cases.
- Audit trail with timestamp, classification, urgency, rationale, and actions taken.
- SLA/follow-up timers or flags.
- Dashboard or operations summary showing request volume, urgency mix, branch outcomes, and unresolved escalations.
- Bilingual-ready design or sample Spanish/English request handling if feasible.
- Healthcare-safe wording that avoids clinical diagnosis or treatment decisions.

Do not build a generic support-ticket demo if a healthcare contact center version is feasible.

## Suggested Branches

Use branches that map naturally to TeleMedik / Firstsource operations:

- Complaint: high urgency; acknowledge receipt, escalate to senior handler, log priority case, set follow-up reminder.
- General Enquiry / Benefits Question: low urgency; classify sub-topic, draft knowledge-base-style response, log as resolved or pending review.
- Service Request / Appointment Support: medium urgency; extract required details, route to scheduling or service team, draft confirmation, set SLA timer.
- Billing Dispute: high or medium urgency; extract account/billing details, route to billing team, draft acknowledgement, set follow-up flag.
- Escalation / Urgent: critical urgency; immediately flag for human review, draft urgent acknowledgement, notify supervisor, pause auto-resolution.

The system can support more than four branches, but do not add complexity that weakens reliability or demo clarity.

## Product Principles

- Build for an operations manager reviewing work queues, not for a developer admiring internals.
- Make every automated action explainable.
- Keep the workflow deterministic enough to demo reliably.
- Prefer transparent rules plus AI reasoning over opaque magic.
- Make uncertainty visible.
- Route sensitive or urgent healthcare issues to a human reviewer.
- Avoid implying the AI makes clinical decisions.
- Use sample or synthetic data only. Do not use proprietary, private, or real patient data.

## Current Implementation Stack

The project has moved beyond the original default suggestion. The current implementation is:

- Python/FastAPI backend for the workflow API.
- Bedrock AI as the primary classifier, with deterministic fallback only on model error/timeout.
- SQLite audit log for classification decisions, routing actions, generated drafts, and escalation flags.
- Bilingual JSON sample inbox with synthetic Spanish/English requests.
- Standalone Next.js App Router frontend in `Submission_Incoming_Request_Processing_Workflow/frontend/`.
- shadcn/ui-style local components, Tailwind CSS, and Radix primitives for the operations UI.

Do not replace the current stack with Streamlit or Gradio unless explicitly asked. Future work should improve the existing FastAPI + Next.js implementation.

No new dependencies should be added casually. If dependencies are needed, keep them minimal, document setup clearly, and run the relevant verification commands.

## Frontend UI Direction

The operations UI should mimic the styling and information density of the Notion app:

- Off-white workspace, thin borders, subdued shadows, rounded cards, dense database-like layout.
- Left navigation/sidebar, main work board, and right operations panel.
- Calm, readable typography and restrained motion.
- Avoid flashy chatbot aesthetics, purple gradients, and generic SaaS dashboard styling.

Use TeleMedik-inspired healthcare accents when color is needed:

- Teal/blue for primary brand and routing accents.
- Green for safe/resolved/low urgency states.
- Amber/orange for warning/high urgency states.
- Red for clinical, critical, or human-review states.

The live TeleMedik site may block automated fetching. If exact brand colors or logo assets are needed, verify them manually from accessible brand material before final screenshots.

## Expected Submission Artifacts

Build toward these artifacts inside this submission directory:

- Working prototype.
- README with setup instructions, workflow design notes, assumptions, tools used, and examples.
- Sample input requests, at least one per branch.
- Sample outputs, logs, or screenshots.
- Five-slide summary deck or source material for the deck.
- Demo script or walkthrough outline for a recording under 3 minutes.
- Any generated workflow export or repository link notes if applicable.

## Current TODO Context

For the latest tactical checklist, read `../TODO.md` from inside the submission directory. As of Sunday, June 14, 2026, the working project name is **Conductor — AI Intake Manager**.

Current UI status:

- Next.js operations UI exists in `frontend/`.
- It includes the live inbox board, dashboard summary, escalation queue, detail sheet, management override form, and ad-hoc request form.
- Frontend verification passed: `npm run typecheck`, `npm run build`, and `npm audit --omit=dev`.
- Live frontend-to-backend verification still needs to be completed against a running API.

## Five-Slide Deck Structure

The summary deck must be no more than five slides:

1. Problem Understanding and Objective: summarize the brief and operational problem.
2. Solution Architecture and Design Flow: show classification logic and remediation branches.
3. Implementation Highlights: explain technical decisions, AI logic, branching, and screenshots or concise code snippets.
4. Challenges and Learnings: discuss trade-offs, reliability, human review, and implementation lessons.
5. Demo Summary and Next Steps: include demo/repo links and practical enhancements.

## Evaluation Rubric

The official rubric weights:

- Classification accuracy, branching logic quality, and remediation strategy completeness: 40%.
- End-to-end reliability across branches and clarity/usefulness of outputs: 30%.
- Communication clarity and presentation structure: 15%.
- Creativity in remediation design, edge case handling, and reflection: 15%.

Use this weighting when making trade-offs. Reliability and clarity matter more than novelty.

## Demo Narrative

The demo should tell a compact business story:

1. A healthcare contact center receives mixed inbound requests.
2. Manual triage is slow, inconsistent, and hard to audit.
3. The prototype classifies each request by type and urgency.
4. Each classification triggers a different remediation workflow.
5. High-risk or uncertain requests are routed to humans.
6. The system produces draft responses, routing notes, follow-up flags, SLA markers, and an audit trail.
7. Operations leaders get a clear summary of request volume, priority, and pending escalations.

Keep the demo under 3 minutes. Script around business value, not just UI clicks.

## Verification Expectations

Before claiming completion:

- Run the app locally.
- Run the backend API and the Next.js frontend together.
- Process representative examples for every branch.
- Confirm the expected classification, urgency, actions, and generated outputs appear.
- Confirm the frontend live board drains the inbox through SSE.
- Confirm the ad-hoc form calls `POST /api/process` successfully.
- Confirm the management override control calls `POST /api/override` successfully.
- Confirm the dashboard and escalation queue update during a live run.
- Confirm audit/log output is created and readable.
- Confirm frontend checks pass: `npm run typecheck`, `npm run build`, and `npm audit --omit=dev` from `frontend/`.
- Confirm the README setup steps are accurate.
- Confirm the deck or deck outline matches the required five-slide structure.
- Confirm no real patient data or proprietary data is included.
- Document any feature that depends on an optional API key or external service.

If something cannot be verified, state the gap plainly and prefer a reliable offline fallback over a fragile live dependency.

## Timeline

POC instructions were received on Thursday, June 11, 2026 at 3:17 PM. Selection was confirmed on Friday, June 12, 2026 at 1:53 PM. Treat the final submission as due no later than the end of Tuesday, June 16, 2026 unless FirstSource or TeleMedik provides a different clarification.

## Working Rule

When working in this directory, preserve momentum. Make pragmatic decisions, keep the product coherent, verify behavior, and align all work to the hiring goal: stand out by showing practical, reliable AI workflow automation for healthcare contact center operations.

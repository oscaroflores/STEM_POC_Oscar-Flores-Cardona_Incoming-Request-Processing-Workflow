# Conductor — AI Intake Manager for Healthcare Contact Centers

**FirstSource / TeleMedik POC — Incoming Request Processing Workflow**
Oscar Flores Cardona

Conductor is an autonomous "AI manager" for a healthcare contact center inbox.
It receives mixed inbound member requests (in Spanish or English), classifies
each by **type** and **urgency**, and routes it to the correct team with a
complete, branch-specific handoff package — while refusing to act on anything
clinical or anything it isn't confident about, sending those to a human instead.

> **Design thesis: _AI reasons, rules act._**
> The model does exactly one job — read a request and emit a structured
> judgment. A deterministic engine does everything else: routing, drafting,
> logging. That separation is what makes every automated action explainable,
> auditable, and safe — the qualities a healthcare operation actually needs.

---

## Why this shape (and not a chatbot)

The AI manager **routes and prepares** work; it does **not** resolve requests
itself — exactly as a real triage manager hands a billing dispute to the billing
team rather than settling it. The value is consistent, auditable, safe triage at
volume, with uncertainty made visible and humans kept in control.

Two safety gates can override the manager's routing:

1. **Clinical gate** — any request mentioning symptoms, medication, or anything
   needing clinical judgment is never auto-resolved or routed to a standard
   queue. It goes to a human supervisor with a neutral, non-clinical
   acknowledgement. The AI never gives medical advice.
2. **Confidence gate** — any classification below the configured threshold
   (default 70%) is routed to a human, with the uncertainty shown explicitly.

## Branches (each is a distinct, multi-step remediation)

| Type | Urgency | Team | Steps |
| --- | --- | --- | --- |
| Complaint | High | Senior Resolution | acknowledge · assign · priority log · 2h follow-up |
| Benefits Enquiry | Low | Benefits & Eligibility | classify · holding draft · assign · log pending |
| Service Request | Medium | Scheduling & Service | extract details · assign · confirmation draft · SLA timer |
| Billing Dispute | Medium/High | Billing & Claims | extract account · assign · acknowledgement · follow-up flag |
| Clinical / Urgent | Critical | Human Review | flag human · neutral ack · notify supervisor · pause auto-routing |

All draft responses are **bilingual (ES/EN)**, template-driven, and free of
clinical or treatment language — consistent and compliant by construction.

## Architecture

```
Inbox ─▶ Orchestrator (autonomous, one request at a time)
            │
            ├─▶ classify()      → Judgment {type, urgency, confidence,
            │   (Bedrock AI;       language, clinical_flag, phi_present,
            │    rule-layer         rationale, key_entities}
            │    fallback)
            │
            ├─▶ safety gates    → clinical? low-confidence? → force human review
            │
            ├─▶ remediate()     → branch-specific handoff package
            │                      (team, ordered actions, bilingual draft, SLA)
            │
            └─▶ audit.record()  → append-only SQLite compliance log
```

The classifier has two implementations behind one contract (`Judgment`): the
**primary** path is a live **Bedrock** call (`boto3` Converse API, model-agnostic,
structured JSON) — AI classifies every request, as the brief requires. A
**deterministic** keyword/heuristic classifier sits behind it as a *resilience
fallback*: it fires **only** if the live model errors or times out, so a
healthcare queue never stalls during a model outage. Every fallback is flagged
in the judgment's rationale, so it is visible in the audit trail rather than
hidden. AI classification is the default mode; the fallback is business
continuity, not the normal path.

## Run it

AI classification (Bedrock) is the default mode. Configure AWS credentials and:

```bash
cd backend
pip install -r requirements.txt
export AWS_REGION=us-east-1
export CONDUCTOR_MODEL_ID=amazon.nova-lite-v1:0   # or claude-3-5-haiku, deepseek
uvicorn app.main:app --reload --port 8000
```

Cheap, fast, JSON-reliable models are preferred — the model's only job is the
structured judgment, so classification reliability matters more than raw power.
Bedrock model access must be enabled in your account/region.

Endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | liveness + whether the live model is enabled |
| `GET /api/inbox` | the seeded bilingual sample inbox |
| `GET /api/process-stream` | **SSE** — autonomously drain the inbox, live |
| `POST /api/process` | process one ad-hoc request |
| `GET /api/dashboard` | operations summary (volume, urgency mix, escalations) |
| `GET /api/audit` | full audit trail, most recent first |
| `POST /api/override` | management override of a case |
| `POST /api/reset` | clear the audit log for a clean demo |

## Next.js operations UI

The `frontend/` folder contains the operations console for the demo. It is a
standalone Next.js App Router application styled with local shadcn/ui-style
components, a Notion-like operations workspace layout, and restrained
TeleMedik-inspired teal/blue healthcare accents.

Run the frontend after the FastAPI backend is available:

```bash
cd frontend
npm install
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 npm run dev
```

UI coverage:

- Live inbox board: **Incoming → Processing → Outcome**, driven by
  `GET /api/process-stream` SSE.
- Per-request detail sheet showing classification, urgency, confidence,
  language, rationale, branch actions, assigned team, SLA/follow-up, generated
  draft response, and escalation reason.
- Operations dashboard with processed volume, urgency mix, type mix, pending
  human review count, average confidence, backend health, and classifier mode.
- Escalations / needs-review queue for clinical and low-confidence cases.
- Management override control calling `POST /api/override`.
- Ad-hoc request form calling `POST /api/process`, including demo shortcuts for
  Spanish benefits, clinical escalation, and billing dispute examples.

## Resilience fallback (offline / model-outage mode)

If the live model errors or times out, the system automatically falls back to a
deterministic rule layer so the queue keeps moving — and flags the fallback in
each affected request's rationale. To force this mode (e.g. a no-credentials dry
run or to demonstrate business continuity):

```bash
export CONDUCTOR_USE_BEDROCK=0
```

This is a safeguard, not the normal path: by default the system classifies with
AI.

## Configuration

All tunables live in `app/config.py` (env-overridable): `CONDUCTOR_CONF_THRESHOLD`,
`CONDUCTOR_PROCESS_DELAY` (demo pacing), `CONDUCTOR_MODEL_ID`, `CONDUCTOR_DB_PATH`.

## Verification status

The full pipeline (routing, branches, gates, audit, SSE) was verified end-to-end
in the offline build environment using the **resilience fallback** classifier
(no AWS credentials available there): all 12 sample requests process, all five
branches fire, both languages classify correctly, both safety gates trigger
(clinical: REQ-1005/1011; low-confidence: REQ-1008), the SSE stream emits
per-request decisions + live dashboard, and the audit log is written and
queryable. **The primary Bedrock AI path is env-gated and must still be tested
with live AWS credentials** before the demo (confirm model id, region, and JSON
reliability under the chosen model).

## Sample data

`backend/data/sample_requests.json` — 12 synthetic bilingual requests covering
every branch plus clinical and low-confidence edge cases. No real or proprietary
patient data is used.

---

### Remaining final artifacts
- **Five-slide summary deck** + 3-minute demo script.
- Clean screenshots or saved sample outputs from the operations UI once the
  final demo run is recorded.

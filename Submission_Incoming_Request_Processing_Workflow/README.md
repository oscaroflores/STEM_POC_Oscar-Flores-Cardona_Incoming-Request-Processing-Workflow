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
> request type. A deterministic workflow engine does everything else: routing, drafting,
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
   needing clinical decision-making is never auto-resolved or routed to a standard
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
Sample inbox / API / request factory ─▶ Inbox queue
                                      └▶ Orchestrator (autonomous, one request at a time)
            │
            ├─▶ classify()      → type_decision {type, urgency, confidence,
            │   (Bedrock AI only)  language, clinical_flag, phi_present,
            │                      rationale, key_entities}
            │
            ├─▶ safety gates    → clinical? low-confidence? → force human review
            │
            ├─▶ remediate()     → branch-specific handoff package
            │                      (team, ordered actions, bilingual draft, SLA)
            │
            └─▶ audit.record()  → SQLite case store + append-only audit log
```

The classifier has one implementation behind the `type_decision` contract: a
live **Bedrock** call (`boto3` Converse API, model-agnostic, structured JSON).
AI classifies every request, as the brief requires. If the model is unavailable
or returns invalid output, the API surfaces the failure instead of substituting
keyword heuristics. That keeps classification provenance honest for the demo and
for audit review.

The optional request factory uses the same Bedrock integration for synthetic
request generation, but it does not classify or remediate. It only writes
healthcare-safe synthetic inbox items through `POST /api/inbox`; the normal
orchestrator, safety gates, branch logic, and audit trail handle them afterward.

## SQLite database

Conductor uses local SQLite storage through Python's built-in `sqlite3` module —
no external database service or ORM is required for the demo. The database file
defaults to `conductor_audit.db` and can be moved with `CONDUCTOR_DB_PATH`.

Persisted tables:

| Table | Purpose |
| --- | --- |
| `inbox_requests` | Durable sample/ad-hoc inbox items and queue status. |
| `cases` | One current operational case record per processed request. |
| `case_actions` | Ordered branch-specific downstream actions for each case. |
| `case_overrides` | Supervisor override action and note history. |
| `audit_log` | Append-only compliance trail for every processing run. |

This lets the operations dashboard, processed case board, escalation queue, and
management override notes survive a browser refresh while preserving the
append-only audit record needed for review.

## Run it

AI classification through Bedrock is required. Configure AWS credentials and:

```bash
cd Submission_Incoming_Request_Processing_Workflow
pip install -r requirements.txt
export AWS_REGION=us-east-1
export CONDUCTOR_MODEL_ID=amazon.nova-lite-v1:0   # or claude-3-5-haiku, deepseek
uvicorn main:app --reload --port 8000
```

Cheap, fast, JSON-reliable models are preferred — the model's only job is the
structured request type, so classification reliability matters more than raw power.
Bedrock model access must be enabled in your account/region.

### Run backend + SQLite in Docker

For local deployment, the preferred path is Docker Compose. The FastAPI backend
owns the SQLite file and persists it to `data/db/conductor_audit.db`; a separate
SQLite web UI mounts the same file for inspection during the demo.

Configure AWS credentials in your shell or use an AWS profile from `~/.aws`:

```bash
cd Submission_Incoming_Request_Processing_Workflow
export AWS_REGION=us-east-1
export AWS_PROFILE=default
export CONDUCTOR_MODEL_ID=amazon.nova-lite-v1:0
docker compose up --build
```

Services:

| Service | URL | Purpose |
| --- | --- | --- |
| FastAPI backend | `http://localhost:8000` | Workflow API, Bedrock classifier, SQLite owner. |
| SQLite web UI | `http://localhost:8080` | Inspect `inbox_requests`, `cases`, `case_actions`, `case_overrides`, and `audit_log`. |

The database persists on the host at:

```text
data/db/conductor_audit.db
```

Reset the local demo database through the API:

```bash
curl -X POST http://localhost:8000/api/reset
```

### Opt-in request factory

The request factory is a separate worker microservice that creates synthetic
healthcare contact-center requests with Bedrock and queues them into the same
inbox used by the operations UI. It is opt-in so the controlled sample demo does
not change unless you explicitly start it:

```bash
docker compose --profile factory up --build
```

Factory behavior:

- Code chooses the request category and language with a seeded RNG.
- Bedrock writes the actual synthetic member request for that chosen category.
- The worker posts to `POST /api/inbox`; it never writes SQLite directly.
- The existing live board and `GET /api/process-stream` process generated items
  through the same classifier, remediation branches, and audit trail.

Useful factory environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `REQUEST_FACTORY_SEED` | `20260616` | Seed for category/language selection. |
| `REQUEST_FACTORY_MIN_INTERVAL_SECONDS` | `4` | Minimum random delay between generated requests. |
| `REQUEST_FACTORY_MAX_INTERVAL_SECONDS` | `20` | Maximum random delay between generated requests. |
| `REQUEST_FACTORY_INTERVAL_SECONDS` | unset | Optional fixed-delay override; when set, random min/max timing is ignored. |
| `REQUEST_FACTORY_MAX_REQUESTS` | `12` | Number to generate; `0` means run continuously. |
| `REQUEST_FACTORY_MODEL_ID` | `CONDUCTOR_MODEL_ID` | Optional separate Bedrock model for generation. |
| `REQUEST_FACTORY_CATEGORY_WEIGHTS` | built-in balanced mix | Comma list such as `complaint=2,benefits_enquiry=3,service_request=3,billing_dispute=2,clinical_urgent=1`. |
| `REQUEST_FACTORY_LANGUAGE_WEIGHTS` | `en=1,es=1` | Comma list such as `en=1,es=2`. |

Example: generate 25 mostly Spanish requests, with 5-12 seconds between each:

```bash
REQUEST_FACTORY_MAX_REQUESTS=25 \
REQUEST_FACTORY_MIN_INTERVAL_SECONDS=5 \
REQUEST_FACTORY_MAX_INTERVAL_SECONDS=12 \
REQUEST_FACTORY_LANGUAGE_WEIGHTS=en=1,es=3 \
docker compose --profile factory up --build
```

For a fixed interval instead of a random range, set
`REQUEST_FACTORY_INTERVAL_SECONDS` explicitly.

If you prefer AWS access keys instead of a profile, export
`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, and optional `AWS_SESSION_TOKEN`
before running Compose. Avoid editing rows in SQLite web while the SSE demo is
actively processing requests.

Endpoints:

| Endpoint | Purpose |
| --- | --- |
| `GET /health` | liveness + active classifier mode/model id |
| `GET /api/inbox` | the seeded bilingual sample inbox |
| `POST /api/inbox` | queue one generated/manual request for later processing |
| `GET /api/cases` | persisted processed case records |
| `GET /api/overrides` | latest management override note per case |
| `GET /api/process-stream` | **SSE** — autonomously drain the inbox, live |
| `POST /api/process` | process one ad-hoc request |
| `GET /api/dashboard` | operations summary (volume, urgency mix, escalations) |
| `GET /api/audit` | full audit trail, most recent first |
| `POST /api/override` | management override of a case |
| `POST /api/reset` | reset demo database state and reseed the sample inbox |

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
  human review count, average confidence, backend health, and AI classifier mode.
- Escalations / needs-review queue for clinical and low-confidence cases.
- Management override control calling `POST /api/override`.
- Ad-hoc request form calling `POST /api/process`, including demo shortcuts for
  Spanish benefits, clinical escalation, and billing dispute examples.

## AI classification requirement

There is no offline deterministic classifier. Processing requires Bedrock model
access in the configured AWS account and region. Model errors, credential issues,
or invalid JSON responses should be treated as operational failures to fix before
the demo, not silently hidden behind heuristic routing.

## Configuration

Core workflow tunables live in `config.py` (env-overridable):
`CONDUCTOR_CONF_THRESHOLD`, `CONDUCTOR_PROCESS_DELAY` (demo pacing),
`CONDUCTOR_MODEL_ID`, `CONDUCTOR_LLM_TIMEOUT`, `CONDUCTOR_DB_PATH`.

The request factory is configured directly through environment variables in
`docker-compose.yml`: `REQUEST_FACTORY_SEED`, random interval min/max, optional
fixed interval override, max generated requests, category weights, language
weights, and optional separate generation model id.

## Verification status

The deterministic remediation pipeline (branches, gates, audit, SSE envelope)
has been verified structurally in the local build environment. Full end-to-end
request processing now requires live Bedrock credentials because classification
is AI-only. Before recording the demo, run the 12-request sample inbox with the
target model and confirm all five branches fire, both languages classify
correctly, both safety gates trigger (clinical: REQ-1005/1011; low-confidence:
REQ-1008), the SSE stream emits per-request decisions + live dashboard, and the
audit log is written and queryable.

## Sample data

`data/sample_requests.json` — 12 synthetic bilingual requests covering
every branch plus clinical and low-confidence edge cases. No real or proprietary
patient data is used.

---

### Remaining final artifacts
- **Five-slide summary deck** + 3-minute demo script.
- Clean screenshots or saved sample outputs from the operations UI once the
  final demo run is recorded.

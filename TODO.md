# TODO — TeleMedik POC Final Submission

**Project:** Conductor — AI Intake Manager
**Deadline:** end of **Tuesday, June 16, 2026** (~2 days out as of Sun Jun 14)
**Submission email subject:** `STEM_POC_Oscar Flores Cardona_Incoming Request Processing Workflow`
**Send to:** sonia.montes@telemedik.com · **cc:** nina.dueno@telemedik.com

Legend: `[x]` done · `[ ]` todo · `[~]` partial · `[?]` decision needed

---

## ✅ Done

- [x] Backend engine: Bedrock AI classifier, 5 branches, 2 safety gates, audit log, orchestrator
- [x] FastAPI API incl. live SSE inbox-draining stream
- [x] SQLite operational database: durable inbox state, processed cases, ordered case actions, supervisor overrides, and append-only audit log
- [x] Docker Compose local deployment: FastAPI backend + persistent SQLite bind mount + SQLite web UI
- [x] Bilingual sample inbox (12 requests, all branches + clinical + low-confidence edge cases)
- [x] README v1 (thesis, architecture, branch table, run instructions)
- [x] Deterministic classifier removed; classification is Bedrock AI-only to align with the brief's "must use AI to classify" requirement
- [x] Standalone **Next.js operations UI** created in `Submission_Incoming_Request_Processing_Workflow/frontend/`
- [x] Request History page combines live inbox, current cases, audit history, and supervisor override controls in one compliance workspace
- [x] Frontend checks passed: `npm run typecheck`, `npm run build`, `npm audit --omit=dev`
- [x] README updated with frontend setup and UI coverage notes
- [x] README updated with SQLite database schema, endpoints, and reset behavior
- [x] README updated with Docker Compose backend/database deployment steps
- [x] Git repository initialized at project root with first commit `771e034 Initial Conductor POC implementation`

---

## 1. Working Demo  *(rubric: reliability + output clarity, 30%)*

- [x] **Next.js operations UI** — the main missing piece:
  - [x] Live inbox board: Incoming → Processing → Outcome, animated via SSE
  - [x] Per-request card: type, urgency, confidence, language, rationale, action steps, draft
  - [x] Operations dashboard: volume by type, urgency mix, pending escalations, avg confidence
  - [x] Escalations / Needs-Review queue (clinical + low-confidence cases)
  - [x] Management override control (calls `POST /api/override`)
  - [x] Ad-hoc request form (live typed input → `POST /api/process`)
  - [x] Request History / supervisor compliance log (review AI decision, rationale, generated actions, human-review/PHI/clinical flags, and record overrides)
- [~] Wire frontend to backend (base URL/env + persisted `/api/cases` and `/api/overrides` implemented; run live backend + frontend together and verify SSE/process/override)
- [~] Polish pass: branding, healthcare-ops look, bilingual labels (Notion-style UI implemented; exact TeleMedik brand tokens still need manual visual confirmation)
- [ ] Capture UI screenshots after a clean live run: board, detail sheet, dashboard, escalation queue
- [ ] **3-minute screen recording** following the demo script (show ≥3 branches incl. a Spanish request + a clinical escalation)
- [ ] Decide demo delivery: hosted link vs. recording vs. both

## 2. Five-Slide Summary Deck  *(rubric: communication, 15%)*

- [ ] Build deck (PDF or PPTX, exactly 5 slides, fixed structure):
  - [ ] S1 — Problem Understanding & Objective
  - [ ] S2 — Solution Architecture & Design Flow (incl. classification + branch diagram)
  - [ ] S3 — Implementation Highlights (AI-reasons/rules-act, gates, code/UI screenshots)
  - [ ] S4 — Challenges & Learnings (reliability, model dependency, human oversight trade-offs)
  - [ ] S5 — Demo Summary & Next Steps (links + enhancements)
- [ ] Create the architecture/branch diagram asset for S2
- [ ] Demo script / walkthrough outline (business-story framing, < 3 min)

## 3. Supporting Assets

- [x] Sample input requests (≥1 per branch) — `data/sample_requests.json`
- [x] README (workflow design, remediation strategies, tools)
- [~] Sample outputs/logs — SQLite write path verified in terminal; **need clean per-branch output screenshots or a saved log file** as an artifact
- [~] Update README with frontend setup + screenshots once UI exists (setup added; screenshots still needed)
- [ ] Add frontend screenshots or saved output artifacts to the final package
- [~] GitHub repo (push) and/or hosted app link (local git repo initialized and committed; remote/published link still needed if selected)
- [ ] Optional: workflow export note (n/a — custom code, document the repo instead)

---

## Decisions needed `[?]`

- [?] **LLM-generated drafts vs. templated drafts** — currently templated (safe/consistent). Decide whether to optionally have Bedrock generate acknowledgements for a stronger demo.
- [x] ~~**Live Bedrock in the demo** vs. deterministic~~ — RESOLVED: classification is Bedrock AI-only. Record the demo with the live model on. (Live-path test still tracked under Blockers.)
- [X] **Product name** — "Conductor" is a placeholder; confirm or rename.
- [?] **Hosting** — local-only (matches the "runs on local compute / data stays on-prem" privacy story) vs. deploy a hosted link for judges.

## Blockers / external dependencies

- [x] Confirm backend package structure is complete before live UI verification. Root modules import correctly through `.venv/bin/python`.
- [ ] **Test the live Bedrock path** with real AWS creds (could not be exercised in the offline build env) — confirm model id, region, JSON reliability under the chosen model
- [ ] Confirm AWS Bedrock model access is enabled in the target account/region

---

## Final verification (before sending) — from AGENTS.md

- [ ] Run app locally; process every branch; confirm classification/urgency/actions/outputs
- [ ] Run FastAPI backend and Next.js frontend together
- [ ] Confirm frontend live board drains the inbox through SSE
- [ ] Confirm ad-hoc request form calls `POST /api/process` successfully
- [ ] Confirm management override calls `POST /api/override` successfully
- [x] Confirm frontend checks pass: `npm run typecheck`, `npm run build`, `npm audit --omit=dev`
- [x] Confirm SQLite schema initializes and sample inbox seeds locally
- [x] Confirm SQLite write path for cases, actions, overrides, dashboard summary, and append-only audit rows using a temporary database
- [x] Confirm Docker Compose launches backend and SQLite web UI locally
- [ ] Confirm live Bedrock-processed SQLite rows after a real end-to-end UI run
- [ ] Confirm README setup steps are accurate
- [ ] Confirm deck matches the required 5-slide structure
- [ ] Confirm no real/proprietary patient data anywhere
- [ ] Document any feature depending on an optional API key
- [ ] Confirm git status is clean or only contains intentionally uncommitted final artifacts
- [ ] Assemble submission package + send email with correct subject/recipients

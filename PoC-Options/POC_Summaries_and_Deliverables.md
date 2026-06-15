# Proof of Concept Summaries and Deliverables

This file summarizes the four proof-of-concept briefs found in the source `.docx` files in this directory.

## 1. Intelligent Customer Signal Detector

### Summary

Build an AI prototype for a customer operations or retention team that analyzes customer interaction data and surfaces early warning signals. The prototype should help identify at-risk customers or emerging issues before they escalate into complaints, cancellations, or formal escalations.

The solution should correlate signals from sources such as support transcripts, customer feedback, complaints, billing records, satisfaction scores, or usage patterns. The intended business value is proactive intervention: giving operations teams a prioritized view of customers who need attention and explaining why they were flagged.

### Core Prototype Deliverable

- Accept customer data inputs, such as structured records, text transcripts, or both.
- Analyze sentiment, behavior patterns, or other risk signals.
- Generate a prioritized list of at-risk customers or flagged issues.
- Include reasoning for each flag so an operations team can understand the signal.

### Expected Output

- Flagged customer or issue.
- Risk or urgency score.
- Brief AI-generated rationale.
- Clear signal summary suitable for a customer operations or retention team.

### Optional Enhancements

- Multi-signal correlation, such as sentiment plus billing behavior.
- Visual risk heatmap.
- Suggested retention action for each flagged customer.

### Required Submission Deliverables

- Working demo showing: data input -> AI analysis -> signal summary output.
- Hosted application link or screen recording of up to 3 minutes.
- Five-slide summary deck:
  - Problem understanding and objective.
  - Solution architecture and design flow.
  - Implementation highlights.
  - Challenges and learnings.
  - Demo summary and next steps.
- README with approach, tools used, assumptions, and one input/output example.
- Supporting assets such as sample input data and output screenshots.
- Optional GitHub repository or workspace link.

### Evaluation Focus

- Signal detection logic and AI reasoning quality: 40%.
- Clarity and usefulness of the output for operational decision-making: 30%.
- Communication clarity and presentation structure: 15%.
- Creativity, initiative, and reflection in documentation: 15%.

## 2. Incoming Request Processing Workflow

### Summary

Build an AI-powered workflow that receives incoming requests, classifies them by type and urgency, and triggers a distinct remediation path for each classification. The prototype should show more than a generic AI response: it must demonstrate branching logic and downstream actions based on the request type.

The target user is an operations team handling emails, web forms, shared inboxes, customer queries, complaints, service requests, or escalations. The business goal is to reduce manual triage, improve consistency, and make request handling faster and more auditable.

### Core Prototype Deliverable

- Accept an incoming request through a form, file upload, simulated inbox, or similar input.
- Use AI to classify the request type and urgency.
- Branch into a type-specific remediation workflow.
- Execute at least two downstream steps per branch, such as:
  - Drafting a tailored response.
  - Routing to a team.
  - Setting a follow-up flag.
  - Escalating a case.
  - Logging the outcome.
- Support at least three distinct request types, each with its own remediation strategy.

### Expected Output

For each processed request, produce:

- Classification label.
- Urgency level.
- Branch-specific action summary.
- Generated response, routing notification, follow-up task, escalation notice, or case log entry.
- Output that is legible and useful for an operations team.

### Example Branches

- Complaint, high urgency: acknowledge receipt, escalate, log priority case, set follow-up reminder.
- General enquiry, low urgency: classify sub-topic, generate response, send or stage response, log as resolved.
- Service request, medium urgency: extract required details, route to department, generate confirmation, set SLA timer.
- Escalation or urgent request, critical urgency: flag for human review, draft urgent acknowledgement, notify supervisor, pause auto-resolution.

### Optional Enhancements

- Batch processing of multiple requests.
- Processing log or audit trail.
- Dashboard showing request volume by type and status.
- Escalation override when AI confidence is low.

### Required Submission Deliverables

- Working demo showing: incoming request -> classification -> branch-specific remediation -> outputs.
- Shared workflow link, hosted application, or screen recording of up to 3 minutes.
- Demo must show at least three request types, each triggering a distinct branch.
- Five-slide summary deck:
  - Problem understanding and objective.
  - Solution architecture and design flow.
  - Implementation highlights.
  - Challenges and learnings.
  - Demo summary and next steps.
- README with setup instructions, workflow design notes, classification logic, and remediation strategy per branch.
- Sample input requests, at least one per branch type.
- Output screenshots or logs.
- Optional workflow export JSON or GitHub repository.

### Evaluation Focus

- Classification accuracy, branching logic, and remediation strategy quality: 40%.
- End-to-end reliability and clarity of outputs for operations users: 30%.
- Communication clarity and presentation structure: 15%.
- Creativity in remediation design, edge case handling, and reflection: 15%.

## 3. Financial Risk Signal Aggregator

### Summary

Build an AI prototype for a financial services risk or compliance team that ingests structured and unstructured financial data and produces a consolidated risk summary. The prototype should synthesize fragmented signals from transaction records, account activity, external alerts, customer records, or similar sources.

The goal is to reduce manual review effort and help analysts focus on the highest-priority risks by identifying patterns, anomalies, and explainable risk indicators across multiple data inputs.

### Core Prototype Deliverable

- Accept financial data inputs such as CSV, JSON, or pasted text.
- Identify key risk signals, anomalies, or suspicious patterns.
- Generate a prioritized risk summary with reasoning.
- Present findings clearly for a compliance or risk audience.

### Expected Output

- Flagged item or account.
- Risk score or priority ranking.
- Brief AI-generated rationale for each finding.
- Consolidated risk summary that helps analysts decide what to review first.

### Optional Enhancements

- Multi-source data correlation.
- Visual risk dashboard.
- Natural language query interface for interrogating the risk data.

### Required Submission Deliverables

- Working demo showing: data input -> AI analysis -> risk summary output.
- Hosted application link or screen recording of up to 3 minutes.
- Five-slide summary deck:
  - Problem understanding and objective.
  - Solution architecture and design flow.
  - Implementation highlights.
  - Challenges and learnings.
  - Demo summary and next steps.
- README with approach, tools used, data assumptions, and one input/output example.
- Sample input dataset and output screenshots.
- Optional GitHub repository or workspace link.

### Evaluation Focus

- Data integration and AI reasoning quality, including accuracy of risk signals: 40%.
- Relevance, clarity, and prioritization quality of the risk summary: 30%.
- Communication clarity and presentation structure: 15%.
- Creativity, initiative, and reflection in documentation: 15%.

## 4. Clinical Document Intelligence Hub

### Summary

Build an AI prototype that ingests unstructured clinical documents and converts them into structured, actionable intelligence. The prototype should help clinical or administrative teams reduce manual document review and produce consistent, decision-ready summaries.

The target input can include intake forms, discharge summaries, lab reports, physician notes, PDFs, images, or pasted clinical text. The prototype should extract relevant information and present a useful clinical or administrative output, such as a summary card, risk flag, or recommended next step.

### Core Prototype Deliverable

- Accept clinical document inputs such as text, PDF, or image.
- Extract key structured information.
- Generate a clear, readable summary or recommendation.
- Present the output in a format suitable for a healthcare context.

### Expected Output

- Structured patient summary card, risk flag, or recommended next step.
- Extracted fields relevant to the chosen document type.
- Clear summary for clinical or administrative users.
- Enough explanation or confidence context to support review.

### Optional Enhancements

- Confidence scoring on extracted fields.
- Multi-document comparison.
- Simple triage or routing logic.

### Required Submission Deliverables

- Working demo showing: document input -> AI processing -> structured output.
- Hosted application link or screen recording of up to 3 minutes.
- Five-slide summary deck:
  - Problem understanding and objective.
  - Solution architecture and design flow.
  - Implementation highlights.
  - Challenges and learnings.
  - Demo summary and next steps.
- README with approach, AI models or tools used, assumptions, and one input/output example.
- Sample input and output as screenshots or text.
- Optional GitHub repository or workspace link.

### Evaluation Focus

- AI integration quality and usefulness of extracted or generated output: 40%.
- Relevance, clarity, and quality of clinical reasoning in the structured output: 30%.
- Communication clarity and presentation structure: 15%.
- Creativity, initiative, and reflection in documentation: 15%.

## Common Submission Checklist

- Build and demonstrate a working end-to-end prototype within 5 days.
- Use public, synthetic, or AI-generated sample data only; no proprietary client data is required.
- Submit a hosted demo link, shared workflow link, or screen recording of up to 3 minutes.
- Submit a five-slide deck in PowerPoint or PDF format.
- Include a README with setup instructions, design notes, assumptions, tools used, and at least one example input/output.
- Include supporting assets such as sample data, screenshots, logs, or workflow exports.
- Deliver the package before midnight on the fifth day after receiving the brief.

# Submission Email Draft

**To:** sonia.montes@telemedik.com  
**Cc:** nina.dueno@telemedik.com  
**Subject:** STEM_POC_Oscar Flores Cardona_Incoming Request Processing Workflow

## Email Body

Dear Sonia,

I hope you are doing well.

Please find my final submission for the FirstSource / TeleMedik Proof of Concept stage. I selected and completed the **Incoming Request Processing Workflow** option.

My prototype is titled **Conductor - AI Intake Manager for Healthcare Contact Centers**. It is an AI-assisted operations workflow that receives mixed inbound healthcare contact-center requests, masks PHI at intake, classifies each request by type and urgency, and routes it into a branch-specific remediation workflow with audit-ready outputs for an operations team.

Submission materials:

- **Demo walkthrough:** [INSERT DEMO VIDEO LINK]
- **Five-slide summary deck:** attached as `[INSERT DECK FILE NAME]`
- **Source code / repository:** [INSERT REPOSITORY LINK]
- **Supporting README and setup notes:** included in the repository at `Submission_Incoming_Request_Processing_Workflow/README.md`
- **Synthetic sample requests:** included at `Submission_Incoming_Request_Processing_Workflow/data/sample_requests.json`

The prototype demonstrates the required workflow capabilities:

- Intake through a simulated inbox and ad-hoc request form.
- AI classification by request type and urgency using AWS Bedrock.
- Separate remediation branches for complaint, benefits enquiry, service request, billing dispute, and clinical/urgent escalation cases.
- At least two downstream actions per branch, including draft acknowledgements, team routing, SLA/follow-up flags, escalation notices, and case log entries.
- Legible operations outputs through a Next.js dashboard, live inbox board, escalation queue, case detail view, management override control, and audit log.

I also added healthcare operations safeguards beyond the minimum brief:

- PHI/PII tokenization before classification or operational persistence.
- A separate PHI vault owned by an internal masking service.
- Role-gated PHI reveal flow for supervisors, with access logging.
- Human-in-the-loop routing for clinical, urgent, sensitive, or low-confidence requests.
- Classification confidence, rationale, audit trail, SLA/follow-up markers, and bilingual Spanish/English sample handling.
- Healthcare-safe wording that avoids clinical diagnosis or treatment guidance.

The implementation uses a FastAPI backend, an internal FastAPI PHI masking service, AWS Bedrock for classification, AWS Comprehend and Comprehend Medical for PHI/PII detection, SQLite for operational audit state, Docker Compose for local deployment, and a Next.js operations UI.

All sample data is synthetic. No real patient data or proprietary information is included.

Thank you for the opportunity to participate in this stage. I appreciate the chance to demonstrate a practical AI workflow automation prototype aligned with healthcare contact center operations, escalation, auditability, service quality, and human oversight.

Best regards,

Oscar Flores Cardona

## Final Send Checklist

- Replace `[INSERT DEMO VIDEO LINK]` with the final screen recording or hosted demo link.
- Replace `[INSERT DECK FILE NAME]` with the actual five-slide deck attachment name.
- Replace `[INSERT REPOSITORY LINK]` with the GitHub repository link, if using one.
- Attach the five-slide summary deck.
- Attach or link the demo walkthrough.
- Confirm the README and sample request files are present in the submitted repository/package.
- Keep the subject exactly as written above.

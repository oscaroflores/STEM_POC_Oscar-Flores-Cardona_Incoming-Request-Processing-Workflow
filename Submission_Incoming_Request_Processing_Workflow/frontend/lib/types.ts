export type RequestType =
  | "complaint"
  | "benefits_enquiry"
  | "service_request"
  | "billing_dispute"
  | "clinical_urgent";

export type Urgency = "low" | "medium" | "high" | "critical";
export type Language = "en" | "es";

export type IncomingRequest = {
  id: string;
  channel: string;
  member_name?: string | null;
  subject: string;
  body: string;
};

export type Judgment = {
  type: RequestType;
  urgency: Urgency;
  confidence: number;
  language: Language;
  clinical_flag: boolean;
  phi_present: boolean;
  rationale: string;
  key_entities: Record<string, unknown>;
  source: string;
};

export type Action = {
  step: string;
  detail: string;
};

export type RemediationResult = {
  request_id: string;
  branch: RequestType;
  urgency: Urgency;
  assigned_team: string;
  actions: Action[];
  draft_response: string;
  follow_up?: string | null;
  sla?: string | null;
  requires_human_review: boolean;
  escalation_reason?: string | null;
};

export type ProcessedRequest = {
  request: IncomingRequest;
  judgment: Judgment;
  remediation: RemediationResult;
  processed_at: string;
};

export type DashboardSummary = {
  total_processed: number;
  by_type: Partial<Record<RequestType, number>>;
  by_urgency: Partial<Record<Urgency, number>>;
  pending_human_review: number;
  avg_confidence: number | null;
  generated_at: string;
};

export type HealthStatus = {
  status: string;
  live_model_enabled: boolean;
  model_id: string | null;
  confidence_threshold: number;
};

export type StreamPayload =
  | {
      index: number;
      total: number;
      result: ProcessedRequest;
      dashboard: DashboardSummary;
      done?: never;
    }
  | { done: true };

export type OverridePayload = {
  request_id: string;
  action: "approve" | "reassign" | "send_to_human";
  note: string;
};

export type OverrideResult = OverridePayload & {
  status: string;
};

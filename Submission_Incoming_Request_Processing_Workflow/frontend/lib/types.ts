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
  mask_id?: string | null;
  member_name?: string | null;
  subject: string;
  body: string;
  entities?: Record<string, unknown>;
  phi?: PhiSummary;
};

export type PhiSummary = {
  count: number;
  tokens: string[];
  kinds: Record<string, number>;
};

export type TypeDecision = {
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

export type AuditEntry = {
  id: number;
  request_id: string;
  processed_at: string;
  channel?: string | null;
  mask_id?: string | null;
  member_name?: string | null;
  request_subject?: string | null;
  request_body?: string | null;
  entities_json?: string | null;
  phi_json?: string | null;
  type: RequestType;
  urgency: Urgency;
  confidence: number | null;
  language?: Language | null;
  clinical_flag: number | boolean;
  phi_present: number | boolean;
  rationale?: string | null;
  classifier_source?: string | null;
  assigned_team?: string | null;
  requires_human_review: number | boolean;
  escalation_reason?: string | null;
  actions_json?: string | null;
  draft_response?: string | null;
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
  type_decision: TypeDecision;
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
  classifier_mode: string;
  model_id: string;
  confidence_threshold: number;
};

export type MaskingHealth = {
  status: string;
  service: string;
  aws_region: string;
  min_score: number;
  tokens_vaulted: number;
  requests_masked: number;
};

export type PhiAccessEntry = {
  id: number;
  mask_id: string;
  token?: string | null;
  actor_role: string;
  reason?: string | null;
  authorized: number | boolean;
  accessed_at: string;
};

export type MaskingResolveResult = {
  authorized: boolean;
  revealed: null | { token: string; kind: string; value: string } | Array<{ token: string; kind: string; value: string }>;
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
  created_at: string;
};

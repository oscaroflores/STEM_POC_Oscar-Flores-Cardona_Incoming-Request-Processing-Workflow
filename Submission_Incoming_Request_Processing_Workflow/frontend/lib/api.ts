import type {
  AuditEntry,
  DashboardSummary,
  HealthStatus,
  IncomingRequest,
  MaskingHealth,
  MaskingResolveResult,
  OverridePayload,
  OverrideResult,
  PhiAccessEntry,
  ProcessedRequest,
} from "@/lib/types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:8000";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`${response.status} ${response.statusText}${detail ? `: ${detail}` : ""}`);
  }

  return response.json() as Promise<T>;
}

function withRole(path: string, role = "agent") {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}role=${encodeURIComponent(role)}`;
}

export function getHealth() {
  return requestJson<HealthStatus>("/health", { cache: "no-store" });
}

export function getInbox(role = "agent") {
  return requestJson<IncomingRequest[]>(withRole("/api/inbox", role), { cache: "no-store" });
}

export function getDashboard(role = "agent") {
  return requestJson<DashboardSummary>(withRole("/api/dashboard", role), { cache: "no-store" });
}

export function getCases(role = "agent") {
  return requestJson<ProcessedRequest[]>(withRole("/api/cases", role), { cache: "no-store" });
}

export function getOverrides(role = "agent") {
  return requestJson<Record<string, string>>(withRole("/api/overrides", role), { cache: "no-store" });
}

export function getAudit(role = "agent") {
  return requestJson<AuditEntry[]>(withRole("/api/audit", role), { cache: "no-store" });
}

export function getMaskingHealth() {
  return requestJson<MaskingHealth>("/api/masking/health", { cache: "no-store" });
}

export function getPhiAccessLog(role = "agent") {
  return requestJson<PhiAccessEntry[]>(withRole("/api/phi-access-log", role), { cache: "no-store" });
}

export function resolveMasking(payload: { mask_id: string; token?: string; role: string; reason: string }) {
  return requestJson<MaskingResolveResult>("/api/masking/resolve", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function processRequest(payload: IncomingRequest) {
  return requestJson<ProcessedRequest>("/api/process", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function recordOverride(payload: OverridePayload) {
  return requestJson<OverrideResult>("/api/override", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resetAuditLog() {
  return requestJson<{ status: string }>("/api/reset", { method: "POST" });
}

export function streamUrl(role = "agent") {
  return `${API_BASE_URL}${withRole("/api/process-stream", role)}`;
}

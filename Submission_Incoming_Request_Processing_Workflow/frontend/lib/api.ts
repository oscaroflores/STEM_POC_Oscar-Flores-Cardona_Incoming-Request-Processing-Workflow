import type {
  DashboardSummary,
  HealthStatus,
  IncomingRequest,
  OverridePayload,
  OverrideResult,
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

export function getHealth() {
  return requestJson<HealthStatus>("/health", { cache: "no-store" });
}

export function getInbox() {
  return requestJson<IncomingRequest[]>("/api/inbox", { cache: "no-store" });
}

export function getDashboard() {
  return requestJson<DashboardSummary>("/api/dashboard", { cache: "no-store" });
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

export function streamUrl() {
  return `${API_BASE_URL}/api/process-stream`;
}

import type * as React from "react";
import type { DashboardSummary } from "@/lib/types";

export function isJsonEqual<T>(current: T, next: T) {
  return JSON.stringify(current) === JSON.stringify(next);
}

export function isDashboardEqual(current: DashboardSummary, next: DashboardSummary) {
  const { generated_at: _currentGeneratedAt, ...currentStable } = current;
  const { generated_at: _nextGeneratedAt, ...nextStable } = next;
  return isJsonEqual(currentStable, nextStable);
}

export function setIfChanged<T, Next extends T>(
  setState: React.Dispatch<React.SetStateAction<T>>,
  next: Next,
  isEqual: (current: T, nextValue: Next) => boolean = isJsonEqual as (current: T, nextValue: Next) => boolean,
) {
  setState((current) => (isEqual(current, next) ? current : next));
}

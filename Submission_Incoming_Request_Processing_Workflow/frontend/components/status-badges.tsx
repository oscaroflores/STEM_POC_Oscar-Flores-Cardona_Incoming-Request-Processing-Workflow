import type { RequestType, Urgency } from "@/lib/types";
import { cn, titleize } from "@/lib/utils";

type FieldTone = "default" | "green" | "teal" | "amber" | "red" | "blue";

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return <StatusField label="Urgency" value={titleize(urgency)} attention={urgency === "high" || urgency === "critical"} />;
}

export function TypeBadge({ type }: { type: RequestType }) {
  return <StatusField label="Type" value={titleize(type)} attention={type === "clinical_urgent"} />;
}

export function LanguageBadge({ language }: { language: "en" | "es" }) {
  return <StatusField label="Language" value={language === "es" ? "Spanish" : "English"} />;
}

export function StatusField({
  label,
  value,
  tone = "default",
  attention = false,
  className,
}: {
  label: string;
  value: string;
  tone?: FieldTone;
  attention?: boolean;
  className?: string;
}) {
  const tones: Record<FieldTone, string> = {
    default: "border-border bg-card text-foreground",
    green: "border-emerald-200 bg-emerald-50 text-emerald-900",
    teal: "border-cyan-200 bg-cyan-50 text-cyan-950",
    amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-900",
    blue: "border-blue-200 bg-blue-50 text-blue-900",
  };

  return (
    <div className={cn("min-w-[84px] border px-2 py-1.5 text-left leading-none", tones[tone], className)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.14em] opacity-60">{label}</div>
      <div className="mt-1 flex min-w-0 items-center gap-1 text-xs font-semibold">
        {attention ? <span className="shrink-0 text-sm font-bold leading-none text-red-700">!</span> : null}
        <span className="truncate">{value}</span>
      </div>
    </div>
  );
}

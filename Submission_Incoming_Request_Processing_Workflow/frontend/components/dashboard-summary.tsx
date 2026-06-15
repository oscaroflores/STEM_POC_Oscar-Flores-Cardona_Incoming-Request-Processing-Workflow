import { Activity, AlertTriangle, BarChart3, Bot, DatabaseZap, ShieldCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import type { DashboardSummary as DashboardSummaryType, HealthStatus, RequestType, Urgency } from "@/lib/types";
import { formatPercent, titleize } from "@/lib/utils";

const requestTypes: RequestType[] = [
  "complaint",
  "benefits_enquiry",
  "service_request",
  "billing_dispute",
  "clinical_urgent",
];

const urgencyTypes: Urgency[] = ["critical", "high", "medium", "low"];

type DashboardSummaryProps = {
  dashboard: DashboardSummaryType;
  health: HealthStatus | null;
  isStreaming: boolean;
};

export function DashboardSummary({ dashboard, health, isStreaming }: DashboardSummaryProps) {
  const avgConfidence = dashboard.avg_confidence ?? 0;
  const highPriority = (dashboard.by_urgency.critical ?? 0) + (dashboard.by_urgency.high ?? 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <MetricCard icon={DatabaseZap} label="Processed" value={String(dashboard.total_processed)} tone="teal" />
        <MetricCard icon={AlertTriangle} label="Human review" value={String(dashboard.pending_human_review)} tone="red" />
        <MetricCard icon={Bot} label="Avg confidence" value={formatPercent(dashboard.avg_confidence)} tone="blue" />
        <MetricCard icon={Activity} label="High priority" value={String(highPriority)} tone="amber" />
      </div>

      <Card className="card-lift">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Classifier mode
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Backend</span>
            <span className="font-medium">{health?.status === "ok" ? "Connected" : "Waiting"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Live AI</span>
            <span className="font-medium">{health?.live_model_enabled ? "Bedrock primary" : "Fallback mode"}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="text-muted-foreground">Stream</span>
            <span className="font-medium">{isStreaming ? "Draining inbox" : "Idle"}</span>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Confidence threshold</span>
              <span>{formatPercent(health?.confidence_threshold)}</span>
            </div>
            <Progress value={(health?.confidence_threshold ?? 0) * 100} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <BarChart3 className="h-4 w-4 text-primary" />
            Queue mix
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Breakdown title="By type" items={requestTypes.map((type) => [titleize(type), dashboard.by_type[type] ?? 0])} total={dashboard.total_processed} />
          <Breakdown title="By urgency" items={urgencyTypes.map((urgency) => [titleize(urgency), dashboard.by_urgency[urgency] ?? 0])} total={dashboard.total_processed} />
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Average confidence</span>
              <span>{formatPercent(avgConfidence)}</span>
            </div>
            <Progress value={avgConfidence * 100} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, tone }: { icon: typeof Activity; label: string; value: string; tone: "teal" | "red" | "blue" | "amber" }) {
  const tones = {
    teal: "bg-cyan-50 text-cyan-800 border-cyan-100",
    red: "bg-red-50 text-red-800 border-red-100",
    blue: "bg-blue-50 text-blue-800 border-blue-100",
    amber: "bg-amber-50 text-amber-800 border-amber-100",
  };

  return (
    <Card className="card-lift">
      <CardContent className="p-4">
        <div className={`mb-3 inline-flex h-8 w-8 items-center justify-center rounded-md border ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}

function Breakdown({ title, items, total }: { title: string; items: [string, number][]; total: number }) {
  return (
    <div className="space-y-2">
      <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</div>
      {items.map(([label, count]) => {
        const width = total ? (count / total) * 100 : 0;
        return (
          <div key={label} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">{label}</span>
              <span className="font-medium">{count}</span>
            </div>
            <Progress value={width} className="h-1.5" />
          </div>
        );
      })}
    </div>
  );
}

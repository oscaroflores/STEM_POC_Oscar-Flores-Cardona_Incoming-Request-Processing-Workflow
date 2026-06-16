"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  Bot,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  FileWarning,
  GitBranch,
  HeartPulse,
  Inbox,
  Layers3,
  Mail,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RefreshCcw,
  Route,
  ShieldAlert,
  Square,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { AppRail } from "@/components/app-rail";
import { DashboardSummary } from "@/components/dashboard-summary";
import { EscalationQueue } from "@/components/escalation-queue";
import { RequestCard } from "@/components/request-card";
import { RequestDetailSheet } from "@/components/request-detail-sheet";
import { StatusField } from "@/components/status-badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { API_BASE_URL, getCases, getDashboard, getHealth, getInbox, getOverrides, recordOverride, resetAuditLog, streamUrl } from "@/lib/api";
import type { DashboardSummary as DashboardSummaryType, HealthStatus, IncomingRequest, OverridePayload, ProcessedRequest, RequestType, StreamPayload } from "@/lib/types";
import { cn, formatPercent, titleize } from "@/lib/utils";

const emptyDashboard: DashboardSummaryType = {
  total_processed: 0,
  by_type: {},
  by_urgency: {},
  pending_human_review: 0,
  avg_confidence: null,
  generated_at: new Date().toISOString(),
};

const POLL_INTERVAL_MS = 4000;

const branchNodes: Array<{
  type: RequestType | "human_review";
  title: string;
  caption: string;
  tone: "teal" | "green" | "amber" | "blue" | "red";
  icon: LucideIcon;
}> = [
  { type: "complaint", title: "Complaint", caption: "Senior handler + priority case log", tone: "amber", icon: AlertTriangle },
  { type: "benefits_enquiry", title: "Benefits Enquiry", caption: "Coverage draft + resolution note", tone: "green", icon: ClipboardCheck },
  { type: "service_request", title: "Service Request", caption: "Scheduling/service team handoff", tone: "teal", icon: Route },
  { type: "billing_dispute", title: "Billing Dispute", caption: "Billing queue + follow-up flag", tone: "blue", icon: FileWarning },
  { type: "clinical_urgent", title: "Clinical Urgent", caption: "Immediate supervisor notification", tone: "red", icon: HeartPulse },
  { type: "human_review", title: "Human Review Gate", caption: "Low confidence, sensitive, or clinical safety pause", tone: "red", icon: ShieldAlert },
];

export function OperationsConsole() {
  const [health, setHealth] = React.useState<HealthStatus | null>(null);
  const [dashboard, setDashboard] = React.useState<DashboardSummaryType>(emptyDashboard);
  const [incoming, setIncoming] = React.useState<IncomingRequest[]>([]);
  const [processed, setProcessed] = React.useState<ProcessedRequest[]>([]);
  const [processing, setProcessing] = React.useState<ProcessedRequest | null>(null);
  const [selected, setSelected] = React.useState<ProcessedRequest | null>(null);
  const [selectedIncoming, setSelectedIncoming] = React.useState<IncomingRequest | null>(null);
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [isIncomingSheetOpen, setIsIncomingSheetOpen] = React.useState(false);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [isAnalyticsOpen, setIsAnalyticsOpen] = React.useState(false);
  const [streamProgress, setStreamProgress] = React.useState<{ index: number; total: number } | null>(null);
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const streamRef = React.useRef<EventSource | null>(null);

  const escalations = processed.filter((item) => item.remediation.requires_human_review);
  const processedIds = React.useMemo(() => new Set(processed.map((item) => item.request.id)), [processed]);
  const visibleIncoming = incoming.filter((request) => request.id !== processing?.request.id && !processedIds.has(request.id));

  React.useEffect(() => {
    void loadInitialState();

    const pollId = window.setInterval(() => {
      if (!document.hidden) {
        void loadInitialState();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(pollId);
      streamRef.current?.close();
    };
  }, []);

  async function loadInitialState() {
    setError(null);
    try {
      const [healthResult, inboxResult, dashboardResult, caseResult, overrideResult] = await Promise.all([
        getHealth(),
        getInbox(),
        getDashboard(),
        getCases(),
        getOverrides(),
      ]);
      setHealth(healthResult);
      setIncoming(inboxResult);
      setDashboard(dashboardResult);
      setProcessed(caseResult);
      setOverrides(overrideResult);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to reach the Conductor API.");
    }
  }

  function startStream() {
    streamRef.current?.close();
    setError(null);
    setIsStreaming(true);
    setStreamProgress(null);

    const source = new EventSource(streamUrl());
    streamRef.current = source;

    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as StreamPayload;
      if ("done" in payload) {
        setIsStreaming(false);
        setProcessing(null);
        source.close();
        streamRef.current = null;
        return;
      }

      setStreamProgress({ index: payload.index, total: payload.total });
      setDashboard(payload.dashboard);
      setIncoming((current) => current.filter((request) => request.id !== payload.result.request.id));
      setProcessing(payload.result);

      window.setTimeout(() => {
        setProcessed((current) => upsertProcessed(current, payload.result));
        setProcessing((current) => (current?.request.id === payload.result.request.id ? null : current));
      }, 520);
    };

    source.onerror = () => {
      setError("The live SSE stream disconnected. Confirm the FastAPI backend is running on the configured base URL.");
      setIsStreaming(false);
      setProcessing(null);
      source.close();
      streamRef.current = null;
    };
  }

  function stopStream() {
    streamRef.current?.close();
    streamRef.current = null;
    setIsStreaming(false);
    setProcessing(null);
  }

  async function resetDemo() {
    stopStream();
    setError(null);
    try {
      await resetAuditLog();
      setProcessed([]);
      setProcessing(null);
      setSelected(null);
      setSelectedIncoming(null);
      setIsSheetOpen(false);
      setIsIncomingSheetOpen(false);
      setOverrides({});
      setDashboard(emptyDashboard);
      await loadInitialState();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to reset demo state.");
    }
  }

  async function submitOverride(payload: OverridePayload) {
    const result = await recordOverride(payload);
    setOverrides((current) => ({ ...current, [payload.request_id]: `${result.action.replace(/_/g, " ")}: ${result.note || "No note"}` }));
  }

  function openRequest(request: ProcessedRequest) {
    setIsIncomingSheetOpen(false);
    setSelected(request);
    setIsSheetOpen(true);
  }

  function openIncomingRequest(request: IncomingRequest) {
    setIsSheetOpen(false);
    setSelectedIncoming(request);
    setIsIncomingSheetOpen(true);
  }

  return (
    <main className="notion-grid flex min-h-screen bg-background/80">
      <AppRail active="home" escalations={escalations.length} />

      <section className="relative min-w-0 flex-1 overflow-hidden border bg-[#fbfaf6]/92 shadow-[0_1px_1px_rgba(31,35,40,0.04),0_30px_90px_rgba(31,35,40,0.08)]">
        <div className="absolute inset-0 workflow-canvas-grid" />

        <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-card/70 px-4 py-3 backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">Conductor</div>
              <div className="text-xs text-muted-foreground">TeleMedik POC</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusField label="Classifier" value="Bedrock AI" tone="green" />
            <Button type="button" size="sm" onClick={startStream} disabled={isStreaming}>
              <Play className="h-4 w-4" />
              Run
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={stopStream} disabled={!isStreaming}>
              <Square className="h-4 w-4" />
              Stop
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={resetDemo}>
              <RefreshCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href="/create-request">Create Request</Link>
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setIsAnalyticsOpen((open) => !open)}>
              {isAnalyticsOpen ? <PanelRightClose className="h-4 w-4" /> : <PanelRightOpen className="h-4 w-4" />}
              Analytics
            </Button>
          </div>
        </header>

        {error ? (
          <div className="relative z-20 mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
            <div className="mt-1 text-xs text-red-700">API base URL: {API_BASE_URL}</div>
          </div>
        ) : null}

        <WorkflowCanvas
          visibleIncoming={visibleIncoming}
          processing={processing}
          processed={processed}
          streamProgress={streamProgress}
          isStreaming={isStreaming}
          onOpenRequest={openRequest}
          onOpenIncomingRequest={openIncomingRequest}
        />

        <button
          type="button"
          onClick={() => setIsAnalyticsOpen((open) => !open)}
          className="absolute right-3 top-1/2 z-30 hidden -translate-y-1/2 rounded-full border bg-card/90 p-2 text-muted-foreground shadow-sm transition-colors hover:bg-muted hover:text-foreground lg:block"
          aria-label={isAnalyticsOpen ? "Collapse analytics" : "Expand analytics"}
        >
          {isAnalyticsOpen ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>

        <aside
          className={cn(
            "absolute bottom-0 right-0 top-[65px] z-40 w-full max-w-[420px] border-l bg-card/94 shadow-[-24px_0_70px_rgba(31,35,40,0.12)] backdrop-blur-xl transition-transform duration-300",
            isAnalyticsOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <div className="flex items-center justify-between border-b px-4 py-3">
            <div>
              <div className="text-sm font-semibold">Analytics</div>
              <div className="text-xs text-muted-foreground">Home metrics and supervisor queue</div>
            </div>
            <Button type="button" size="icon" variant="ghost" onClick={() => setIsAnalyticsOpen(false)} aria-label="Close analytics">
              <PanelRightClose className="h-4 w-4" />
            </Button>
          </div>
          <ScrollArea className="h-[calc(100vh-116px)]">
            <div className="space-y-5 p-4">
              <DashboardSummary dashboard={dashboard} health={health} isStreaming={isStreaming} />
              <EscalationQueue items={escalations} onSelect={openRequest} />
            </div>
          </ScrollArea>
        </aside>
      </section>

      <RequestDetailSheet
        request={selected}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        onOverride={submitOverride}
        overrideNote={selected ? overrides[selected.request.id] : undefined}
      />
      <IncomingRequestDetailSheet request={selectedIncoming} open={isIncomingSheetOpen} onOpenChange={setIsIncomingSheetOpen} />
    </main>
  );
}

function WorkflowCanvas({
  visibleIncoming,
  processing,
  processed,
  streamProgress,
  isStreaming,
  onOpenRequest,
  onOpenIncomingRequest,
}: {
  visibleIncoming: IncomingRequest[];
  processing: ProcessedRequest | null;
  processed: ProcessedRequest[];
  streamProgress: { index: number; total: number } | null;
  isStreaming: boolean;
  onOpenRequest: (request: ProcessedRequest) => void;
  onOpenIncomingRequest: (request: IncomingRequest) => void;
}) {
  return (
    <div className="relative z-10 min-h-[760px] px-4 py-5 sm:px-5 lg:px-7 lg:py-7">
      <svg className="pointer-events-none absolute inset-x-0 top-8 hidden h-[680px] w-full text-primary/25 lg:block" viewBox="0 0 1000 620" preserveAspectRatio="none" aria-hidden="true">
        <path d="M 245 305 C 330 305 380 305 455 305" fill="none" stroke="currentColor" strokeWidth="1.6" strokeDasharray="8 10" />
        <path d="M 545 305 C 625 150 690 92 805 92" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="7 11" />
        <path d="M 545 305 C 645 218 700 202 805 202" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="7 11" />
        <path d="M 545 305 C 660 305 710 305 805 305" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="7 11" />
        <path d="M 545 305 C 645 390 700 412 805 412" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="7 11" />
        <path d="M 545 305 C 625 486 690 515 805 515" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="7 11" />
      </svg>

      <div className="grid gap-5 lg:grid-cols-[minmax(280px,0.92fr)_190px_minmax(380px,1.2fr)] lg:items-center">
        <section className="rounded-xl border bg-card/80 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Inbox className="h-4 w-4 text-primary" />
                Incoming Deck
              </div>
              <div className="text-xs text-muted-foreground">Unsorted request cards waiting for triage</div>
            </div>
            <StatusField label="Waiting" value={String(visibleIncoming.length)} />
          </div>
          <ScrollArea className="h-[580px]">
            <div className="space-y-3 p-3">
              {visibleIncoming.length ? (
                visibleIncoming.map((request) => <RequestCard key={request.id} request={request} state="incoming" onClick={() => onOpenIncomingRequest(request)} />)
              ) : (
                <EmptyState text="No waiting requests." />
              )}
            </div>
          </ScrollArea>
        </section>

        <section className="relative flex min-h-[260px] items-center justify-center lg:min-h-[620px]">
          <Card className={cn("relative z-10 w-full max-w-[210px] border-primary/25 bg-card/92 p-4 text-center shadow-[0_20px_60px_rgba(8,122,143,0.14)]", isStreaming && "workflow-pulse") }>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Bot className="h-6 w-6" />
            </div>
            <div className="text-sm font-semibold">Classifier Node</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">Dealer-style triage sorts each request into the correct operations pile.</div>
            <div className="mt-4 rounded-lg border bg-muted/45 px-3 py-2 text-xs text-muted-foreground">
              {streamProgress ? `Processed ${streamProgress.index} of ${streamProgress.total}` : processing ? "Routing active case" : "Idle"}
            </div>
          </Card>

          {processing ? (
            <button type="button" className="absolute bottom-2 z-20 w-full max-w-[240px] text-left" onClick={() => onOpenRequest(processing)}>
              <RequestCard request={processing.request} processed={processing} state="processing" />
            </button>
          ) : null}
        </section>

        <section className="space-y-3">
          <div className="mb-1 flex items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <GitBranch className="h-4 w-4 text-primary" />
              Sorted Outcome Piles
            </div>
            <StatusField label="Logged" value={String(processed.length)} />
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-2">
            {branchNodes.map((node) => {
              const items = getNodeItems(processed, node.type);
              return <OutcomeNode key={node.type} node={node} items={items} onOpenRequest={onOpenRequest} />;
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

function IncomingRequestDetailSheet({ request, open, onOpenChange }: { request: IncomingRequest | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  if (!request) {
    return <Sheet open={open} onOpenChange={onOpenChange} />;
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="border-b bg-card px-6 py-5">
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <StatusField label="Status" value="Awaiting Classification" className="sm:col-span-2" />
            <StatusField label="Type" value="Pending" />
            <StatusField label="Channel" value={titleize(request.channel)} />
          </div>
          <SheetTitle>{request.subject}</SheetTitle>
          <SheetDescription>
            {request.id} · {request.member_name || "Member"} · {titleize(request.channel)}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-6 py-5">
            <section className="rounded-lg border bg-muted/35 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <UserRound className="h-4 w-4 text-primary" />
                Original request
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{request.body}</p>
            </section>

            <section className="rounded-lg border border-dashed bg-card p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <Clock3 className="h-4 w-4 text-primary" />
                Waiting for workflow processing
              </div>
              <p className="text-sm leading-6 text-muted-foreground">
                This request is present in the intake inbox but does not have a persisted case record yet. Run the workflow canvas to classify it and generate branch-specific outputs.
              </p>
            </section>

            <section className="rounded-lg border bg-card p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Mail className="h-4 w-4 text-primary" />
                Intake metadata
              </div>
              <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                <Info label="Request ID" value={request.id} />
                <Info label="Member" value={request.member_name || "Member"} />
                <Info label="Channel" value={titleize(request.channel)} />
                <Info label="Workflow state" value="Unclassified" />
              </div>
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function OutcomeNode({
  node,
  items,
  onOpenRequest,
}: {
  node: (typeof branchNodes)[number];
  items: ProcessedRequest[];
  onOpenRequest: (request: ProcessedRequest) => void;
}) {
  const Icon = node.icon;
  const toneClass = {
    teal: "border-cyan-100 bg-cyan-50 text-cyan-900",
    green: "border-green-100 bg-green-50 text-green-900",
    amber: "border-amber-100 bg-amber-50 text-amber-900",
    blue: "border-blue-100 bg-blue-50 text-blue-900",
    red: "border-red-100 bg-red-50 text-red-900",
  }[node.tone];

  return (
    <Card className="relative overflow-hidden bg-card/86 p-3 shadow-sm backdrop-blur-sm">
      <div className="absolute left-0 top-5 h-8 w-1 rounded-r-full bg-primary/40" />
      <div className="flex items-start gap-3">
        <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border", toneClass)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-semibold">{node.title}</div>
              <div className="mt-0.5 text-xs leading-4 text-muted-foreground">{node.caption}</div>
            </div>
            <StatusField label="Cases" value={String(items.length)} tone={items.length ? "teal" : "default"} className="min-w-[64px]" />
          </div>

          <div className="mt-3 min-h-[82px]">
            {items.slice(0, 3).map((item, index) => (
              <button
                key={item.request.id}
                type="button"
                className="relative block w-full rounded-md border bg-background/80 p-2 text-left shadow-sm transition-all hover:z-20 hover:border-primary/35 hover:bg-muted/55 hover:shadow-md"
                style={{
                  marginTop: index === 0 ? 0 : -12,
                  transform: `rotate(${index % 2 === 0 ? -0.6 : 0.8}deg) translateX(${index * 4}px)`,
                  zIndex: 10 - index,
                }}
                onClick={() => onOpenRequest(item)}
              >
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-medium">{item.request.subject}</span>
                  <span className="shrink-0 text-muted-foreground">{formatPercent(item.type_decision.confidence)}</span>
                </div>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Activity className="h-3 w-3" />
                  <span className="truncate">{titleize(item.remediation.assigned_team)}</span>
                </div>
              </button>
            ))}
            {items.length === 0 ? (
              <div className="rounded-md border border-dashed bg-muted/24 p-2 text-xs leading-5 text-muted-foreground">Waiting for matching cases.</div>
            ) : null}
            {items.length > 3 ? <div className="mt-2 text-xs text-muted-foreground">+{items.length - 3} more routed cases in this pile</div> : null}
          </div>
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="rounded-lg border border-dashed bg-card/62 p-5 text-center text-sm text-muted-foreground">
      <Layers3 className="mx-auto mb-2 h-5 w-5 text-primary/70" />
      {text}
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-3 py-2">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm font-medium">{value}</div>
    </div>
  );
}

function getNodeItems(processed: ProcessedRequest[], type: RequestType | "human_review") {
  if (type === "human_review") {
    return processed.filter((item) => item.remediation.requires_human_review);
  }
  return processed.filter((item) => item.type_decision.type === type);
}

function upsertProcessed(current: ProcessedRequest[], next: ProcessedRequest) {
  const without = current.filter((item) => item.request.id !== next.request.id);
  return [next, ...without];
}

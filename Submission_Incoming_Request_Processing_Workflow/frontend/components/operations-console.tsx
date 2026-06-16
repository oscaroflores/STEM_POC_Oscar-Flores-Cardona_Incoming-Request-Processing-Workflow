"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ClipboardCheck,
  FileWarning,
  GitBranch,
  GripVertical,
  HeartPulse,
  Inbox,
  Layers3,
  LockKeyhole,
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
  Workflow,
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
import { API_BASE_URL, getCases, getDashboard, getHealth, getInbox, getMaskingHealth, getOverrides, recordOverride, resetAuditLog, streamUrl } from "@/lib/api";
import type { DashboardSummary as DashboardSummaryType, HealthStatus, IncomingRequest, MaskingHealth, OverridePayload, ProcessedRequest, RequestType, StreamPayload } from "@/lib/types";
import { cn, titleize } from "@/lib/utils";

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
  steps: string[];
  tone: "teal" | "green" | "amber" | "blue" | "red";
  icon: LucideIcon;
}> = [
  {
    type: "complaint",
    title: "Complaint",
    caption: "Senior handler + priority case log",
    steps: ["Acknowledge", "Escalate", "Priority log", "Follow-up"],
    tone: "amber",
    icon: AlertTriangle,
  },
  {
    type: "benefits_enquiry",
    title: "Benefits Enquiry",
    caption: "Coverage draft + resolution note",
    steps: ["Sub-topic", "Draft reply", "Review", "Case note"],
    tone: "green",
    icon: ClipboardCheck,
  },
  {
    type: "service_request",
    title: "Service Request",
    caption: "Scheduling/service team handoff",
    steps: ["Extract details", "Route team", "Confirm", "SLA timer"],
    tone: "teal",
    icon: Route,
  },
  {
    type: "billing_dispute",
    title: "Billing Dispute",
    caption: "Billing queue + follow-up flag",
    steps: ["Billing facts", "Route billing", "Acknowledge", "Follow-up"],
    tone: "blue",
    icon: FileWarning,
  },
  {
    type: "clinical_urgent",
    title: "Clinical Urgent",
    caption: "Immediate supervisor notification",
    steps: ["Human review", "Notify lead", "Urgent ack", "Pause AI"],
    tone: "red",
    icon: HeartPulse,
  },
  {
    type: "human_review",
    title: "Human Review Gate",
    caption: "Low confidence, sensitive, or clinical safety pause",
    steps: ["Hold case", "Assign reviewer", "Capture rationale", "Override path"],
    tone: "red",
    icon: ShieldAlert,
  },
];

export function OperationsConsole() {
  const [health, setHealth] = React.useState<HealthStatus | null>(null);
  const [maskingHealth, setMaskingHealth] = React.useState<MaskingHealth | null>(null);
  const [role, setRole] = React.useState("agent");
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
  }, [role]);

  async function loadInitialState() {
    setError(null);
    try {
      const [healthResult, maskingHealthResult, inboxResult, dashboardResult, caseResult, overrideResult] = await Promise.all([
        getHealth(),
        getMaskingHealth(),
        getInbox(role),
        getDashboard(role),
        getCases(role),
        getOverrides(role),
      ]);
      setHealth(healthResult);
      setMaskingHealth(maskingHealthResult);
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

    const source = new EventSource(streamUrl(role));
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
    <main className="notion-grid flex h-screen overflow-hidden bg-background/80">
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
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-medium text-cyan-950">
              Masking Gateway · De-identified · {maskingHealth?.tokens_vaulted ?? 0} tokens vaulted · PHI not sent to model
            </div>
            <label className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
              Role
              <select value={role} onChange={(event) => setRole(event.target.value)} className="bg-transparent font-medium text-foreground outline-none">
                <option value="agent">Agent</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </label>
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
        role={role}
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
  const [canvasOffset, setCanvasOffset] = React.useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = React.useState(false);
  const panRef = React.useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || isPanBlocked(event.target)) {
      return;
    }

    panRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: canvasOffset.x,
      originY: canvasOffset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsPanning(true);
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) {
      return;
    }

    setCanvasOffset({
      x: pan.originX + event.clientX - pan.startX,
      y: pan.originY + event.clientY - pan.startY,
    });
  }

  function stopPan(event: React.PointerEvent<HTMLDivElement>) {
    if (panRef.current?.pointerId === event.pointerId) {
      panRef.current = null;
      setIsPanning(false);
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      className={cn("relative z-10 h-[calc(100vh-65px)] min-h-0 overflow-hidden touch-none", isPanning ? "cursor-grabbing" : "cursor-grab")}
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={stopPan}
      onPointerCancel={stopPan}
    >
      <div className="pointer-events-none absolute left-4 top-4 z-30 rounded-md border bg-card/88 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
        Drag empty canvas to move the builder
      </div>
      <Button type="button" size="sm" variant="outline" data-no-pan className="absolute right-4 top-4 z-30 h-7 px-2 text-[11px]" onClick={() => setCanvasOffset({ x: 0, y: 0 })}>
        Reset view
      </Button>

      <div
        className="absolute left-0 top-0 h-[900px] w-[1600px] transition-transform duration-75 ease-out"
        style={{ transform: `translate3d(${canvasOffset.x}px, ${canvasOffset.y}px, 0)` }}
      >
        <svg className="pointer-events-none absolute inset-0 h-full w-full text-primary/45" viewBox="0 0 1600 900" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="workflow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
            </marker>
          </defs>
          <path d="M 400 450 C 470 450 520 450 590 450" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="9 9" markerEnd="url(#workflow-arrow)" />
          <circle cx="700" cy="450" r="7" fill="currentColor" opacity="0.5" />
          <path d="M 810 450 C 870 145 900 142 940 142" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="7 9" markerEnd="url(#workflow-arrow)" />
          <path d="M 810 450 C 870 245 900 245 940 245" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="7 9" markerEnd="url(#workflow-arrow)" />
          <path d="M 810 450 C 875 348 900 348 940 348" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="7 9" markerEnd="url(#workflow-arrow)" />
          <path d="M 810 450 C 875 450 900 450 940 450" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="7 9" markerEnd="url(#workflow-arrow)" />
          <path d="M 810 450 C 870 553 900 553 940 553" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="7 9" markerEnd="url(#workflow-arrow)" />
          <path d="M 810 450 C 870 656 900 656 940 656" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeDasharray="7 9" markerEnd="url(#workflow-arrow)" />
        </svg>

        <section data-no-pan className="absolute left-10 top-[72px] flex h-[760px] w-[360px] min-h-0 flex-col rounded-xl border bg-card/80 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Inbox className="h-4 w-4 text-primary" />
                Intake Requests
              </div>
              <div className="text-xs text-muted-foreground">Persistent source queue for drag-and-drop routing</div>
            </div>
            <StatusField label="Waiting" value={String(visibleIncoming.length)} />
          </div>
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-3">
              {visibleIncoming.length ? (
                visibleIncoming.map((request) => <RequestCard key={request.id} request={request} state="incoming" onClick={() => onOpenIncomingRequest(request)} />)
              ) : (
                <EmptyState text="No waiting requests." />
              )}
            </div>
          </ScrollArea>
        </section>

        <section data-no-pan className="absolute left-[590px] top-[318px] flex h-[264px] w-[220px] items-center justify-center">
          <Card className={cn("relative z-10 w-full max-w-[210px] border-primary/25 bg-card/92 p-4 text-center shadow-[0_20px_60px_rgba(8,122,143,0.14)]", isStreaming && "workflow-pulse") }>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded border bg-background/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Workflow className="h-3 w-3" />
              AI Model
            </div>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Bot className="h-6 w-6" />
            </div>
            <div className="text-sm font-semibold">Classifier Node</div>
            <div className="mt-1 text-[11px] leading-4 text-muted-foreground">Routes each request into one pipeline.</div>
            <div className="mx-auto mt-3 inline-flex rounded-md border bg-muted/45 px-2 py-1 text-[11px] font-medium leading-none text-muted-foreground">
              {streamProgress ? `Processed ${streamProgress.index} of ${streamProgress.total}` : processing ? "Routing active case" : "Idle"}
            </div>
          </Card>

          {processing ? (
            <button type="button" className="absolute bottom-2 z-20 w-full max-w-[240px] text-left" onClick={() => onOpenRequest(processing)}>
              <RequestCard request={processing.request} processed={processing} state="processing" />
            </button>
          ) : null}
        </section>

        <section data-no-pan className="absolute left-[940px] top-[72px] flex h-[760px] w-[620px] min-h-0 flex-col space-y-3">
          <div className="mb-1 flex items-center justify-between gap-3 px-1">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <GitBranch className="h-4 w-4 text-primary" />
                Routing Pipelines
              </div>
              <div className="text-xs text-muted-foreground">Each row is a drop target with ordered auto-executed steps</div>
            </div>
            <StatusField label="Logged" value={String(processed.length)} />
          </div>
          <ScrollArea className="min-h-0 flex-1 pr-1">
            <div className="flex min-h-full flex-col justify-between gap-3 pb-1">
              {branchNodes.map((node) => {
                const items = getNodeItems(processed, node.type);
                return <OutcomeNode key={node.type} node={node} items={items} />;
              })}
            </div>
          </ScrollArea>
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
                De-identified request
              </div>
              <div className="mb-3 inline-flex items-center gap-1.5 rounded border border-cyan-100 bg-cyan-50 px-2 py-1 text-[11px] font-medium text-cyan-950">
                <LockKeyhole className="h-3 w-3" />
                {request.phi?.count ?? 0} PHI tokens vaulted
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
}: {
  node: (typeof branchNodes)[number];
  items: ProcessedRequest[];
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
    <Card className="relative overflow-hidden border-dashed bg-card/86 p-1.5 shadow-sm backdrop-blur-sm">
      <div className="absolute left-0 top-3 h-8 w-1 rounded-r-full bg-primary/40" />
      <div className="flex min-w-0 items-stretch gap-1.5 overflow-x-auto pl-1">
        <div draggable className="flex min-w-[154px] max-w-[188px] shrink-0 cursor-grab items-center gap-2 rounded-md border bg-background/82 p-2 active:cursor-grabbing">
          <GripVertical className="h-4 w-4 shrink-0 text-muted-foreground/55" />
          <div className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-md border", toneClass)}>
            <Icon className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="truncate text-xs font-semibold">{node.title}</div>
            <div className="mt-0.5 truncate text-[10px] leading-3 text-muted-foreground">{node.caption}</div>
          </div>
        </div>

        {node.steps.map((step, index) => (
          <React.Fragment key={step}>
            {index > 0 ? <ArrowRight className="my-auto h-3.5 w-3.5 shrink-0 text-muted-foreground/45" /> : null}
            <div draggable className="flex min-w-[94px] flex-1 cursor-grab items-center gap-1.5 rounded-md border bg-background/72 px-2 py-1.5 active:cursor-grabbing">
              <GripVertical className="h-3.5 w-3.5 shrink-0 text-muted-foreground/45" />
              <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border bg-muted/55 text-[10px] font-semibold text-muted-foreground">{index + 1}</div>
              <div className="min-w-0 text-[11px] font-medium leading-3 text-foreground">{step}</div>
            </div>
          </React.Fragment>
        ))}

        <div className={cn("flex min-w-[58px] shrink-0 flex-col justify-center rounded-md border px-2 py-1 text-left", items.length ? "border-cyan-200 bg-cyan-50 text-cyan-950" : "border-border bg-card text-foreground")}>
          <div className="text-[9px] font-semibold uppercase tracking-[0.12em] opacity-60">Cases</div>
          <div className="mt-0.5 text-xs font-semibold leading-none">{items.length}</div>
        </div>
      </div>
    </Card>
  );
}

function isPanBlocked(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-no-pan],button,a,input,select,textarea"));
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

"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
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
  Pencil,
  Play,
  Plus,
  RefreshCcw,
  Route,
  Save,
  ShieldAlert,
  Square,
  Trash2,
  UserRound,
  Workflow,
  X,
} from "lucide-react";
import { AppRail } from "@/components/app-rail";
import { BrandLogoMark } from "@/components/brand-logo-mark";
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
import { isDashboardEqual, setIfChanged } from "@/lib/state-utils";
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

const POLL_INTERVAL_MS = 15000;

type WorkflowBranch = RequestType | "human_review" | "custom";
type WorkflowTone = "teal" | "green" | "amber" | "blue" | "red";

type WorkflowStep = {
  id: string;
  label: string;
};

type WorkflowOutcome = {
  id: string;
  branch: WorkflowBranch;
  title: string;
  caption: string;
  steps: WorkflowStep[];
  tone: WorkflowTone;
};

const WORKFLOW_BUILDER_STORAGE_KEY = "conductor.workflow-builder.v1";

const branchOptions: Array<{ value: WorkflowBranch; label: string }> = [
  { value: "complaint", label: "Complaint" },
  { value: "benefits_enquiry", label: "Benefits Enquiry" },
  { value: "service_request", label: "Service Request" },
  { value: "billing_dispute", label: "Billing Dispute" },
  { value: "clinical_urgent", label: "Clinical Urgent" },
  { value: "human_review", label: "Human Review" },
  { value: "custom", label: "Custom Outcome" },
];

const toneOptions: Array<{ value: WorkflowTone; label: string }> = [
  { value: "teal", label: "Teal" },
  { value: "green", label: "Green" },
  { value: "amber", label: "Amber" },
  { value: "blue", label: "Blue" },
  { value: "red", label: "Red" },
];

const outcomeIcons: Record<WorkflowBranch, LucideIcon> = {
  complaint: AlertTriangle,
  benefits_enquiry: ClipboardCheck,
  service_request: Route,
  billing_dispute: FileWarning,
  clinical_urgent: HeartPulse,
  human_review: ShieldAlert,
  custom: GitBranch,
};

const defaultWorkflowOutcomes: WorkflowOutcome[] = [
  {
    id: "outcome-complaint",
    branch: "complaint",
    title: "Complaint",
    caption: "Senior handler + priority case log",
    steps: buildDefaultSteps("complaint", ["Acknowledge", "Escalate", "Priority log", "Follow-up"]),
    tone: "amber",
  },
  {
    id: "outcome-benefits",
    branch: "benefits_enquiry",
    title: "Benefits Enquiry",
    caption: "Coverage draft + resolution note",
    steps: buildDefaultSteps("benefits", ["Sub-topic", "Draft reply", "Review", "Case note"]),
    tone: "green",
  },
  {
    id: "outcome-service",
    branch: "service_request",
    title: "Service Request",
    caption: "Scheduling/service team handoff",
    steps: buildDefaultSteps("service", ["Extract details", "Route team", "Confirm", "SLA timer"]),
    tone: "teal",
  },
  {
    id: "outcome-billing",
    branch: "billing_dispute",
    title: "Billing Dispute",
    caption: "Billing queue + follow-up flag",
    steps: buildDefaultSteps("billing", ["Billing facts", "Route billing", "Acknowledge", "Follow-up"]),
    tone: "blue",
  },
  {
    id: "outcome-clinical",
    branch: "clinical_urgent",
    title: "Clinical Urgent",
    caption: "Immediate supervisor notification",
    steps: buildDefaultSteps("clinical", ["Human review", "Notify lead", "Urgent ack", "Pause AI"]),
    tone: "red",
  },
  {
    id: "outcome-human-review",
    branch: "human_review",
    title: "Human Review Gate",
    caption: "Low confidence, sensitive, or clinical safety pause",
    steps: buildDefaultSteps("human-review", ["Hold case", "Assign reviewer", "Capture rationale", "Override path"]),
    tone: "red",
  },
];

function buildDefaultSteps(prefix: string, labels: string[]): WorkflowStep[] {
  return labels.map((label, index) => ({ id: `${prefix}-step-${index + 1}`, label }));
}

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
  const isStreamingRef = React.useRef(false);

  const escalations = processed.filter((item) => item.remediation.requires_human_review);
  const processedIds = React.useMemo(() => new Set(processed.map((item) => item.request.id)), [processed]);
  const visibleIncoming = incoming.filter((request) => request.id !== processing?.request.id && !processedIds.has(request.id));

  React.useEffect(() => {
    isStreamingRef.current = isStreaming;
  }, [isStreaming]);

  React.useEffect(() => {
    void loadInitialState();

    const pollId = window.setInterval(() => {
      if (!document.hidden && !isStreamingRef.current) {
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
      setIfChanged(setHealth, healthResult);
      setIfChanged(setMaskingHealth, maskingHealthResult);
      setIfChanged(setIncoming, inboxResult);
      setIfChanged(setDashboard, dashboardResult, isDashboardEqual);
      setIfChanged(setProcessed, caseResult);
      setIfChanged(setOverrides, overrideResult);
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
      <AppRail active="home" />

      <section className="relative min-w-0 flex-1 overflow-hidden border bg-[#fbfaf6]/92 shadow-[0_1px_1px_rgba(31,35,40,0.04),0_30px_90px_rgba(31,35,40,0.08)]">
        <div className="absolute inset-0 workflow-canvas-grid" />

        <header className="relative z-20 flex flex-wrap items-center justify-between gap-3 border-b bg-card/70 px-4 py-3 backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-3">
            <BrandLogoMark alt="Conductor" />
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
  const [outcomes, setOutcomes] = React.useState<WorkflowOutcome[]>(defaultWorkflowOutcomes);
  const [hasLoadedBuilder, setHasLoadedBuilder] = React.useState(false);
  const [editingOutcomeId, setEditingOutcomeId] = React.useState<string | null>(null);
  const [draftOutcome, setDraftOutcome] = React.useState<WorkflowOutcome | null>(null);
  const [addingOutcome, setAddingOutcome] = React.useState<WorkflowOutcome | null>(null);
  const [editingStep, setEditingStep] = React.useState<{ outcomeId: string; stepId: string } | null>(null);
  const [draggingOutcomeId, setDraggingOutcomeId] = React.useState<string | null>(null);
  const [draggingStep, setDraggingStep] = React.useState<{ outcomeId: string; stepId: string } | null>(null);
  const panRef = React.useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  React.useEffect(() => {
    const stored = window.localStorage.getItem(WORKFLOW_BUILDER_STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as WorkflowOutcome[];
        if (Array.isArray(parsed) && parsed.length) {
          setOutcomes(parsed);
        }
      } catch {
        window.localStorage.removeItem(WORKFLOW_BUILDER_STORAGE_KEY);
      }
    }
    setHasLoadedBuilder(true);
  }, []);

  React.useEffect(() => {
    if (hasLoadedBuilder) {
      window.localStorage.setItem(WORKFLOW_BUILDER_STORAGE_KEY, JSON.stringify(outcomes));
    }
  }, [hasLoadedBuilder, outcomes]);

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

  function scrollPan(event: React.WheelEvent<HTMLDivElement>) {
    if (isWheelPanBlocked(event.target, event.currentTarget)) {
      return;
    }

    event.preventDefault();
    const scaleX = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? event.currentTarget.clientWidth : 1;
    const scaleY = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? event.currentTarget.clientHeight : 1;
    setCanvasOffset((current) => ({
      x: current.x - event.deltaX * scaleX,
      y: current.y - event.deltaY * scaleY,
    }));
  }

  function startAddOutcome() {
    const next: WorkflowOutcome = {
      id: createLocalId("outcome"),
      branch: "custom",
      title: "New Outcome",
      caption: "Describe the routing outcome",
      tone: "teal",
      steps: [
        { id: createLocalId("step"), label: "Review request" },
        { id: createLocalId("step"), label: "Draft response" },
      ],
    };
    setAddingOutcome(next);
    setEditingOutcomeId(null);
    setDraftOutcome(null);
  }

  function saveAddedOutcome() {
    if (!addingOutcome) {
      return;
    }
    setOutcomes((current) => [...current, normalizeOutcome(addingOutcome)]);
    setAddingOutcome(null);
  }

  function startEditOutcome(outcome: WorkflowOutcome) {
    setEditingOutcomeId(outcome.id);
    setDraftOutcome({ ...outcome, steps: outcome.steps.map((step) => ({ ...step })) });
    setAddingOutcome(null);
  }

  function saveOutcome() {
    if (!draftOutcome) {
      return;
    }
    setOutcomes((current) => current.map((outcome) => (outcome.id === draftOutcome.id ? normalizeOutcome(draftOutcome) : outcome)));
    setEditingOutcomeId(null);
    setDraftOutcome(null);
  }

  function deleteOutcome(outcomeId: string) {
    setOutcomes((current) => current.filter((outcome) => outcome.id !== outcomeId));
    if (editingOutcomeId === outcomeId) {
      setEditingOutcomeId(null);
      setDraftOutcome(null);
    }
  }

  function addStep(outcomeId: string, insertIndex: number) {
    const nextStep = { id: createLocalId("step"), label: "New step" };
    setOutcomes((current) =>
      current.map((outcome) =>
        outcome.id === outcomeId
          ? { ...outcome, steps: [...outcome.steps.slice(0, insertIndex), nextStep, ...outcome.steps.slice(insertIndex)] }
          : outcome,
      ),
    );
    setEditingStep({ outcomeId, stepId: nextStep.id });
  }

  function updateStep(outcomeId: string, stepId: string, label: string) {
    setOutcomes((current) => current.map((outcome) => (outcome.id === outcomeId ? { ...outcome, steps: outcome.steps.map((step) => (step.id === stepId ? { ...step, label } : step)) } : outcome)));
  }

  function deleteStep(outcomeId: string, stepId: string) {
    setOutcomes((current) => current.map((outcome) => (outcome.id === outcomeId ? { ...outcome, steps: outcome.steps.filter((step) => step.id !== stepId) } : outcome)));
    if (editingStep?.outcomeId === outcomeId && editingStep.stepId === stepId) {
      setEditingStep(null);
    }
  }

  function dropOutcome(targetOutcomeId: string) {
    if (!draggingOutcomeId || draggingOutcomeId === targetOutcomeId) {
      setDraggingOutcomeId(null);
      return;
    }

    setOutcomes((current) => reorderById(current, draggingOutcomeId, targetOutcomeId));
    setDraggingOutcomeId(null);
  }

  function dropStep(targetOutcomeId: string, targetStepId: string) {
    if (!draggingStep || draggingStep.outcomeId !== targetOutcomeId || draggingStep.stepId === targetStepId) {
      setDraggingStep(null);
      return;
    }

    setOutcomes((current) =>
      current.map((outcome) =>
        outcome.id === targetOutcomeId
          ? { ...outcome, steps: reorderById(outcome.steps, draggingStep.stepId, targetStepId) }
          : outcome,
      ),
    );
    setDraggingStep(null);
  }

  return (
    <div
      className={cn("relative z-10 h-[calc(100vh-65px)] min-h-0 overflow-hidden touch-none", isPanning ? "cursor-grabbing" : "cursor-grab")}
      onPointerDown={startPan}
      onPointerMove={movePan}
      onPointerUp={stopPan}
      onPointerCancel={stopPan}
      onWheel={scrollPan}
    >
      <div className="pointer-events-none absolute left-4 top-4 z-30 rounded-md border bg-card/88 px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur-sm">
        Drag or scroll empty canvas to move the builder
      </div>
      <Button type="button" size="sm" variant="outline" data-no-pan className="absolute right-4 top-4 z-30 h-7 px-2 text-[11px]" onClick={() => setCanvasOffset({ x: 0, y: 0 })}>
        Reset view
      </Button>

      <div className="absolute left-0 top-0 h-[1120px] w-[2300px] transition-transform duration-75 ease-out" style={{ transform: `translate3d(${canvasOffset.x}px, ${canvasOffset.y}px, 0)` }}>
        <svg className="pointer-events-none absolute inset-0 h-full w-full text-primary/30" viewBox="0 0 2300 1120" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id="builder-arrow" viewBox="0 0 14 14" refX="11" refY="7" markerWidth="8" markerHeight="8" orient="auto">
              <path d="M 1 1 L 13 7 L 1 13 z" fill="currentColor" />
            </marker>
          </defs>
          <path d="M 408 450 C 442 450 468 450 502 450" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" opacity="0.55" markerEnd="url(#builder-arrow)" />
          <path d="M 752 450 C 784 450 806 450 836 450" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" opacity="0.55" markerEnd="url(#builder-arrow)" />
        </svg>

        <section data-no-pan className="absolute left-10 top-[72px] flex h-[760px] w-[360px] min-h-0 flex-col rounded-lg border bg-card/86 shadow-sm backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Inbox className="h-4 w-4 text-primary" />
                Request Intake
              </div>
              <div className="text-xs text-muted-foreground">Always-on inbox node feeding the classifier</div>
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

        <section data-no-pan className="absolute left-[505px] top-[318px] flex h-[264px] w-[250px] items-center justify-center">
          <Card className={cn("relative z-10 w-full max-w-[230px] rounded-lg border-primary/25 bg-card/94 p-4 text-center shadow-[0_20px_60px_rgba(8,122,143,0.14)]", isStreaming && "workflow-pulse") }>
            <div className="mb-3 inline-flex items-center gap-1.5 rounded border bg-background/70 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Workflow className="h-3 w-3" />
              Always On
            </div>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground">
              <Bot className="h-6 w-6" />
            </div>
            <div className="text-sm font-semibold">AI Classifier Node</div>
            <div className="mt-1 text-[11px] leading-4 text-muted-foreground">Classifies type, urgency, confidence, language, and safety flags.</div>
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

        <section data-no-pan className="absolute left-[835px] top-[72px] flex h-[910px] w-[1360px] min-h-0 flex-col space-y-4">
          <div className="mb-1 flex items-center justify-between gap-3 px-1">
            <div>
              <div className="flex items-center gap-2 text-sm font-semibold">
                <GitBranch className="h-4 w-4 text-primary" />
                Outcome Stack
              </div>
              <div className="text-xs text-muted-foreground">Frontend-only workflow builder: outcomes and ordered branch steps</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusField label="Logged" value={String(processed.length)} />
              <Button type="button" size="sm" variant="outline" onClick={() => setOutcomes(defaultWorkflowOutcomes)}>
                Reset builder
              </Button>
            </div>
          </div>
          <ScrollArea className="min-h-0 flex-1 pr-1">
            <div className="flex min-h-full flex-col gap-8 pb-8 pt-3">
              {outcomes.map((outcome) => {
                const items = getNodeItems(processed, outcome.branch);
                const isEditing = editingOutcomeId === outcome.id && draftOutcome;
                return isEditing ? (
                  <OutcomeEditor key={outcome.id} value={draftOutcome} onChange={setDraftOutcome} onCancel={() => { setEditingOutcomeId(null); setDraftOutcome(null); }} onSave={saveOutcome} />
                ) : (
                  <OutcomeNode
                    key={outcome.id}
                    outcome={outcome}
                    items={items}
                    editingStep={editingStep}
                    draggingOutcomeId={draggingOutcomeId}
                    draggingStep={draggingStep}
                    onEdit={() => startEditOutcome(outcome)}
                    onDelete={() => deleteOutcome(outcome.id)}
                    onAddStep={(insertIndex) => addStep(outcome.id, insertIndex)}
                    onEditStep={(stepId) => setEditingStep({ outcomeId: outcome.id, stepId })}
                    onUpdateStep={(stepId, label) => updateStep(outcome.id, stepId, label)}
                    onDeleteStep={(stepId) => deleteStep(outcome.id, stepId)}
                    onFinishStepEdit={() => setEditingStep(null)}
                    onOutcomeDragStart={() => setDraggingOutcomeId(outcome.id)}
                    onOutcomeDrop={() => dropOutcome(outcome.id)}
                    onOutcomeDragEnd={() => setDraggingOutcomeId(null)}
                    onStepDragStart={(stepId) => setDraggingStep({ outcomeId: outcome.id, stepId })}
                    onStepDrop={(stepId) => dropStep(outcome.id, stepId)}
                    onStepDragEnd={() => setDraggingStep(null)}
                  />
                );
              })}

              {addingOutcome ? <OutcomeEditor value={addingOutcome} onChange={setAddingOutcome} onCancel={() => setAddingOutcome(null)} onSave={saveAddedOutcome} isNew /> : null}

              <button
                type="button"
                onClick={startAddOutcome}
                className="group flex min-h-16 items-center justify-center gap-2 rounded-lg border-2 border-dashed border-primary/28 bg-card/62 px-4 py-5 text-sm font-semibold text-primary/85 shadow-sm transition-colors hover:border-primary/45 hover:bg-accent/55"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/25 bg-background text-primary shadow-sm transition-transform group-hover:scale-105">
                  <Plus className="h-5 w-5" />
                </span>
                Add outcome
              </button>
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
  outcome,
  items,
  editingStep,
  draggingOutcomeId,
  draggingStep,
  onEdit,
  onDelete,
  onAddStep,
  onEditStep,
  onUpdateStep,
  onDeleteStep,
  onFinishStepEdit,
  onOutcomeDragStart,
  onOutcomeDrop,
  onOutcomeDragEnd,
  onStepDragStart,
  onStepDrop,
  onStepDragEnd,
}: {
  outcome: WorkflowOutcome;
  items: ProcessedRequest[];
  editingStep: { outcomeId: string; stepId: string } | null;
  draggingOutcomeId: string | null;
  draggingStep: { outcomeId: string; stepId: string } | null;
  onEdit: () => void;
  onDelete: () => void;
  onAddStep: (insertIndex: number) => void;
  onEditStep: (stepId: string) => void;
  onUpdateStep: (stepId: string, label: string) => void;
  onDeleteStep: (stepId: string) => void;
  onFinishStepEdit: () => void;
  onOutcomeDragStart: () => void;
  onOutcomeDrop: () => void;
  onOutcomeDragEnd: () => void;
  onStepDragStart: (stepId: string) => void;
  onStepDrop: (stepId: string) => void;
  onStepDragEnd: () => void;
}) {
  const Icon = outcomeIcons[outcome.branch] ?? GitBranch;
  const toneClass = getOutcomeToneClass(outcome.tone);
  const isDragging = draggingOutcomeId === outcome.id;

  return (
    <div
      className={cn("group/outcome relative rounded-lg border border-dashed border-border/75 bg-card/70 px-4 pb-4 pt-10 transition-all hover:bg-card/80", isDragging ? "border-primary/50 opacity-60" : "hover:border-primary/28")}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onOutcomeDrop}
    >
      <div className="absolute left-3 top-0 z-20 flex -translate-y-1/2 items-center gap-2 rounded-full border bg-[#fbfaf6]/95 px-2 py-1 text-xs shadow-sm backdrop-blur-sm">
        <button
          type="button"
          draggable
          onDragStart={onOutcomeDragStart}
          onDragEnd={onOutcomeDragEnd}
          className="cursor-grab rounded-full p-0.5 text-muted-foreground/60 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing"
          aria-label={`Reorder ${outcome.title}`}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-full border", toneClass)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="max-w-[170px] truncate font-semibold text-foreground">{outcome.title}</span>
        <span className="flex h-6 min-w-6 items-center justify-center rounded-full border bg-card px-1.5 text-[11px] font-semibold text-muted-foreground">{items.length}</span>
      </div>

      <div className="absolute right-3 top-0 z-20 flex -translate-y-1/2 items-center gap-1 rounded-full border bg-[#fbfaf6]/95 p-1 opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/outcome:opacity-100">
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 rounded-full" onClick={onEdit} aria-label={`Edit ${outcome.title}`}>
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7 rounded-full text-destructive hover:bg-red-50 hover:text-destructive" onClick={onDelete} aria-label={`Delete ${outcome.title}`}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="thin-scrollbar flex min-h-[56px] items-stretch gap-3 overflow-x-auto pb-1 pt-1">
        {outcome.steps.length === 0 ? <div className="min-w-[12px] flex-1" /> : null}
        {outcome.steps.map((step, index) => (
          <React.Fragment key={step.id}>
            <WorkflowStepNode
              step={step}
              index={index}
              isEditing={editingStep?.outcomeId === outcome.id && editingStep.stepId === step.id}
              isDragging={draggingStep?.outcomeId === outcome.id && draggingStep.stepId === step.id}
              onEdit={() => onEditStep(step.id)}
              onUpdate={(label) => onUpdateStep(step.id, label)}
              onDelete={() => onDeleteStep(step.id)}
              onFinishEdit={onFinishStepEdit}
              onDragStart={() => onStepDragStart(step.id)}
              onDrop={() => onStepDrop(step.id)}
              onDragEnd={onStepDragEnd}
            />
            {index < outcome.steps.length - 1 ? <StepGapButton label="Add step between" onClick={() => onAddStep(index + 1)} /> : null}
          </React.Fragment>
        ))}
        <StepEndButton onClick={() => onAddStep(outcome.steps.length)} />
      </div>
    </div>
  );
}

function WorkflowStepNode({
  step,
  index,
  isEditing,
  isDragging,
  onEdit,
  onUpdate,
  onDelete,
  onFinishEdit,
  onDragStart,
  onDrop,
  onDragEnd,
}: {
  step: WorkflowStep;
  index: number;
  isEditing: boolean;
  isDragging: boolean;
  onEdit: () => void;
  onUpdate: (label: string) => void;
  onDelete: () => void;
  onFinishEdit: () => void;
  onDragStart: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className={cn("group/step relative flex min-h-[46px] min-w-[132px] max-w-[160px] flex-1 items-center gap-1.5 rounded-md border bg-card/50 px-2 py-1.5 shadow-sm backdrop-blur-[1px] transition-all hover:bg-card/65", isDragging ? "border-primary/45 opacity-60" : "border-[#c7c0b4] hover:border-[#ada597]")}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <button type="button" draggable onDragStart={onDragStart} onDragEnd={onDragEnd} className="cursor-grab rounded p-0.5 text-muted-foreground/45 transition-colors hover:bg-muted hover:text-foreground active:cursor-grabbing" aria-label={`Reorder step ${index + 1}`}>
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded border bg-muted/55 text-[10px] font-semibold text-muted-foreground">{index + 1}</div>
      {isEditing ? (
        <input
          autoFocus
          value={step.label}
          onChange={(event) => onUpdate(event.target.value)}
          onBlur={onFinishEdit}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "Escape") {
              onFinishEdit();
            }
          }}
          className="min-w-0 flex-1 rounded border bg-background px-1.5 py-1 text-xs font-medium outline-none ring-0 focus:border-primary"
        />
      ) : (
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 truncate pr-8 text-left text-xs font-medium leading-4 text-foreground">
          {step.label || "Untitled step"}
        </button>
      )}
      <div className="absolute right-1 top-1/2 flex -translate-y-1/2 shrink-0 items-center gap-0.5 rounded bg-card/90 opacity-0 shadow-sm transition-opacity group-hover/step:opacity-100">
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={onEdit} aria-label="Edit step">
          <Pencil className="h-3 w-3" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6 text-destructive hover:bg-red-50 hover:text-destructive" onClick={onDelete} aria-label="Delete step">
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}

function StepGapButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group/gap -mx-1 flex w-10 shrink-0 items-center justify-center text-primary" aria-label={label}>
      <span className="flex h-8 w-8 scale-75 items-center justify-center rounded-full border border-primary/25 bg-card text-primary opacity-0 shadow-sm transition-all group-hover/gap:scale-100 group-hover/gap:opacity-100">
        <Plus className="h-3.5 w-3.5" />
      </span>
    </button>
  );
}

function StepEndButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="group/end ml-1 flex min-w-[72px] shrink-0 items-center justify-center rounded-md border-2 border-dashed border-primary/28 bg-transparent text-primary transition-colors hover:border-primary/45 hover:bg-accent/35" aria-label="Add step at end">
      <span className="flex h-9 w-9 items-center justify-center rounded-full border border-primary/25 bg-card text-primary shadow-sm transition-transform group-hover/end:scale-105">
        <Plus className="h-5 w-5" />
      </span>
    </button>
  );
}

function OutcomeEditor({ value, onChange, onCancel, onSave, isNew = false }: { value: WorkflowOutcome; onChange: (value: WorkflowOutcome) => void; onCancel: () => void; onSave: () => void; isNew?: boolean }) {
  return (
    <Card className="rounded-lg border-primary/30 bg-card/96 p-3 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold">{isNew ? "Add Outcome" : "Edit Outcome"}</div>
          <div className="text-xs text-muted-foreground">Builder edits are stored locally in this browser.</div>
        </div>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            <X className="h-3.5 w-3.5" />
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={onSave}>
            <Save className="h-3.5 w-3.5" />
            Save
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <BuilderField label="Outcome name">
          <input value={value.title} onChange={(event) => onChange({ ...value, title: event.target.value })} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary" />
        </BuilderField>
        <BuilderField label="Case matching">
          <select value={value.branch} onChange={(event) => onChange({ ...value, branch: event.target.value as WorkflowBranch })} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary">
            {branchOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </BuilderField>
        <BuilderField label="Tone">
          <select value={value.tone} onChange={(event) => onChange({ ...value, tone: event.target.value as WorkflowTone })} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary">
            {toneOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </BuilderField>
        <BuilderField label="Description">
          <input value={value.caption} onChange={(event) => onChange({ ...value, caption: event.target.value })} className="h-9 w-full rounded-md border bg-background px-3 text-sm outline-none focus:border-primary" />
        </BuilderField>
      </div>
    </Card>
  );
}

function BuilderField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
      <span>{label}</span>
      {children}
    </label>
  );
}

function getOutcomeToneClass(tone: WorkflowTone) {
  return {
    teal: "border-cyan-100 bg-cyan-50 text-cyan-900",
    green: "border-green-100 bg-green-50 text-green-900",
    amber: "border-amber-100 bg-amber-50 text-amber-900",
    blue: "border-blue-100 bg-blue-50 text-blue-900",
    red: "border-red-100 bg-red-50 text-red-900",
  }[tone];
}

function isPanBlocked(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest("[data-no-pan],button,a,input,select,textarea"));
}

function isWheelPanBlocked(target: EventTarget | null, boundary: HTMLElement) {
  if (!(target instanceof Element)) {
    return false;
  }

  if (target.closest("button,a,input,select,textarea")) {
    return true;
  }

  let element: Element | null = target;
  while (element && element !== boundary) {
    if (element instanceof HTMLElement) {
      const style = window.getComputedStyle(element);
      const scrollsX = /(auto|scroll|overlay)/.test(style.overflowX) && element.scrollWidth > element.clientWidth;
      const scrollsY = /(auto|scroll|overlay)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;

      if (scrollsX || scrollsY) {
        return true;
      }
    }
    element = element.parentElement;
  }

  return false;
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

function getNodeItems(processed: ProcessedRequest[], branch: WorkflowBranch) {
  if (branch === "human_review") {
    return processed.filter((item) => item.remediation.requires_human_review);
  }
  if (branch === "custom") {
    return [];
  }
  return processed.filter((item) => item.type_decision.type === branch);
}

function normalizeOutcome(outcome: WorkflowOutcome): WorkflowOutcome {
  return {
    ...outcome,
    title: outcome.title.trim() || "Untitled Outcome",
    caption: outcome.caption.trim() || "No description yet",
    steps: outcome.steps.map((step) => ({ ...step, label: step.label.trim() || "Untitled step" })),
  };
}

function reorderById<T extends { id: string }>(items: T[], draggedId: string, targetId: string) {
  const draggedIndex = items.findIndex((item) => item.id === draggedId);
  const targetIndex = items.findIndex((item) => item.id === targetId);

  if (draggedIndex < 0 || targetIndex < 0) {
    return items;
  }

  const next = [...items];
  const [dragged] = next.splice(draggedIndex, 1);
  next.splice(targetIndex, 0, dragged);
  return next;
}

function createLocalId(prefix: string) {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function upsertProcessed(current: ProcessedRequest[], next: ProcessedRequest) {
  const without = current.filter((item) => item.request.id !== next.request.id);
  return [next, ...without];
}

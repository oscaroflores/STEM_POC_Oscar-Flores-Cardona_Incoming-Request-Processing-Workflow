"use client";

import * as React from "react";
import { Activity, Bot, ClipboardCheck, Inbox, LayoutDashboard, Play, RefreshCcw, Square, Stethoscope } from "lucide-react";
import { AdHocRequestForm } from "@/components/ad-hoc-request-form";
import { DashboardSummary } from "@/components/dashboard-summary";
import { EscalationQueue } from "@/components/escalation-queue";
import { RequestCard } from "@/components/request-card";
import { RequestDetailSheet } from "@/components/request-detail-sheet";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API_BASE_URL, getDashboard, getHealth, getInbox, processRequest, recordOverride, resetAuditLog, streamUrl } from "@/lib/api";
import type { DashboardSummary as DashboardSummaryType, HealthStatus, IncomingRequest, OverridePayload, ProcessedRequest, StreamPayload } from "@/lib/types";
import { cn } from "@/lib/utils";

const emptyDashboard: DashboardSummaryType = {
  total_processed: 0,
  by_type: {},
  by_urgency: {},
  pending_human_review: 0,
  avg_confidence: null,
  generated_at: new Date().toISOString(),
};

export function OperationsConsole() {
  const [health, setHealth] = React.useState<HealthStatus | null>(null);
  const [dashboard, setDashboard] = React.useState<DashboardSummaryType>(emptyDashboard);
  const [incoming, setIncoming] = React.useState<IncomingRequest[]>([]);
  const [processed, setProcessed] = React.useState<ProcessedRequest[]>([]);
  const [processing, setProcessing] = React.useState<ProcessedRequest | null>(null);
  const [selected, setSelected] = React.useState<ProcessedRequest | null>(null);
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [streamProgress, setStreamProgress] = React.useState<{ index: number; total: number } | null>(null);
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});
  const [error, setError] = React.useState<string | null>(null);
  const streamRef = React.useRef<EventSource | null>(null);

  const escalations = processed.filter((item) => item.remediation.requires_human_review);
  const processedIds = React.useMemo(() => new Set(processed.map((item) => item.request.id)), [processed]);
  const visibleIncoming = incoming.filter((request) => request.id !== processing?.request.id && !processedIds.has(request.id));

  React.useEffect(() => {
    void loadInitialState();
    return () => streamRef.current?.close();
  }, []);

  async function loadInitialState() {
    setError(null);
    try {
      const [healthResult, inboxResult, dashboardResult] = await Promise.all([getHealth(), getInbox(), getDashboard()]);
      setHealth(healthResult);
      setIncoming(inboxResult);
      setDashboard(dashboardResult);
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
      setIsSheetOpen(false);
      setOverrides({});
      setDashboard(emptyDashboard);
      await loadInitialState();
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Unable to reset demo state.");
    }
  }

  async function submitAdHoc(request: IncomingRequest) {
    const result = await processRequest(request);
    setProcessed((current) => upsertProcessed(current, result));
    setDashboard(await getDashboard());
    setSelected(result);
    setIsSheetOpen(true);
    return result;
  }

  async function submitOverride(payload: OverridePayload) {
    const result = await recordOverride(payload);
    setOverrides((current) => ({ ...current, [payload.request_id]: `${result.action.replace(/_/g, " ")}: ${result.note || "No note"}` }));
  }

  function openRequest(request: ProcessedRequest) {
    setSelected(request);
    setIsSheetOpen(true);
  }

  return (
    <main className="notion-grid min-h-screen">
      <div className="mx-auto flex min-h-screen max-w-[1680px] gap-0 border-x bg-background/82 backdrop-blur-xl">
        <aside className="hidden w-72 shrink-0 border-r bg-card/72 px-5 py-6 lg:block">
          <div className="mb-8 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <div className="text-sm font-semibold">Conductor</div>
              <div className="text-xs text-muted-foreground">TeleMedik POC</div>
            </div>
          </div>

          <nav className="space-y-1 text-sm">
            <SidebarItem icon={LayoutDashboard} label="Operations home" active />
            <SidebarItem icon={Inbox} label="Live inbox" />
            <SidebarItem icon={Activity} label="Escalations" count={escalations.length} />
            <SidebarItem icon={ClipboardCheck} label="Audit-ready outputs" />
          </nav>

          <div className="mt-8 rounded-lg border bg-muted/35 p-4 text-xs leading-5 text-muted-foreground">
            <div className="mb-2 font-semibold text-foreground">Design thesis</div>
            AI reads and classifies. Deterministic workflow rules route, draft, log, and escalate.
          </div>

          <div className="mt-4 rounded-lg border border-cyan-100 bg-cyan-50/70 p-4 text-xs leading-5 text-cyan-900">
            Healthcare-safe: clinical content is routed to a person. The AI does not make treatment decisions.
          </div>
        </aside>

        <section className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8">
          <header className="mb-5 flex flex-col justify-between gap-4 rounded-xl border bg-card/86 p-5 card-lift lg:flex-row lg:items-center">
            <div>
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <Badge variant="teal">Healthcare contact center</Badge>
                <Badge variant="outline">Notion-style ops console</Badge>
                <Badge variant={health?.live_model_enabled ? "success" : "warning"}>{health?.live_model_enabled ? "Bedrock primary" : "Fallback ready"}</Badge>
              </div>
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Incoming Request Processing Workflow</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
                Live AI classification, branch-specific remediation, human-in-the-loop escalation, and audit-ready handoffs for mixed Spanish and English requests.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={startStream} disabled={isStreaming}>
                <Play className="h-4 w-4" />
                Run live inbox
              </Button>
              <Button type="button" variant="outline" onClick={stopStream} disabled={!isStreaming}>
                <Square className="h-4 w-4" />
                Stop
              </Button>
              <Button type="button" variant="secondary" onClick={resetDemo}>
                <RefreshCcw className="h-4 w-4" />
                Reset
              </Button>
            </div>
          </header>

          {error ? (
            <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
              {error}
              <div className="mt-1 text-xs text-red-700">API base URL: {API_BASE_URL}</div>
            </div>
          ) : null}

          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
            <div className="min-w-0 space-y-5">
              <Card className="card-lift">
                <CardHeader className="flex flex-col justify-between gap-3 border-b pb-4 sm:flex-row sm:items-center">
                  <div>
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Bot className="h-4 w-4 text-primary" />
                      Autonomous inbox run
                    </CardTitle>
                    <CardDescription>
                      {streamProgress ? `Processed ${streamProgress.index} of ${streamProgress.total}` : "Ready to drain the seeded bilingual inbox."}
                    </CardDescription>
                  </div>
                  <div className="rounded-full border bg-muted px-3 py-1 text-xs text-muted-foreground">
                    {visibleIncoming.length} incoming · {processing ? 1 : 0} processing · {processed.length} outcome
                  </div>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <BoardColumn title="Incoming" description="Seeded email, form, and inbox items" count={visibleIncoming.length}>
                      {visibleIncoming.length ? (
                        visibleIncoming.map((request) => <RequestCard key={request.id} request={request} state="incoming" />)
                      ) : (
                        <EmptyColumn text="No waiting requests." />
                      )}
                    </BoardColumn>

                    <BoardColumn title="Processing" description="AI judgment plus deterministic branch actions" count={processing ? 1 : 0} active={Boolean(processing)}>
                      {processing ? <RequestCard request={processing.request} processed={processing} state="processing" onClick={() => openRequest(processing)} /> : <EmptyColumn text="Start the stream to watch cases route live." />}
                    </BoardColumn>

                    <BoardColumn title="Outcome" description="Audit-ready handoff packages" count={processed.length}>
                      {processed.length ? (
                        processed.map((item) => <RequestCard key={item.request.id} request={item.request} processed={item} state="outcome" onClick={() => openRequest(item)} />)
                      ) : (
                        <EmptyColumn text="Completed cases will land here." />
                      )}
                    </BoardColumn>
                  </div>
                </CardContent>
              </Card>

              <Tabs defaultValue="ad-hoc" className="w-full">
                <TabsList>
                  <TabsTrigger value="ad-hoc">Ad-hoc request</TabsTrigger>
                  <TabsTrigger value="outputs">Output checklist</TabsTrigger>
                </TabsList>
                <TabsContent value="ad-hoc">
                  <AdHocRequestForm onSubmitRequest={submitAdHoc} />
                </TabsContent>
                <TabsContent value="outputs">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">What each processed request outputs</CardTitle>
                      <CardDescription>Designed for an operations manager reviewing work queues, not a developer reading logs.</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
                      {[
                        "Classification label and urgency level",
                        "Confidence score, rationale, and classifier source",
                        "Branch-specific action summary with ordered steps",
                        "Assigned team, SLA or follow-up marker",
                        "Bilingual acknowledgement draft",
                        "Human review reason for clinical or uncertain cases",
                      ].map((item) => (
                        <div key={item} className="rounded-md border bg-muted/35 p-3 text-muted-foreground">{item}</div>
                      ))}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </div>

            <aside className="space-y-5">
              <DashboardSummary dashboard={dashboard} health={health} isStreaming={isStreaming} />
              <EscalationQueue items={escalations} onSelect={openRequest} />
            </aside>
          </div>
        </section>
      </div>

      <RequestDetailSheet
        request={selected}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        onOverride={submitOverride}
        overrideNote={selected ? overrides[selected.request.id] : undefined}
      />
    </main>
  );
}

function upsertProcessed(current: ProcessedRequest[], next: ProcessedRequest) {
  const without = current.filter((item) => item.request.id !== next.request.id);
  return [next, ...without];
}

function SidebarItem({ icon: Icon, label, active, count }: { icon: typeof Inbox; label: string; active?: boolean; count?: number }) {
  return (
    <div className={cn("flex items-center justify-between rounded-md px-3 py-2 text-muted-foreground", active && "bg-muted text-foreground")}>
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      {count !== undefined ? <span className="rounded bg-card px-1.5 py-0.5 text-xs">{count}</span> : null}
    </div>
  );
}

function BoardColumn({ title, description, count, active, children }: { title: string; description: string; count: number; active?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn("min-h-[520px] rounded-lg border bg-muted/28", active && "border-primary/40 bg-cyan-50/45")}>
      <div className="border-b px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <span className="rounded-full bg-card px-2 py-0.5 text-xs text-muted-foreground">{count}</span>
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
      </div>
      <ScrollArea className="h-[470px]">
        <div className="space-y-3 p-3">{children}</div>
      </ScrollArea>
    </div>
  );
}

function EmptyColumn({ text }: { text: string }) {
  return <div className="rounded-lg border border-dashed bg-card/60 p-4 text-center text-sm text-muted-foreground">{text}</div>;
}

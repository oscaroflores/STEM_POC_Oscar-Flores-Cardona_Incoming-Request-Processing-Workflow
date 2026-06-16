"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  Inbox,
  Mail,
  MailOpen,
  PanelRightOpen,
  RefreshCcw,
  Route,
  Search,
  ShieldAlert,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { AppRail } from "@/components/app-rail";
import { LanguageBadge, StatusField, TypeBadge, UrgencyBadge } from "@/components/status-badges";
import { RequestDetailSheet } from "@/components/request-detail-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { API_BASE_URL, getCases, getDashboard, getHealth, getInbox, getOverrides, recordOverride } from "@/lib/api";
import type { DashboardSummary, HealthStatus, IncomingRequest, OverridePayload, ProcessedRequest, Urgency } from "@/lib/types";
import { cn, formatPercent, titleize } from "@/lib/utils";

type FolderKey = "all" | "inbox" | "routed" | "review" | "priority";

type MailboxItem = {
  id: string;
  request: IncomingRequest;
  processed?: ProcessedRequest;
  status: "unclassified" | "routed" | "review";
};

const emptyDashboard: DashboardSummary = {
  total_processed: 0,
  by_type: {},
  by_urgency: {},
  pending_human_review: 0,
  avg_confidence: null,
  generated_at: new Date().toISOString(),
};

const POLL_INTERVAL_MS = 4000;

export function LiveInboxConsole() {
  const [health, setHealth] = React.useState<HealthStatus | null>(null);
  const [dashboard, setDashboard] = React.useState<DashboardSummary>(emptyDashboard);
  const [incoming, setIncoming] = React.useState<IncomingRequest[]>([]);
  const [processed, setProcessed] = React.useState<ProcessedRequest[]>([]);
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});
  const [folder, setFolder] = React.useState<FolderKey>("all");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailRequest, setDetailRequest] = React.useState<ProcessedRequest | null>(null);
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const items = React.useMemo(() => buildMailboxItems(incoming, processed), [incoming, processed]);
  const filteredItems = React.useMemo(() => filterMailboxItems(items, folder, query), [items, folder, query]);
  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;
  const escalations = processed.filter((item) => item.remediation.requires_human_review);
  const highPriority = processed.filter((item) => isHighPriority(item.type_decision.urgency));

  React.useEffect(() => {
    void loadState();

    const pollId = window.setInterval(() => {
      if (!document.hidden) {
        void loadState({ showLoading: false });
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(pollId);
  }, []);

  React.useEffect(() => {
    if (!filteredItems.length) {
      setSelectedId(null);
      return;
    }

    if (!selectedId || !filteredItems.some((item) => item.id === selectedId)) {
      setSelectedId(filteredItems[0].id);
    }
  }, [filteredItems, selectedId]);

  async function loadState(options: { showLoading?: boolean } = {}) {
    const showLoading = options.showLoading ?? true;
    if (showLoading) {
      setIsLoading(true);
    }
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
    } finally {
      if (showLoading) {
        setIsLoading(false);
      }
    }
  }

  async function submitOverride(payload: OverridePayload) {
    const result = await recordOverride(payload);
    setOverrides((current) => ({ ...current, [payload.request_id]: `${result.action.replace(/_/g, " ")}: ${result.note || "No note"}` }));
  }

  function openFullCase(request: ProcessedRequest) {
    setDetailRequest(request);
    setIsSheetOpen(true);
  }

  return (
    <main className="notion-grid flex min-h-screen bg-background/80">
      <AppRail active="inbox" escalations={escalations.length} />

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden border bg-[#fbfaf6]/95 shadow-[0_1px_1px_rgba(31,35,40,0.04),0_30px_90px_rgba(31,35,40,0.08)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card/78 px-4 py-3 backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">Live Inbox</div>
              <div className="text-xs text-muted-foreground">Email-style intake view using persisted request and case schemas</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <StatusField label="API" value={health?.status === "ok" ? "Connected" : "Waiting"} tone={health?.status === "ok" ? "green" : "default"} />
            <StatusField label="Requests" value={`${items.length} Total`} />
            <Button type="button" size="sm" variant="outline" onClick={() => void loadState()} disabled={isLoading}>
              <RefreshCcw className={cn("h-4 w-4", isLoading && "animate-spin")} />
              Refresh
            </Button>
            <Button type="button" size="sm" variant="secondary" asChild>
              <Link href="/">Workflow Canvas</Link>
            </Button>
          </div>
        </header>

        {error ? (
          <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
            {error}
            <div className="mt-1 text-xs text-red-700">API base URL: {API_BASE_URL}</div>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_minmax(360px,0.92fr)_minmax(420px,1.2fr)]">
          <MailboxFolders
            active={folder}
            onChange={setFolder}
            counts={{
              all: items.length,
              inbox: items.filter((item) => item.status === "unclassified").length,
              routed: items.filter((item) => item.status === "routed").length,
              review: escalations.length,
              priority: highPriority.length,
            }}
            dashboard={dashboard}
          />

          <section className="min-h-0 border-t bg-card/60 lg:border-l lg:border-t-0">
            <div className="border-b bg-card/72 p-3">
              <label className="flex h-9 items-center gap-2 rounded-md border bg-background px-3 text-sm text-muted-foreground shadow-sm">
                <Search className="h-4 w-4" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search member, subject, channel, or route"
                  className="min-w-0 flex-1 bg-transparent text-foreground outline-none placeholder:text-muted-foreground"
                />
              </label>
              <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
                <span>{filteredItems.length} messages</span>
                <span>{processed.length} routed cases</span>
              </div>
            </div>

            <ScrollArea className="h-[calc(100vh-158px)]">
              <div className="divide-y">
                {filteredItems.map((item) => (
                  <MailboxRow key={item.id} item={item} selected={selectedItem?.id === item.id} onSelect={() => setSelectedId(item.id)} />
                ))}
                {filteredItems.length === 0 ? <EmptyInbox /> : null}
              </div>
            </ScrollArea>
          </section>

          <section className="min-h-0 border-t bg-[#fffefa]/90 lg:border-l lg:border-t-0">
            <ScrollArea className="h-[calc(100vh-76px)]">
              <ReadingPane item={selectedItem} onOpenFullCase={openFullCase} overrideNote={selectedItem?.processed ? overrides[selectedItem.id] : undefined} />
            </ScrollArea>
          </section>
        </div>
      </section>

      <RequestDetailSheet
        request={detailRequest}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        onOverride={submitOverride}
        overrideNote={detailRequest ? overrides[detailRequest.request.id] : undefined}
      />
    </main>
  );
}

function MailboxFolders({
  active,
  onChange,
  counts,
  dashboard,
}: {
  active: FolderKey;
  onChange: (key: FolderKey) => void;
  counts: Record<FolderKey, number>;
  dashboard: DashboardSummary;
}) {
  const folders: Array<{ key: FolderKey; label: string; icon: typeof Inbox; tone?: string }> = [
    { key: "all", label: "All Requests", icon: Mail },
    { key: "inbox", label: "Unclassified", icon: Inbox },
    { key: "routed", label: "Routed Cases", icon: Route },
    { key: "review", label: "Human Review", icon: ShieldAlert, tone: "text-red-700" },
    { key: "priority", label: "High Priority", icon: AlertTriangle, tone: "text-amber-700" },
  ];

  return (
    <aside className="border-t bg-[#f4f2eb]/80 p-3 lg:border-t-0">
      <div className="mb-4 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <Stethoscope className="h-3.5 w-3.5" />
        Mailboxes
      </div>
      <nav className="space-y-1">
        {folders.map((folder) => {
          const Icon = folder.icon;
          return (
            <button
              key={folder.key}
              type="button"
              onClick={() => onChange(folder.key)}
              className={cn(
                "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-muted-foreground transition-colors hover:bg-card hover:text-foreground",
                active === folder.key && "bg-card text-foreground shadow-sm",
              )}
            >
              <Icon className={cn("h-4 w-4 shrink-0", folder.tone)} />
              <span className="min-w-0 flex-1 truncate">{folder.label}</span>
              <span className="rounded bg-background px-1.5 py-0.5 text-xs">{counts[folder.key]}</span>
            </button>
          );
        })}
      </nav>

      <Card className="mt-5 p-3">
        <div className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Today</div>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <MiniMetric label="Processed" value={String(dashboard.total_processed)} />
          <MiniMetric label="Review" value={String(dashboard.pending_human_review)} />
          <MiniMetric label="Confidence" value={formatPercent(dashboard.avg_confidence)} />
          <MiniMetric label="Updated" value={formatShortTime(dashboard.generated_at)} />
        </div>
      </Card>
    </aside>
  );
}

function MailboxRow({ item, selected, onSelect }: { item: MailboxItem; selected: boolean; onSelect: () => void }) {
  const processed = item.processed;
  const isUnclassified = item.status === "unclassified";
  const isProcessed = Boolean(processed);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "block w-full px-3 py-3 text-left transition-shadow",
        isProcessed ? "bg-stone-100/75 text-muted-foreground" : "bg-[#fffefa] text-foreground",
        selected && "relative z-10 shadow-[inset_3px_0_0_var(--primary),0_0_0_1px_rgba(8,122,143,0.28)]",
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isUnclassified ? <Mail className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
            <span className={cn("truncate", isUnclassified && "font-semibold text-foreground")}>{item.request.member_name || "Member"}</span>
          </div>
          <div className={cn("mt-1 line-clamp-1 text-sm font-semibold", isProcessed ? "text-muted-foreground" : "text-foreground")}>{item.request.subject}</div>
        </div>
        <div className={cn("shrink-0 text-right text-[11px] text-muted-foreground", isProcessed && "opacity-75")}>
          <div>{processed ? formatShortTime(processed.processed_at) : "Waiting"}</div>
          <div className="mt-1">{item.request.id}</div>
        </div>
      </div>

      <p className={cn("line-clamp-2 text-xs leading-5 text-muted-foreground", isProcessed && "opacity-75")}>{item.request.body}</p>

      <div className={cn("mt-3 grid grid-cols-4 gap-1.5", isProcessed && "opacity-80")}>
        {processed ? (
          <>
            <TypeBadge type={processed.type_decision.type} />
            <UrgencyBadge urgency={processed.type_decision.urgency} />
            <StatusField
              label="Confidence"
              value={formatPercent(processed.type_decision.confidence)}
              attention={processed.type_decision.confidence < 0.75 || processed.remediation.requires_human_review}
            />
            <StatusField label="Channel" value={titleize(item.request.channel)} />
          </>
        ) : (
          <>
            <StatusField label="Type" value="Pending" />
            <StatusField label="Urgency" value="Pending" />
            <StatusField label="Confidence" value="--" />
            <StatusField label="Channel" value={titleize(item.request.channel)} />
          </>
        )}
      </div>
    </button>
  );
}

function ReadingPane({
  item,
  onOpenFullCase,
  overrideNote,
}: {
  item: MailboxItem | null;
  onOpenFullCase: (request: ProcessedRequest) => void;
  overrideNote?: string;
}) {
  if (!item) {
    return (
      <div className="flex min-h-[620px] items-center justify-center p-8 text-center">
        <div>
          <Inbox className="mx-auto mb-3 h-8 w-8 text-primary/70" />
          <div className="text-sm font-semibold">No request selected</div>
          <p className="mt-1 max-w-sm text-sm leading-6 text-muted-foreground">Select a message to review the intake request and any generated workflow outputs.</p>
        </div>
      </div>
    );
  }

  const processed = item.processed;

  return (
    <div className="p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b pb-4">
        <div className="min-w-0">
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {processed ? (
              <>
                <TypeBadge type={processed.type_decision.type} />
                <UrgencyBadge urgency={processed.type_decision.urgency} />
                <LanguageBadge language={processed.type_decision.language} />
                <StatusField label="Review" value={processed.remediation.requires_human_review ? "Human" : "Auto"} tone={processed.remediation.requires_human_review ? "red" : "green"} />
              </>
            ) : (
              <StatusField label="Status" value="Awaiting Classification" className="sm:col-span-2" />
            )}
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{item.request.subject}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>{item.request.id}</span>
            <span>-</span>
            <span>{item.request.member_name || "Member"}</span>
            <span>-</span>
            <span>{titleize(item.request.channel)}</span>
          </div>
        </div>
        {processed ? (
          <Button type="button" size="sm" onClick={() => onOpenFullCase(processed)}>
            <PanelRightOpen className="h-4 w-4" />
            Full case detail
          </Button>
        ) : (
          <Button type="button" size="sm" variant="outline" asChild>
            <Link href="/">Run workflow</Link>
          </Button>
        )}
      </div>

      <section className="rounded-lg border bg-muted/30 p-4">
        <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <UserRound className="h-4 w-4 text-primary" />
          Original request
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.request.body}</p>
      </section>

      {processed ? <ProcessedDetails request={processed} overrideNote={overrideNote} /> : <UnclassifiedDetails />}
    </div>
  );
}

function ProcessedDetails({ request, overrideNote }: { request: ProcessedRequest; overrideNote?: string }) {
  const entities = Object.entries(request.type_decision.key_entities ?? {});

  return (
    <div className="mt-5 space-y-5">
      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Bot className="h-4 w-4 text-primary" />
          Classification
        </div>
        <div className="mb-3 flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Confidence</span>
          <span className="font-semibold">{formatPercent(request.type_decision.confidence)}</span>
        </div>
        <Progress value={request.type_decision.confidence * 100} />
        <p className="mt-4 text-sm leading-6 text-muted-foreground">{request.type_decision.rationale}</p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Info label="Classifier source" value={request.type_decision.source} />
          <Info label="PHI present" value={request.type_decision.phi_present ? "Yes" : "No"} />
          <Info label="Clinical flag" value={request.type_decision.clinical_flag ? "Yes" : "No"} />
          <Info label="Processed at" value={formatDate(request.processed_at)} />
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Route className="h-4 w-4 text-primary" />
          Routing and remediation
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Info label="Assigned team" value={request.remediation.assigned_team} />
          <Info label="Branch" value={titleize(request.remediation.branch)} />
          <Info label="SLA" value={request.remediation.sla || "Not set"} />
          <Info label="Follow-up" value={request.remediation.follow_up || "Not set"} />
        </div>
        {request.remediation.escalation_reason ? (
          <div className="mt-4 rounded-md border border-red-100 bg-red-50 p-3 text-sm leading-6 text-red-900">
            <div className="mb-1 flex items-center gap-2 font-semibold">
              <ShieldAlert className="h-4 w-4" />
              Escalation reason
            </div>
            {request.remediation.escalation_reason}
          </div>
        ) : null}
        <div className="mt-4 space-y-3">
          {request.remediation.actions.map((action, index) => (
            <div key={`${action.step}-${index}`} className="flex gap-3 rounded-md bg-muted/35 p-3">
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{index + 1}</div>
              <div>
                <div className="text-sm font-medium">{titleize(action.step)}</div>
                <div className="text-sm leading-6 text-muted-foreground">{action.detail}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border bg-card p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          Generated acknowledgement
        </div>
        <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">{request.remediation.draft_response}</pre>
      </section>

      {entities.length || overrideNote ? (
        <section className="rounded-lg border bg-card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-primary" />
            Case metadata
          </div>
          {entities.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {entities.map(([key, value]) => (
                <Info key={key} label={titleize(key)} value={String(value)} />
              ))}
            </div>
          ) : null}
          {overrideNote ? <p className="mt-3 rounded-md bg-muted/45 p-3 text-sm text-muted-foreground">Override: {overrideNote}</p> : null}
        </section>
      ) : null}
    </div>
  );
}

function UnclassifiedDetails() {
  return (
    <section className="mt-5 rounded-lg border border-dashed bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Clock3 className="h-4 w-4 text-primary" />
        Waiting for workflow processing
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        This request is present in the intake inbox but does not have a persisted case record yet. Run the workflow canvas to classify it and generate branch-specific outputs.
      </p>
    </section>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-background px-2.5 py-2">
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="mt-1 truncate text-sm font-semibold">{value}</div>
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

function EmptyInbox() {
  return (
    <div className="p-8 text-center text-sm text-muted-foreground">
      <Inbox className="mx-auto mb-2 h-6 w-6 text-primary/70" />
      No requests match this mailbox.
    </div>
  );
}

function buildMailboxItems(incoming: IncomingRequest[], processed: ProcessedRequest[]): MailboxItem[] {
  const processedIds = new Set(processed.map((item) => item.request.id));
  const unclassified = incoming
    .filter((request) => !processedIds.has(request.id))
    .map((request) => ({ id: request.id, request, status: "unclassified" as const }));

  const routed = [...processed]
    .sort((a, b) => new Date(b.processed_at).getTime() - new Date(a.processed_at).getTime())
    .map((request) => ({
      id: request.request.id,
      request: request.request,
      processed: request,
      status: request.remediation.requires_human_review ? ("review" as const) : ("routed" as const),
    }));

  return [...unclassified, ...routed];
}

function filterMailboxItems(items: MailboxItem[], folder: FolderKey, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => {
    const matchesFolder =
      folder === "all" ||
      (folder === "inbox" && item.status === "unclassified") ||
      (folder === "routed" && item.status === "routed") ||
      (folder === "review" && item.status === "review") ||
      (folder === "priority" && item.processed && isHighPriority(item.processed.type_decision.urgency));

    if (!matchesFolder) return false;
    if (!normalizedQuery) return true;

    const haystack = [
      item.request.id,
      item.request.member_name,
      item.request.subject,
      item.request.body,
      item.request.channel,
      item.processed?.type_decision.type,
      item.processed?.type_decision.urgency,
      item.processed?.remediation.assigned_team,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

function isHighPriority(urgency: Urgency) {
  return urgency === "high" || urgency === "critical";
}

function formatShortTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

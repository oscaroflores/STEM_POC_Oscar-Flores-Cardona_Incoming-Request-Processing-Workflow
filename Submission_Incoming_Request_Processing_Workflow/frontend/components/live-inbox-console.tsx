"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Bot,
  CheckCircle2,
  Clock3,
  ClipboardCheck,
  FileText,
  Inbox,
  LockKeyhole,
  Mail,
  MailOpen,
  PanelRightOpen,
  RefreshCcw,
  Route,
  Search,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { AppRail } from "@/components/app-rail";
import { BrandLogoMark } from "@/components/brand-logo-mark";
import { LanguageBadge, StatusField, TypeBadge, UrgencyBadge } from "@/components/status-badges";
import { RequestDetailSheet } from "@/components/request-detail-sheet";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { API_BASE_URL, getAudit, getCases, getDashboard, getHealth, getInbox, getMaskingHealth, getOverrides, recordOverride } from "@/lib/api";
import { isDashboardEqual, setIfChanged } from "@/lib/state-utils";
import type { Action, AuditEntry, DashboardSummary, HealthStatus, IncomingRequest, MaskingHealth, OverridePayload, PhiSummary, ProcessedRequest, Urgency } from "@/lib/types";
import { cn, formatPercent, titleize } from "@/lib/utils";

type FolderKey = "all" | "inbox" | "routed" | "review" | "priority" | "audit" | "overrides";

type MailboxItem = {
  id: string;
  request: IncomingRequest;
  processed?: ProcessedRequest;
  auditEntries: AuditEntry[];
  overrideNote?: string;
  status: "unclassified" | "routed" | "review" | "audit";
};

const emptyDashboard: DashboardSummary = {
  total_processed: 0,
  by_type: {},
  by_urgency: {},
  pending_human_review: 0,
  avg_confidence: null,
  generated_at: new Date().toISOString(),
};

const POLL_INTERVAL_MS = 15000;

export function LiveInboxConsole() {
  const [health, setHealth] = React.useState<HealthStatus | null>(null);
  const [maskingHealth, setMaskingHealth] = React.useState<MaskingHealth | null>(null);
  const [role, setRole] = React.useState("agent");
  const [dashboard, setDashboard] = React.useState<DashboardSummary>(emptyDashboard);
  const [incoming, setIncoming] = React.useState<IncomingRequest[]>([]);
  const [processed, setProcessed] = React.useState<ProcessedRequest[]>([]);
  const [auditEntries, setAuditEntries] = React.useState<AuditEntry[]>([]);
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});
  const [folder, setFolder] = React.useState<FolderKey>("all");
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detailRequest, setDetailRequest] = React.useState<ProcessedRequest | null>(null);
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const items = React.useMemo(() => buildMailboxItems(incoming, processed, auditEntries, overrides), [incoming, processed, auditEntries, overrides]);
  const filteredItems = React.useMemo(() => filterMailboxItems(items, folder, query), [items, folder, query]);
  const selectedItem = filteredItems.find((item) => item.id === selectedId) ?? filteredItems[0] ?? null;
  const escalations = processed.filter((item) => item.remediation.requires_human_review);

  React.useEffect(() => {
    void loadState();

    const pollId = window.setInterval(() => {
      if (!document.hidden) {
        void loadState({ showLoading: false });
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(pollId);
  }, [role]);

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
      const [healthResult, maskingHealthResult, inboxResult, dashboardResult, caseResult, auditResult, overrideResult] = await Promise.all([
        getHealth(),
        getMaskingHealth(),
        getInbox(role),
        getDashboard(role),
        getCases(role),
        getAudit(role),
        getOverrides(role),
      ]);
      setIfChanged(setHealth, healthResult);
      setIfChanged(setMaskingHealth, maskingHealthResult);
      setIfChanged(setIncoming, inboxResult);
      setIfChanged(setDashboard, dashboardResult, isDashboardEqual);
      setIfChanged(setProcessed, caseResult);
      setIfChanged(setAuditEntries, auditResult);
      setIfChanged(setOverrides, overrideResult);
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
      <AppRail active="inbox" />

      <section className="flex min-w-0 flex-1 flex-col overflow-hidden border bg-[#fbfaf6]/95 shadow-[0_1px_1px_rgba(31,35,40,0.04),0_30px_90px_rgba(31,35,40,0.08)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card/78 px-4 py-3 backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Inbox className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">Request History</div>
              <div className="text-xs text-muted-foreground">Unified intake, routing, audit log, and supervisor review workspace</div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-2.5 py-1.5 text-xs font-medium text-cyan-950">
              Masking Gateway · De-identified · {maskingHealth?.tokens_vaulted ?? 0} tokens vaulted
            </div>
            <label className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
              Role
              <select value={role} onChange={(event) => setRole(event.target.value)} className="bg-transparent font-medium text-foreground outline-none">
                <option value="agent">Agent</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </label>
            <StatusField label="API" value={health?.status === "ok" ? "Connected" : "Waiting"} tone={health?.status === "ok" ? "green" : "default"} />
            <StatusField label="Requests" value={`${items.length} Total`} />
            <StatusField label="Audit Rows" value={String(auditEntries.length)} />
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
              review: items.filter(isItemHumanReview).length,
              priority: items.filter((item) => isHighPriority(getItemUrgency(item))).length,
              audit: items.filter((item) => item.auditEntries.length > 0).length,
              overrides: items.filter((item) => item.overrideNote).length,
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
                <span>{processed.length} routed cases · {auditEntries.length} audit rows</span>
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
              <ReadingPane item={selectedItem} onOpenFullCase={openFullCase} onOverride={submitOverride} />
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
        role={role}
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
    { key: "audit", label: "Audit History", icon: ClipboardCheck, tone: "text-cyan-800" },
    { key: "overrides", label: "Overrides", icon: FileText, tone: "text-blue-700" },
  ];

  return (
    <aside className="border-t bg-[#f4f2eb]/80 p-3 lg:border-t-0">
      <div className="mb-4 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
        <BrandLogoMark className="h-4 w-4 rounded shadow-none" imageClassName="h-3 w-3" />
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
  const latestAudit = item.auditEntries[0];
  const isUnclassified = item.status === "unclassified";
  const hasDecision = Boolean(processed || latestAudit);
  const phiCount = item.request.phi?.count ?? parsePhiSummary(latestAudit?.phi_json).count;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "block w-full px-3 py-3 text-left transition-shadow",
        hasDecision ? "bg-stone-100/75 text-muted-foreground" : "bg-[#fffefa] text-foreground",
        selected && "relative z-10 shadow-[inset_3px_0_0_var(--primary),0_0_0_1px_rgba(8,122,143,0.28)]",
      )}
    >
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {isUnclassified ? <Mail className="h-3.5 w-3.5" /> : latestAudit ? <ClipboardCheck className="h-3.5 w-3.5" /> : <MailOpen className="h-3.5 w-3.5" />}
            <span className={cn("truncate", isUnclassified && "font-semibold text-foreground")}>{item.request.member_name || "Member"}</span>
          </div>
          <div className={cn("mt-1 line-clamp-1 text-sm font-semibold", hasDecision ? "text-muted-foreground" : "text-foreground")}>{item.request.subject}</div>
        </div>
        <div className={cn("shrink-0 text-right text-[11px] text-muted-foreground", hasDecision && "opacity-75")}>
          <div>{processed ? formatShortTime(processed.processed_at) : latestAudit ? formatShortTime(latestAudit.processed_at) : "Waiting"}</div>
          <div className="mt-1">{item.request.id}</div>
        </div>
      </div>

      <p className={cn("line-clamp-2 text-xs leading-5 text-muted-foreground", hasDecision && "opacity-75")}>{item.request.body}</p>

      <div className="mt-2 inline-flex items-center gap-1.5 rounded border border-cyan-100 bg-cyan-50 px-2 py-1 text-[11px] font-medium text-cyan-950">
        <LockKeyhole className="h-3 w-3" />
        {phiCount} PHI tokens vaulted
      </div>

      <div className={cn("mt-3 grid grid-cols-4 gap-1.5", hasDecision && "opacity-80")}>
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
        ) : latestAudit ? (
          <>
            <StatusField label="Type" value={titleize(latestAudit.type)} attention={latestAudit.type === "clinical_urgent"} />
            <StatusField label="Urgency" value={titleize(latestAudit.urgency)} attention={isHighPriority(latestAudit.urgency)} />
            <StatusField label="Confidence" value={formatPercent(latestAudit.confidence)} attention={(latestAudit.confidence ?? 1) < 0.75 || toBoolean(latestAudit.requires_human_review)} />
            <StatusField label="Audit" value={`${item.auditEntries.length} Row${item.auditEntries.length === 1 ? "" : "s"}`} />
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
  onOverride,
}: {
  item: MailboxItem | null;
  onOpenFullCase: (request: ProcessedRequest) => void;
  onOverride: (payload: OverridePayload) => Promise<void>;
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
  const phiCount = item.request.phi?.count ?? parsePhiSummary(item.auditEntries[0]?.phi_json).count;

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
        <div className="mt-3 inline-flex items-center gap-1.5 rounded border border-cyan-100 bg-cyan-50 px-2 py-1 text-[11px] font-medium text-cyan-950">
          <LockKeyhole className="h-3 w-3" />
          {phiCount} PHI tokens vaulted · PHI not sent to model
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
          De-identified request
        </div>
        <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{item.request.body}</p>
      </section>

      {processed ? (
        <ProcessedDetails request={processed} auditEntries={item.auditEntries} overrideNote={item.overrideNote} onOverride={onOverride} />
      ) : (
        <>
          <UnclassifiedDetails />
          <AuditTimeline entries={item.auditEntries} />
        </>
      )}
    </div>
  );
}

function ProcessedDetails({
  request,
  auditEntries,
  overrideNote,
  onOverride,
}: {
  request: ProcessedRequest;
  auditEntries: AuditEntry[];
  overrideNote?: string;
  onOverride: (payload: OverridePayload) => Promise<void>;
}) {
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

      <AuditTimeline entries={auditEntries} />
      <SupervisorOverrideControl request={request} overrideNote={overrideNote} onOverride={onOverride} />
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

function AuditTimeline({ entries }: { entries: AuditEntry[] }) {
  if (!entries.length) {
    return null;
  }

  return (
    <section className="mt-5 rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ClipboardCheck className="h-4 w-4 text-primary" />
        Audit history
      </div>
      <div className="space-y-3">
        {entries.map((entry) => {
          const actions = parseActions(entry.actions_json);
          return (
            <div key={entry.id} className="rounded-md border bg-muted/25 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                <span className="font-semibold text-foreground">Audit row #{entry.id}</span>
                <span>{formatDate(entry.processed_at)}</span>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <StatusField label="Type" value={titleize(entry.type)} attention={entry.type === "clinical_urgent"} />
                <StatusField label="Urgency" value={titleize(entry.urgency)} attention={isHighPriority(entry.urgency)} />
                <StatusField label="Confidence" value={formatPercent(entry.confidence)} attention={(entry.confidence ?? 1) < 0.75 || toBoolean(entry.requires_human_review)} />
                <StatusField label="Review" value={toBoolean(entry.requires_human_review) ? "Human" : "Auto"} tone={toBoolean(entry.requires_human_review) ? "red" : "green"} />
              </div>
              <p className="text-sm leading-6 text-muted-foreground">{entry.rationale || "No rationale stored."}</p>
              {entry.escalation_reason ? <p className="mt-2 rounded-md border border-red-100 bg-red-50 p-2 text-xs leading-5 text-red-900">{entry.escalation_reason}</p> : null}
              {actions.length ? (
                <div className="mt-3 space-y-2">
                  {actions.map((action, index) => (
                    <div key={`${entry.id}-${action.step}-${index}`} className="flex gap-2 text-sm">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent text-[11px] font-semibold text-accent-foreground">{index + 1}</span>
                      <span className="leading-6 text-muted-foreground">
                        <span className="font-medium text-foreground">{titleize(action.step)}:</span> {action.detail}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
              {entry.draft_response ? (
                <details className="mt-3 rounded-md bg-background p-3 text-sm text-muted-foreground">
                  <summary className="cursor-pointer font-medium text-foreground">Generated draft response</summary>
                  <pre className="mt-2 whitespace-pre-wrap font-sans leading-6">{entry.draft_response}</pre>
                </details>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SupervisorOverrideControl({
  request,
  overrideNote,
  onOverride,
}: {
  request: ProcessedRequest;
  overrideNote?: string;
  onOverride: (payload: OverridePayload) => Promise<void>;
}) {
  const [action, setAction] = React.useState<OverridePayload["action"]>("send_to_human");
  const [note, setNote] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  React.useEffect(() => {
    setAction("send_to_human");
    setNote("");
    setStatus(null);
  }, [request.request.id]);

  async function submitOverride(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    try {
      await onOverride({ request_id: request.request.id, action, note });
      setStatus("Override recorded for this request history.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to record override.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="rounded-lg border bg-card p-4">
      <div className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <ShieldAlert className="h-4 w-4 text-primary" />
        Supervisor override
      </div>
      <p className="mb-4 text-sm leading-6 text-muted-foreground">Approve, reassign, or send this AI-routed case to human review from the same request history view.</p>
      <form onSubmit={submitOverride} className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Action</Label>
            <Select value={action} onValueChange={(value) => setAction(value as OverridePayload["action"])}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="send_to_human">Send to human</SelectItem>
                <SelectItem value="reassign">Reassign</SelectItem>
                <SelectItem value="approve">Approve route</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor={`override-note-${request.request.id}`}>Supervisor note</Label>
            <Input id={`override-note-${request.request.id}`} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason or routing note" />
          </div>
        </div>
        <Button type="submit" disabled={isSubmitting} variant={request.remediation.requires_human_review ? "destructive" : "default"}>
          {isSubmitting ? "Recording" : "Record override"}
        </Button>
        {status || overrideNote ? <p className="text-xs leading-5 text-muted-foreground">{status || `Latest override: ${overrideNote}`}</p> : null}
      </form>
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

function buildMailboxItems(incoming: IncomingRequest[], processed: ProcessedRequest[], auditEntries: AuditEntry[], overrides: Record<string, string>): MailboxItem[] {
  const incomingById = new Map(incoming.map((request) => [request.id, request]));
  const processedById = new Map(processed.map((request) => [request.request.id, request]));
  const auditById = new Map<string, AuditEntry[]>();

  for (const entry of auditEntries) {
    const entries = auditById.get(entry.request_id) ?? [];
    entries.push(entry);
    auditById.set(entry.request_id, entries);
  }

  for (const entries of auditById.values()) {
    entries.sort((a, b) => new Date(b.processed_at).getTime() - new Date(a.processed_at).getTime());
  }

  const ids = new Set<string>([
    ...incoming.map((request) => request.id),
    ...processed.map((request) => request.request.id),
    ...auditEntries.map((entry) => entry.request_id),
  ]);

  const items: MailboxItem[] = [];
  for (const id of ids) {
    const processedRequest = processedById.get(id);
    const request = processedRequest?.request ?? incomingById.get(id) ?? makeRequestFromAudit(auditById.get(id)?.[0]);
    if (!request) continue;
    const auditRows = auditById.get(id) ?? [];
    const status: MailboxItem["status"] = processedRequest
      ? processedRequest.remediation.requires_human_review
        ? "review"
        : "routed"
      : incomingById.has(id)
        ? "unclassified"
        : "audit";

    items.push({
      id,
      request,
      processed: processedRequest,
      auditEntries: auditRows,
      overrideNote: overrides[id],
      status,
    });
  }

  return items.sort((a, b) => {
    if (a.status === "unclassified" && b.status !== "unclassified") return -1;
    if (b.status === "unclassified" && a.status !== "unclassified") return 1;
    return getItemTimestamp(b) - getItemTimestamp(a);
  });
}

function filterMailboxItems(items: MailboxItem[], folder: FolderKey, query: string) {
  const normalizedQuery = query.trim().toLowerCase();
  return items.filter((item) => {
    const matchesFolder =
      folder === "all" ||
      (folder === "inbox" && item.status === "unclassified") ||
      (folder === "routed" && item.status === "routed") ||
      (folder === "review" && isItemHumanReview(item)) ||
      (folder === "priority" && isHighPriority(getItemUrgency(item))) ||
      (folder === "audit" && item.auditEntries.length > 0) ||
      (folder === "overrides" && Boolean(item.overrideNote));

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
      item.overrideNote,
      ...item.auditEntries.flatMap((entry) => [entry.type, entry.urgency, entry.assigned_team, entry.rationale, entry.draft_response]),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

function makeRequestFromAudit(entry: AuditEntry | undefined): IncomingRequest | null {
  if (!entry) return null;
  return {
    id: entry.request_id,
    channel: entry.channel || "audit_log",
    mask_id: entry.mask_id,
    member_name: entry.member_name || "Member",
    subject: entry.request_subject || `${titleize(entry.type)} audit record`,
    body: entry.request_body || "Historical audit record without an attached current inbox row.",
    entities: parseJsonObject(entry.entities_json),
    phi: parsePhiSummary(entry.phi_json),
  };
}


function parseJsonObject(value: string | null | undefined): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}


function parsePhiSummary(value: string | null | undefined): PhiSummary {
  const fallback: PhiSummary = { count: 0, tokens: [], kinds: {} };
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value) as Partial<PhiSummary>;
    return {
      count: typeof parsed.count === "number" ? parsed.count : 0,
      tokens: Array.isArray(parsed.tokens) ? parsed.tokens.map(String) : [],
      kinds: parsed.kinds && typeof parsed.kinds === "object" ? (parsed.kinds as Record<string, number>) : {},
    };
  } catch {
    return fallback;
  }
}

function getItemTimestamp(item: MailboxItem) {
  const value = item.processed?.processed_at ?? item.auditEntries[0]?.processed_at;
  if (!value) return 0;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 0 : date.getTime();
}

function getItemUrgency(item: MailboxItem): Urgency {
  return item.processed?.type_decision.urgency ?? item.auditEntries[0]?.urgency ?? "low";
}

function isItemHumanReview(item: MailboxItem) {
  return item.processed?.remediation.requires_human_review ?? toBoolean(item.auditEntries[0]?.requires_human_review);
}

function parseActions(value: string | null | undefined): Action[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is Partial<Action> => Boolean(item) && typeof item === "object")
      .map((item) => ({ step: String(item.step || "action"), detail: String(item.detail || "No detail stored.") }));
  } catch {
    return [];
  }
}

function toBoolean(value: number | boolean | null | undefined) {
  return value === true || value === 1;
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

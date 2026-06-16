"use client";

import * as React from "react";
import { Bot, CheckCircle2, ClipboardList, Eye, LockKeyhole, Route, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { LanguageBadge, StatusField, TypeBadge, UrgencyBadge } from "@/components/status-badges";
import { resolveMasking } from "@/lib/api";
import type { OverridePayload, ProcessedRequest } from "@/lib/types";
import { formatPercent, titleize } from "@/lib/utils";

type RequestDetailSheetProps = {
  request: ProcessedRequest | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOverride: (payload: OverridePayload) => Promise<void>;
  overrideNote?: string;
  role?: string;
};

export function RequestDetailSheet({ request, open, onOpenChange, onOverride, overrideNote, role = "agent" }: RequestDetailSheetProps) {
  const [action, setAction] = React.useState<OverridePayload["action"]>("send_to_human");
  const [note, setNote] = React.useState("");
  const [status, setStatus] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [resolvedValues, setResolvedValues] = React.useState<Record<string, string>>({});
  const [resolveStatus, setResolveStatus] = React.useState<string | null>(null);
  const [isResolving, setIsResolving] = React.useState(false);

  React.useEffect(() => {
    setAction("send_to_human");
    setNote("");
    setStatus(null);
    setResolvedValues({});
    setResolveStatus(null);
  }, [request?.request.id]);

  if (!request) {
    return <Sheet open={open} onOpenChange={onOpenChange} />;
  }

  async function submitOverride(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!request) return;
    setIsSubmitting(true);
    setStatus(null);
    try {
      await onOverride({ request_id: request.request.id, action, note });
      setStatus("Override recorded for the demo audit path.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to record override.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function revealPhi() {
    if (!request?.request.mask_id) return;
    const reason = window.prompt("Reason for PHI reveal? This access will be logged.");
    if (!reason) return;
    setIsResolving(true);
    setResolveStatus(null);
    try {
      const result = await resolveMasking({ mask_id: request.request.mask_id, role, reason });
      if (!result.authorized) {
        setResolveStatus("Reveal denied for this role. Attempt logged.");
        return;
      }
      const rows = Array.isArray(result.revealed) ? result.revealed : result.revealed ? [result.revealed] : [];
      setResolvedValues(Object.fromEntries(rows.map((item) => [item.token, item.value])));
      setResolveStatus("PHI resolved · access logged");
    } catch (error) {
      setResolveStatus(error instanceof Error ? error.message : "Unable to resolve PHI.");
    } finally {
      setIsResolving(false);
    }
  }

  const entities = Object.entries(request.type_decision.key_entities ?? {});
  const hydrateText = (value: string | null | undefined) => {
    if (!value) return "";
    return Object.entries(resolvedValues).reduce((text, [token, original]) => text.split(token).join(original), value);
  };
  const phiCount = request.request.phi?.count ?? 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex flex-col overflow-hidden p-0 sm:max-w-2xl">
        <SheetHeader className="border-b bg-card px-6 py-5">
          <div className="mb-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <TypeBadge type={request.type_decision.type} />
            <UrgencyBadge urgency={request.type_decision.urgency} />
            <LanguageBadge language={request.type_decision.language} />
            <StatusField label="Review" value={request.remediation.requires_human_review ? "Human" : "Auto"} tone={request.remediation.requires_human_review ? "red" : "green"} />
          </div>
          <SheetTitle>{hydrateText(request.request.subject)}</SheetTitle>
          <SheetDescription>
            {request.request.id} · {hydrateText(request.request.member_name) || "Member"} · {titleize(request.request.channel)}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="space-y-6 px-6 py-5">
            <section className="rounded-lg border bg-muted/35 p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
                <ClipboardList className="h-4 w-4 text-primary" />
                De-identified request
              </div>
              <div className="mb-3 inline-flex items-center gap-1.5 rounded border border-cyan-100 bg-cyan-50 px-2 py-1 text-[11px] font-medium text-cyan-950">
                <LockKeyhole className="h-3 w-3" />
                {phiCount} PHI tokens vaulted · PHI not sent to model
              </div>
              <p className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{hydrateText(request.request.body)}</p>
              <div className="mt-4 rounded-md border border-dashed bg-card p-3 text-sm">
                <div className="mb-2 flex items-center gap-2 font-semibold">
                  <Eye className="h-4 w-4 text-primary" />
                  Vault reveal
                </div>
                <p className="mb-3 text-xs leading-5 text-muted-foreground">
                  Reveal is supervisor/compliance only. Values are resolved in this sheet and every attempt is logged by the masking service.
                </p>
                {role === "supervisor" ? (
                  <Button type="button" size="sm" variant="destructive" onClick={revealPhi} disabled={!request.request.mask_id || isResolving}>
                    {isResolving ? "Resolving" : "Reveal PHI for review"}
                  </Button>
                ) : (
                  <div className="text-xs font-medium text-muted-foreground">Current role: Agent · reveal hidden</div>
                )}
                {resolveStatus ? <p className="mt-2 text-xs font-medium text-red-800">{resolveStatus}</p> : null}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Bot className="h-4 w-4 text-primary" />
                Classification rationale
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="mb-3 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Confidence</span>
                  <span className="font-semibold">{formatPercent(request.type_decision.confidence)}</span>
                </div>
                <Progress value={request.type_decision.confidence * 100} />
                <p className="mt-4 text-sm leading-6 text-muted-foreground">{request.type_decision.rationale}</p>
                <div className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                  <Info label="Classifier source" value={request.type_decision.source} />
                  <Info label="PHI present" value={request.type_decision.phi_present ? "Yes" : "No"} />
                  <Info label="Clinical flag" value={request.type_decision.clinical_flag ? "Yes" : "No"} />
                  <Info label="Processed at" value={formatDate(request.processed_at)} />
                </div>
                {entities.length ? (
                  <div className="mt-4 rounded-md bg-muted/50 p-3 text-sm">
                    <div className="mb-2 font-medium">Extracted entities</div>
                    <div className="space-y-1 text-muted-foreground">
                      {entities.map(([key, value]) => (
                        <div key={key} className="flex justify-between gap-4">
                          <span>{titleize(key)}</span>
                          <span className="font-medium text-foreground">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Route className="h-4 w-4 text-primary" />
                Branch-specific remediation
              </div>
              <div className="rounded-lg border bg-card p-4">
                <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
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
                <Separator className="my-4" />
                <div className="space-y-3">
                  {request.remediation.actions.map((actionItem, index) => (
                    <div key={`${actionItem.step}-${index}`} className="flex gap-3">
                      <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                        {index + 1}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{titleize(actionItem.step)}</div>
                    <div className="text-sm leading-6 text-muted-foreground">{hydrateText(actionItem.detail)}</div>
                  </div>
                </div>
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Generated acknowledgement draft
              </div>
              <div className="rounded-lg border bg-card p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-muted-foreground">{hydrateText(request.remediation.draft_response)}</pre>
                <p className="mt-3 rounded-md bg-muted/45 p-2 text-xs leading-5 text-muted-foreground">
                  Stored drafts keep tokens; recipient values are re-hydrated only at an authorized send/review step.
                </p>
              </div>
            </section>

            <section className="rounded-lg border bg-card p-4">
              <div className="mb-3 text-sm font-semibold">Management override</div>
              <p className="mb-4 text-sm leading-6 text-muted-foreground">
                Demonstrates human control over AI-routed cases. In production this would update assignment, status, and audit records.
              </p>
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
                    <Label htmlFor="override-note">Supervisor note</Label>
                    <Input id="override-note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Reason or routing note" />
                  </div>
                </div>
                <Button type="submit" disabled={isSubmitting} variant={request.remediation.requires_human_review ? "destructive" : "default"}>
                  {isSubmitting ? "Recording" : "Record override"}
                </Button>
                {status || overrideNote ? <p className="text-xs leading-5 text-muted-foreground">{status || overrideNote}</p> : null}
              </form>
            </section>
          </div>
        </ScrollArea>
      </SheetContent>
    </Sheet>
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

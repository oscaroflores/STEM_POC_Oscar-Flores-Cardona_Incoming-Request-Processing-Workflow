"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, ClipboardPlus, Stethoscope } from "lucide-react";
import { AdHocRequestForm } from "@/components/ad-hoc-request-form";
import { AppRail } from "@/components/app-rail";
import { RequestCard } from "@/components/request-card";
import { RequestDetailSheet } from "@/components/request-detail-sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { processRequest, recordOverride } from "@/lib/api";
import type { IncomingRequest, OverridePayload, ProcessedRequest } from "@/lib/types";

export function CreateRequestConsole() {
  const [processed, setProcessed] = React.useState<ProcessedRequest[]>([]);
  const [selected, setSelected] = React.useState<ProcessedRequest | null>(null);
  const [isSheetOpen, setIsSheetOpen] = React.useState(false);
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});
  const [role, setRole] = React.useState("agent");

  async function submitRequest(request: IncomingRequest) {
    const result = await processRequest(request);
    setProcessed((current) => [result, ...current.filter((item) => item.request.id !== result.request.id)]);
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
    <main className="notion-grid flex min-h-screen bg-background/80">
      <AppRail active="create" />

      <section className="min-w-0 flex-1 border bg-[#fbfaf6]/92 shadow-[0_1px_1px_rgba(31,35,40,0.04),0_30px_90px_rgba(31,35,40,0.08)]">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b bg-card/70 px-4 py-3 backdrop-blur-xl sm:px-5">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
              <Stethoscope className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">Conductor</div>
              <div className="text-xs text-muted-foreground">TeleMedik POC</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-md border bg-background px-2 py-1 text-xs text-muted-foreground">
              Role
              <select value={role} onChange={(event) => setRole(event.target.value)} className="bg-transparent font-medium text-foreground outline-none">
                <option value="agent">Agent</option>
                <option value="supervisor">Supervisor</option>
              </select>
            </label>
            <Button type="button" size="sm" variant="outline" asChild>
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Home
              </Link>
            </Button>
          </div>
        </header>

        <div className="mx-auto grid max-w-6xl gap-5 px-4 py-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 lg:py-8">
          <section className="space-y-5">
            <div className="rounded-xl border bg-card/82 p-5 shadow-sm">
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-primary">
                <ClipboardPlus className="h-4 w-4" />
                Create Request
              </div>
              <h1 className="text-2xl font-semibold tracking-tight">Send one request through the workflow engine.</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
                This page is separate from Home so the main demo stays focused on the live workflow visualization. Use it for controlled examples, Spanish/English samples, or edge-case testing.
              </p>
            </div>
            <AdHocRequestForm onSubmitRequest={submitRequest} />
          </section>

          <aside className="space-y-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Processed from this page</CardTitle>
                <CardDescription>Recent created requests stay here for review during the demo.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {processed.length ? (
                  processed.map((item) => <RequestCard key={item.request.id} request={item.request} processed={item} state="outcome" onClick={() => openRequest(item)} />)
                ) : (
                  <div className="rounded-lg border border-dashed bg-muted/30 p-4 text-sm leading-6 text-muted-foreground">
                    Created requests will appear as cards after processing.
                  </div>
                )}
              </CardContent>
            </Card>
          </aside>
        </div>
      </section>

      <RequestDetailSheet
        request={selected}
        open={isSheetOpen}
        onOpenChange={setIsSheetOpen}
        onOverride={submitOverride}
        overrideNote={selected ? overrides[selected.request.id] : undefined}
        role={role}
      />
    </main>
  );
}

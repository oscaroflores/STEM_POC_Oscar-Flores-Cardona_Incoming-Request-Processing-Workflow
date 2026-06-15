"use client";

import * as React from "react";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { IncomingRequest, ProcessedRequest } from "@/lib/types";

const samples: Record<string, Omit<IncomingRequest, "id">> = {
  spanish: {
    channel: "web_form",
    member_name: "Nydia Santiago",
    subject: "Consulta sobre cubierta",
    body: "Quisiera saber si mi plan cubre terapia física luego de una cirugía. Necesito saber si requiere autorización o referido.",
  },
  clinical: {
    channel: "inbox",
    member_name: "Omar López",
    subject: "Síntomas urgentes",
    body: "Tengo mareos fuertes y dolor en el pecho desde hace una hora. Necesito saber qué hacer ahora mismo.",
  },
  billing: {
    channel: "email",
    member_name: "Grace Morales",
    subject: "Incorrect charge",
    body: "I was charged $132 for a covered visit. My account is 447799 and I need the billing team to review the statement.",
  },
};

type AdHocRequestFormProps = {
  onSubmitRequest: (request: IncomingRequest) => Promise<ProcessedRequest>;
};

export function AdHocRequestForm({ onSubmitRequest }: AdHocRequestFormProps) {
  const [form, setForm] = React.useState<Omit<IncomingRequest, "id">>({
    channel: "web_form",
    member_name: "",
    subject: "",
    body: "",
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [status, setStatus] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setStatus(null);
    try {
      const request: IncomingRequest = {
        id: `REQ-LIVE-${Date.now().toString().slice(-6)}`,
        channel: form.channel,
        member_name: form.member_name || null,
        subject: form.subject,
        body: form.body,
      };
      const result = await onSubmitRequest(request);
      setStatus(`Processed as ${result.type_decision.type.replace(/_/g, " ")} with ${Math.round(result.type_decision.confidence * 100)}% confidence.`);
      setForm({ channel: "web_form", member_name: "", subject: "", body: "" });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unable to process request.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Card className="card-lift">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" />
          Ad-hoc intake
        </CardTitle>
        <CardDescription>Type a live request and send it through the same classification and branch engine.</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setForm(samples.spanish)}>Spanish benefits</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setForm(samples.clinical)}>Clinical escalation</Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setForm(samples.billing)}>Billing dispute</Button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="member_name">Member name</Label>
              <Input id="member_name" value={form.member_name ?? ""} onChange={(event) => setForm((current) => ({ ...current, member_name: event.target.value }))} placeholder="Member or patient name" />
            </div>
            <div className="space-y-2">
              <Label>Channel</Label>
              <Select value={form.channel} onValueChange={(channel) => setForm((current) => ({ ...current, channel }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="web_form">Web form</SelectItem>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="inbox">Shared inbox</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="subject">Subject</Label>
            <Input id="subject" value={form.subject} onChange={(event) => setForm((current) => ({ ...current, subject: event.target.value }))} required placeholder="Coverage question, complaint, billing issue..." />
          </div>
          <div className="space-y-2">
            <Label htmlFor="body">Request body</Label>
            <Textarea id="body" value={form.body} onChange={(event) => setForm((current) => ({ ...current, body: event.target.value }))} required placeholder="Paste or type the incoming request..." />
          </div>
          <Button type="submit" disabled={isSubmitting} className="w-full">
            <Send className="h-4 w-4" />
            {isSubmitting ? "Processing" : "Process request"}
          </Button>
          {status ? <p className="text-xs leading-5 text-muted-foreground">{status}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}

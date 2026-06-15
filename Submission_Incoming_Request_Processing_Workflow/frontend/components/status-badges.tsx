import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { RequestType, Urgency } from "@/lib/types";
import { titleize } from "@/lib/utils";

const urgencyVariant: Record<Urgency, BadgeProps["variant"]> = {
  low: "success",
  medium: "teal",
  high: "warning",
  critical: "destructive",
};

const typeVariant: Record<RequestType, BadgeProps["variant"]> = {
  complaint: "warning",
  benefits_enquiry: "success",
  service_request: "teal",
  billing_dispute: "secondary",
  clinical_urgent: "destructive",
};

export function UrgencyBadge({ urgency }: { urgency: Urgency }) {
  return <Badge variant={urgencyVariant[urgency]}>{titleize(urgency)}</Badge>;
}

export function TypeBadge({ type }: { type: RequestType }) {
  return <Badge variant={typeVariant[type]}>{titleize(type)}</Badge>;
}

export function LanguageBadge({ language }: { language: "en" | "es" }) {
  return <Badge variant="outline">{language === "es" ? "Spanish" : "English"}</Badge>;
}

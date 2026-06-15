import { Bot, Clock3, Mail, ShieldAlert, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { LanguageBadge, TypeBadge, UrgencyBadge } from "@/components/status-badges";
import type { IncomingRequest, ProcessedRequest } from "@/lib/types";
import { cn, formatPercent, titleize } from "@/lib/utils";

type RequestCardProps = {
  request: IncomingRequest;
  processed?: ProcessedRequest;
  state: "incoming" | "processing" | "outcome";
  onClick?: () => void;
};

export function RequestCard({ request, processed, state, onClick }: RequestCardProps) {
  const isEscalated = Boolean(processed?.remediation.requires_human_review);
  const isProcessing = state === "processing";

  return (
    <button type="button" onClick={onClick} className="block w-full text-left" disabled={!onClick}>
      <Card
        className={cn(
          "animate-card-in p-4 transition-all hover:border-primary/35 hover:shadow-sm",
          isProcessing && "border-primary/50 bg-cyan-50/60",
          isEscalated && "border-red-200 bg-red-50/55",
        )}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Mail className="h-3.5 w-3.5" />
              <span>{request.id}</span>
              <span>·</span>
              <span>{titleize(request.channel)}</span>
            </div>
            <h3 className="mt-1 line-clamp-2 text-sm font-semibold text-foreground">{request.subject}</h3>
          </div>
          {isProcessing ? (
            <Badge variant="teal" className="shrink-0 gap-1">
              <Clock3 className="h-3 w-3" />
              Routing
            </Badge>
          ) : null}
          {isEscalated ? (
            <Badge variant="destructive" className="shrink-0 gap-1">
              <ShieldAlert className="h-3 w-3" />
              Review
            </Badge>
          ) : null}
        </div>

        <div className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <UserRound className="h-3.5 w-3.5" />
          <span className="truncate">{request.member_name || "Member"}</span>
        </div>

        <p className="line-clamp-3 text-xs leading-5 text-muted-foreground">{request.body}</p>

        {processed ? (
          <div className="mt-4 space-y-3 border-t pt-3">
            <div className="flex flex-wrap gap-2">
              <TypeBadge type={processed.type_decision.type} />
              <UrgencyBadge urgency={processed.type_decision.urgency} />
              <LanguageBadge language={processed.type_decision.language} />
            </div>
            <div className="flex items-center justify-between rounded-md bg-muted/65 px-2.5 py-2 text-xs">
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <Bot className="h-3.5 w-3.5" />
                Confidence
              </span>
              <span className="font-semibold text-foreground">{formatPercent(processed.type_decision.confidence)}</span>
            </div>
          </div>
        ) : null}
      </Card>
    </button>
  );
}

import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ProcessedRequest } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

type EscalationQueueProps = {
  items: ProcessedRequest[];
  onSelect: (request: ProcessedRequest) => void;
};

export function EscalationQueue({ items, onSelect }: EscalationQueueProps) {
  return (
    <Card className="border-red-100 bg-red-50/35">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm text-red-900">
          <ShieldAlert className="h-4 w-4" />
          Needs review
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clinical or low-confidence cases are waiting for supervisor review.</p>
        ) : (
          items.map((item) => (
            <div key={item.request.id} className="rounded-md border border-red-100 bg-card p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold">{item.request.subject}</div>
                  <div className="text-xs text-muted-foreground">{item.request.id} · {item.request.member_name || "Member"}</div>
                </div>
                <Badge variant="destructive">{formatPercent(item.judgment.confidence)}</Badge>
              </div>
              <p className="line-clamp-2 text-xs leading-5 text-muted-foreground">
                {item.remediation.escalation_reason || item.judgment.rationale}
              </p>
              <Button type="button" variant="outline" size="sm" className="mt-3 w-full" onClick={() => onSelect(item)}>
                Review handoff
              </Button>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

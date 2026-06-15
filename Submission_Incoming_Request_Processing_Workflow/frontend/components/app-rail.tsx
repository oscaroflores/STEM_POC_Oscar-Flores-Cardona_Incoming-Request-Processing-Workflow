import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Activity, ClipboardCheck, Home, Inbox, PenLine, ShieldAlert, Stethoscope } from "lucide-react";
import { cn } from "@/lib/utils";

type AppRailProps = {
  active: "home" | "create";
  escalations?: number;
};

const navItems: Array<{ key: AppRailProps["active"] | "inbox" | "audit" | "review"; label: string; href?: string; icon: LucideIcon }> = [
  { key: "home", label: "Home", href: "/", icon: Home },
  { key: "create", label: "Create Request", href: "/create-request", icon: PenLine },
  { key: "inbox", label: "Live Inbox", icon: Inbox },
  { key: "review", label: "Escalations", icon: ShieldAlert },
  { key: "audit", label: "Audit Outputs", icon: ClipboardCheck },
];

export function AppRail({ active, escalations = 0 }: AppRailProps) {
  return (
    <aside className="group hidden min-h-screen w-16 shrink-0 overflow-hidden border-r bg-card/76 px-3 py-4 backdrop-blur-xl transition-all duration-300 hover:w-64 lg:block">
      <div className="mb-7 flex h-11 items-center gap-3 whitespace-nowrap">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm">
          <Stethoscope className="h-5 w-5" />
        </div>
        <div className="min-w-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="text-sm font-semibold leading-5">Conductor</div>
          <div className="text-xs text-muted-foreground">TeleMedik POC</div>
        </div>
      </div>

      <nav className="space-y-1 text-sm">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          const count = item.key === "review" ? escalations : undefined;
          const content = (
            <span
              className={cn(
                "flex h-10 items-center gap-3 rounded-md px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isActive && "bg-muted text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate opacity-0 transition-opacity duration-200 group-hover:opacity-100">{item.label}</span>
              {count !== undefined ? (
                <span className="rounded bg-background px-1.5 py-0.5 text-xs opacity-0 transition-opacity duration-200 group-hover:opacity-100">{count}</span>
              ) : null}
            </span>
          );

          return item.href ? (
            <Link key={item.key} href={item.href} aria-label={item.label}>
              {content}
            </Link>
          ) : (
            <div key={item.key} aria-label={item.label}>
              {content}
            </div>
          );
        })}
      </nav>

      <div className="mt-7 rounded-lg border bg-muted/35 p-3 text-xs leading-5 text-muted-foreground opacity-0 transition-opacity duration-200 group-hover:opacity-100">
        AI classifies; workflow nodes route, draft, log, and escalate with human oversight.
      </div>
    </aside>
  );
}

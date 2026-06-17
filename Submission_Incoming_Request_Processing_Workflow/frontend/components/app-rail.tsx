import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Home, Inbox, PenLine } from "lucide-react";
import { BrandLogoMark } from "@/components/brand-logo-mark";
import { cn } from "@/lib/utils";

type AppRailProps = {
  active: "home" | "create" | "inbox";
};

const navItems: Array<{ key: AppRailProps["active"]; label: string; href: string; icon: LucideIcon }> = [
  { key: "home", label: "Home", href: "/", icon: Home },
  { key: "create", label: "Create Request", href: "/create-request", icon: PenLine },
  { key: "inbox", label: "Request History", href: "/live-inbox", icon: Inbox },
];

export function AppRail({ active }: AppRailProps) {
  return (
    <aside className="group hidden h-screen w-16 shrink-0 overflow-hidden border-r bg-card/76 px-3 py-4 backdrop-blur-xl transition-all duration-300 hover:w-64 lg:block">
      <div className="mb-7 flex h-11 items-center gap-3 whitespace-nowrap">
        <BrandLogoMark alt="Conductor" />
        <div className="min-w-0 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <div className="text-sm font-semibold leading-5">Conductor</div>
          <div className="text-xs text-muted-foreground">TeleMedik POC</div>
        </div>
      </div>

      <nav className="space-y-1 text-sm">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <Link key={item.key} href={item.href} aria-label={item.label}>
              <span
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-2.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                  isActive && "bg-muted text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="min-w-0 flex-1 truncate opacity-0 transition-opacity duration-200 group-hover:opacity-100">{item.label}</span>
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

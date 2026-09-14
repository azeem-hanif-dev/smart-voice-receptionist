"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronsUpDown, LogOut, Menu, MessageCircle, Plus, Sparkles, X } from "lucide-react";
import { auth } from "@/lib/api";
import type { Me, OrgSummary } from "@/lib/types";
import { cn } from "@/lib/utils";
import { navItems, verticalLabel } from "@/components/nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppShell({ me, org, children }: { me: Me; org: OrgSummary; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const pathname = usePathname();

  React.useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar */}
      <aside className="brand-surface hidden w-[248px] shrink-0 flex-col text-sidebar-foreground md:flex">
        <SidebarContent me={me} org={org} />
      </aside>

      {/* Mobile sidebar */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-hidden="true" />
          <aside className="brand-surface absolute left-0 top-0 flex h-full w-72 flex-col text-sidebar-foreground shadow-pop">
            <div className="flex justify-end p-2">
              <Button variant="ghost" size="icon" className="text-sidebar-foreground hover:bg-white/10 hover:text-white" onClick={() => setMobileOpen(false)} aria-label="Close menu">
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarContent me={me} org={org} />
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <Header me={me} org={org} onOpenMenu={() => setMobileOpen(true)} />
        <main className="min-w-0 flex-1 p-4 md:p-6 lg:p-8">
          <div className="page-container animate-fade-in-up">{children}</div>
        </main>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-teal-600 text-white shadow-glow">
        <MessageCircle className="h-5 w-5" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight text-white">AI Receptionist</p>
        <p className="text-[11px] text-sidebar-muted">Never miss a booking</p>
      </div>
    </div>
  );
}

function SidebarContent({ me, org }: { me: Me; org: OrgSummary }) {
  const pathname = usePathname();
  const items = navItems(org.id);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="px-3 pb-2 pt-4">
        <BrandMark />
      </div>
      <div className="px-3 py-3">
        <OrgSwitcher me={me} org={org} />
      </div>
      <nav className="flex-1 space-y-0.5 px-3">
        <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-sidebar-muted">Workspace</p>
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                active ? "bg-white/10 text-white shadow-inner shadow-white/5" : "text-slate-300/90 hover:bg-white/[0.06] hover:text-white",
              )}
            >
              {active ? <span className="absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-sidebar-accent" /> : null}
              <Icon className={cn("h-4 w-4", active ? "text-emerald-300" : "text-slate-400 group-hover:text-emerald-200")} />
              {item.label}
              {item.label === "Demo chat" ? <Sparkles className="ml-auto h-3.5 w-3.5 text-emerald-300/80" /> : null}
            </Link>
          );
        })}
      </nav>
      <div className="m-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
        <p className="text-xs font-semibold text-white">{me.modelMode === "demo" ? "Demo model active" : `Powered by ${me.model}`}</p>
        <p className="mt-0.5 text-[11px] leading-snug text-sidebar-muted">
          {me.modelMode === "demo" ? "Deterministic replies. Add ANTHROPIC_API_KEY to switch to Claude." : "Claude answers customers in their own language."}
        </p>
      </div>
    </div>
  );
}

function OrgSwitcher({ me, org }: { me: Me; org: OrgSummary }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2.5 text-left transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60"
        >
          <span className="flex min-w-0 items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-teal-500/80 to-emerald-500/80 text-xs font-bold text-white">
              {org.name.slice(0, 1).toUpperCase()}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold text-white">{org.name}</span>
              <span className="block truncate text-[11px] text-sidebar-muted">{verticalLabel(org.vertical)} · {org.role.toLowerCase()}</span>
            </span>
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Your businesses</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {me.orgs.map((item) => (
          <DropdownMenuItem key={item.id} asChild>
            <Link href={`/o/${item.id}/inbox`} className="flex flex-col items-start gap-0.5">
              <span className="truncate font-medium">{item.name}</span>
              <span className="text-xs text-muted-foreground">
                {verticalLabel(item.vertical)} · {item.role.toLowerCase()}
              </span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/onboarding">
            <Plus className="h-4 w-4" />
            Add a business
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Header({ me, org, onOpenMenu }: { me: Me; org: OrgSummary; onOpenMenu: () => void }) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = React.useState(false);

  async function logout() {
    setLoggingOut(true);
    try {
      await auth.logout();
    } catch {
      /* log out locally even if the API is unreachable */
    }
    router.replace("/login");
    router.refresh();
  }

  const initials = me.user.name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border/70 bg-background/80 px-4 backdrop-blur-md md:px-6 lg:px-8">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={onOpenMenu} aria-label="Open menu">
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate text-sm font-semibold">{org.name}</span>
        <Badge variant="brand">{verticalLabel(org.vertical)}</Badge>
        {me.modelMode === "demo" ? (
          <Badge variant="warning" title="Set ANTHROPIC_API_KEY to use Claude">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Demo model
          </Badge>
        ) : (
          <Badge variant="success">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {me.model}
          </Badge>
        )}
      </div>

      <div className="ml-auto">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-1.5 hover:bg-accent/70">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 text-xs font-bold text-white shadow-sm">
                {initials || "?"}
              </span>
              <span className="hidden max-w-[10rem] truncate text-sm font-medium text-foreground sm:inline">{me.user.name}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel className="flex flex-col gap-0.5">
              <span>{me.user.name}</span>
              <span className="text-xs font-normal text-muted-foreground">{me.user.email}</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled className="text-xs">
              Model: {me.model}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void logout()} disabled={loggingOut}>
              <LogOut className="h-4 w-4" />
              {loggingOut ? "Signing out..." : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { can } from "@/lib/rbac";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  LayoutDashboard,
  KanbanSquare,
  Users,
  FileText,
  Settings,
  BarChart3,
  LogOut,
  Zap,
  ChevronDown,
  Menu,
  UserCog,
  Workflow,
  CreditCard,
} from "lucide-react";
import type { SessionPayload } from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  icon: any;
  show?: (role: string) => boolean;
};
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/kanban", label: "Kanban", icon: KanbanSquare },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/forms", label: "Formulários", icon: FileText },
  { href: "/billing", label: "Financeiro", icon: CreditCard },
  {
    href: "/pipelines",
    label: "Pipelines",
    icon: Workflow,
    show: (r) => can(r, "PIPELINES_VIEW"),
  },
  {
    href: "/reports",
    label: "Relatórios",
    icon: BarChart3,
    show: (r) => can(r, "REPORTS_VIEW"),
  },
  {
    href: "/users",
    label: "Usuários",
    icon: UserCog,
    show: (r) => can(r, "USERS_VIEW"),
  },
  {
    href: "/settings",
    label: "Configurações",
    icon: Settings,
    show: (r) => can(r, "SETTINGS_VIEW"),
  },
];

interface TenantBrand {
  name: string;
  slug: string;
  primaryColor: string;
  logoUrl: string | null;
  status?: string;
  nextDueDate?: string | null;
  gracePeriodEndsAt?: string | null;
  paymentUrl?: string | null;
}

export function AppShell({
  children,
  session,
  tenant,
}: {
  children: React.ReactNode;
  session: SessionPayload;
  tenant: TenantBrand | null;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const onLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const brandColor = tenant?.primaryColor || "#2563EB";
  const tenantName = tenant?.name || "FlipForm";
  const tenantInitials = tenantName
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  const gracePeriodLabel = tenant?.gracePeriodEndsAt
    ? new Date(tenant.gracePeriodEndsAt).toLocaleDateString("pt-BR")
    : null;

  return (
    <div
      className="flex h-screen overflow-hidden bg-background"
      style={{ ["--brand-color" as any]: brandColor }}
    >
      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-64 bg-sidebar border-r border-sidebar-border flex flex-col transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="h-16 flex items-center gap-2 px-5 border-b border-sidebar-border">
          {tenant?.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={tenantName}
              className="w-9 h-9 rounded-md object-contain bg-white border"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div
              className="w-9 h-9 rounded-md flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: brandColor }}
            >
              {tenantInitials || <Zap className="w-4 h-4" />}
            </div>
          )}
          <div className="min-w-0">
            <div
              className="font-heading font-bold leading-tight truncate"
              title={tenantName}
            >
              {tenantName}
            </div>
            <div className="text-xs text-muted-foreground -mt-0.5">
              via FlipForm
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
          {NAV.filter((item) => !item.show || item.show(session.role)).map(
            (item) => {
              const active = pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    active
                      ? "bg-brand-50 text-brand-700"
                      : "text-foreground/70 hover:bg-muted hover:text-foreground",
                  )}
                >
                  <Icon className={cn("w-4 h-4", active && "text-brand-600")} />
                  {item.label}
                </Link>
              );
            },
          )}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <div className="px-3 py-2 rounded-md bg-muted/50">
            <div className="text-xs text-muted-foreground">Empresa</div>
            <div className="text-sm font-medium truncate">
              {tenant?.slug || session.tenantSlug}
            </div>
          </div>
        </div>
      </aside>

      {/* Backdrop mobile */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Main */}
      <div className="flex-1 min-w-0 flex flex-col lg:pl-64">
        {/* Header */}
        <header className="h-16 bg-card border-b flex items-center justify-between px-4 lg:px-6 sticky top-0 z-20">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
            <div>
              <div className="font-heading font-semibold">
                {NAV.find((n) => pathname.startsWith(n.href))?.label ||
                  "FlipForm"}
              </div>
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="gap-2 px-2">
                <Avatar className="w-8 h-8">
                  <AvatarFallback className="bg-brand-100 text-brand-700 text-xs font-semibold">
                    {session.name
                      .split(" ")
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join("")}
                  </AvatarFallback>
                </Avatar>
                <div className="text-left hidden md:block">
                  <div className="text-sm font-medium leading-tight">
                    {session.name}
                  </div>
                  <div className="text-xs text-muted-foreground capitalize">
                    {session.role}
                  </div>
                </div>
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-medium">{session.name}</div>
                <div className="text-xs text-muted-foreground font-normal">
                  {session.email}
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        {tenant?.status === "past_due" && (
          <div className="bg-amber-50 border-b border-amber-200 px-4 lg:px-6 py-2.5 text-sm text-amber-900 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-0.5 md:flex-row md:items-center md:gap-2">
              <span className="font-medium">⚠ Pagamento pendente.</span>
              <span>
                Regularize para evitar suspensão
                {gracePeriodLabel
                  ? ` até ${gracePeriodLabel}`
                  : tenant?.nextDueDate
                    ? ` (vencimento: ${new Date(tenant.nextDueDate).toLocaleDateString("pt-BR")})`
                    : ""}
                .
              </span>
            </div>
            {tenant.paymentUrl && (
              <Link
                href={tenant.paymentUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium underline underline-offset-2"
              >
                Pagar agora
              </Link>
            )}
          </div>
        )}
        <main className="flex-1 min-w-0 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}

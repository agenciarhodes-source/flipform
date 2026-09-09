"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { can, ROLE_LABELS_PT_BR, type PermissionKey, type RoleName } from "@/lib/rbac";
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
  Shuffle,
  BarChart3,
  LogOut,
  Zap,
  ChevronDown,
  Menu,
  UserCog,
  Workflow,
  CreditCard,
  PlugZap,
  MessageCircle,
  MessagesSquare,
  Bot,
  Globe2,
  Network,
  Building2,
} from "lucide-react";
import type { SessionPayload } from "@/lib/auth";

type NavItem = {
  href: string;
  label: string;
  icon: any;
  permission?: PermissionKey;
  show?: (role: string) => boolean;
};
const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/team", label: "Visão da equipe", icon: Network, permission: "DASHBOARD_VIEW", show: (role) => ['owner', 'admin', 'manager'].includes(role) },
  { href: "/kanban", label: "Kanban", icon: KanbanSquare },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/inbox", label: "Inbox", icon: MessagesSquare, permission: "INBOX_VIEW" },
  { href: "/automations", label: "Automações", icon: Zap, permission: "INTEGRATIONS_VIEW" },
  { href: "/flip-ai", label: "Flip AI", icon: Bot, permission: "FLIP_AI_MANAGE" },
  { href: "/forms", label: "Formulários", icon: FileText },
  { href: "/sales-rotation", label: "Rodízio de leads", icon: Shuffle, permission: "LEAD_ASSIGNMENT_ROTATION_VIEW" },
  { href: "/domains", label: "Domínios", icon: Globe2, permission: "DOMAINS_VIEW" },
  { href: "/billing", label: "Financeiro", icon: CreditCard, permission: "BILLING_VIEW" },
  {
    href: "/pipelines",
    label: "Pipelines",
    icon: Workflow,
    permission: "PIPELINES_VIEW",
  },
  {
    href: "/reports",
    label: "Relatórios",
    icon: BarChart3,
    permission: "REPORTS_VIEW",
  },
  {
    href: "/users",
    label: "Usuários",
    icon: UserCog,
    permission: "USERS_VIEW",
  },
  {
    href: "/integrations",
    label: "Integrações",
    icon: PlugZap,
    permission: "INTEGRATIONS_VIEW",
  },
  {
    href: "/whatsapp-funnel",
    label: "Funil WhatsApp",
    icon: MessageCircle,
    permission: "INTEGRATIONS_VIEW",
  },
  {
    href: "/settings",
    label: "Configurações",
    icon: Settings,
    permission: "SETTINGS_VIEW",
  },
];

const GROUP_ROLE_LABELS_PT_BR: Record<string, string> = {
  owner: "Dono do grupo",
  admin: "Administrador do grupo",
  viewer: "Visualizador do grupo",
};

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
  businessGroups = [],
  hasCurrentTenantMembership = true,
  isBusinessGroupAnchor = false,
}: {
  children: React.ReactNode;
  session: SessionPayload;
  tenant: TenantBrand | null;
  businessGroups?: Array<{ id: string; name: string; role: string }>;
  hasCurrentTenantMembership?: boolean;
  isBusinessGroupAnchor?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const onLogout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const inGroupView = pathname === "/group" || pathname.startsWith("/group/");
  const groupHubNav: NavItem[] = businessGroups.length
    ? [{ href: "/group", label: "Visão do grupo", icon: Building2 }]
    : [];
  const groupWorkspaceNav: NavItem[] = businessGroups.length
    ? [
        { href: "/group", label: "Dashboard", icon: LayoutDashboard },
        { href: "/group/leads", label: "Leads", icon: Users },
        { href: "/group/forms", label: "Formulários", icon: FileText },
        { href: "/group/reports", label: "Relatórios", icon: BarChart3 },
      ]
    : [];
  const baseNavItems = [NAV[0], ...groupHubNav, ...NAV.slice(1)];
  const navItems = ((inGroupView || isBusinessGroupAnchor) ? groupWorkspaceNav : baseNavItems).filter(
    (item) =>
      (!item.permission || can(session.role, item.permission))
      && (!item.show || item.show(session.role))
      && !(item.href === "/team" && !hasCurrentTenantMembership),
  );
  const isNavItemActive = (href: string) => href === "/group" ? pathname === "/group" : pathname.startsWith(href);

  const activeGroup = businessGroups[0] || null;
  const brandColor = tenant?.primaryColor || "#2563EB";
  const tenantName = tenant?.name || "FlipForm";
  const displayName = inGroupView && activeGroup ? activeGroup.name : tenantName;
  const userRoleLabel = inGroupView && activeGroup
    ? GROUP_ROLE_LABELS_PT_BR[activeGroup.role] || activeGroup.role
    : ROLE_LABELS_PT_BR[session.role as RoleName] || session.role;
  const displayInitials = displayName
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
          {!inGroupView && tenant?.logoUrl ? (
            <img
              src={tenant.logoUrl}
              alt={displayName}
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
              {displayInitials || <Zap className="w-4 h-4" />}
            </div>
          )}
          <div className="min-w-0">
            <div
              className="font-heading font-bold leading-tight truncate"
              title={displayName}
            >
              {displayName}
            </div>
            <div className="text-xs text-muted-foreground -mt-0.5">
              {inGroupView ? "Visão consolidada" : "via FlipForm"}
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const active = isNavItemActive(item.href);
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
          })}
        </nav>
        <div className="p-3 border-t border-sidebar-border space-y-2">
          {activeGroup && (
            <div className="px-3 py-2 rounded-md bg-brand-50/60 border border-brand-100">
              <div className="text-xs text-muted-foreground">Grupo empresarial</div>
              <div className="text-sm font-medium truncate">{activeGroup.name}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {GROUP_ROLE_LABELS_PT_BR[activeGroup.role] || activeGroup.role}
              </div>
            </div>
          )}
          {inGroupView && activeGroup ? (
            <div className="px-3 py-2 rounded-md bg-muted/50">
              <div className="text-xs text-muted-foreground">Escopo atual</div>
              <div className="text-sm font-medium truncate">Visão consolidada</div>
            </div>
          ) : !isBusinessGroupAnchor ? (
            <div className="px-3 py-2 rounded-md bg-muted/50">
              <div className="text-xs text-muted-foreground">Empresa atual</div>
              <div className="text-sm font-medium truncate">
                {tenant?.slug || session.tenantSlug}
              </div>
            </div>
          ) : null}
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
                {navItems.find((n) => isNavItemActive(n.href))?.label ||
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
                  <div className="text-xs text-muted-foreground">
                    {userRoleLabel}
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
                {inGroupView && activeGroup && (
                  <div className="text-xs text-muted-foreground font-normal mt-1">
                    {userRoleLabel} · {activeGroup.name}
                  </div>
                )}
              </DropdownMenuLabel>
              {businessGroups.length > 0 && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild><Link href="/group"><Building2 className="w-4 h-4 mr-2" />Visão do grupo</Link></DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout} className="text-destructive">
                <LogOut className="w-4 h-4 mr-2" /> Sair
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </header>
        {!inGroupView && tenant?.status === "past_due" && (
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

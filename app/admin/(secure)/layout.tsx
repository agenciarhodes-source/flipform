import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { LayoutDashboard, Building2, CreditCard, ScrollText, LogOut, Shield, Users } from 'lucide-react';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session || session.globalRole !== 'platform_admin') {
    redirect('/admin/login');
  }

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-60 bg-slate-900 text-slate-100 flex flex-col">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-md bg-brand-600 flex items-center justify-center">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <div className="font-heading font-bold text-base">FlipForm</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">Plataforma Admin</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          <AdminLink href="/admin" icon={LayoutDashboard} label="Visão geral" />
          <AdminLink href="/admin/tenants" icon={Building2} label="Clientes" />
          <AdminLink href="/admin/billing" icon={CreditCard} label="Billing & Planos" />
          <AdminLink href="/admin/access" icon={Users} label="Acessos" />
          <AdminLink href="/admin/audit" icon={ScrollText} label="Audit logs" />
        </nav>
        <div className="p-3 border-t border-slate-800 text-xs text-slate-400">
          <div className="px-2 mb-2">
            <div className="text-slate-300">{session.name}</div>
            <div className="truncate text-[11px]">{session.email}</div>
          </div>
          <Link href="/api/auth/logout" prefetch={false} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-slate-800 transition">
            <LogOut className="w-3.5 h-3.5" /> Sair
          </Link>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

function AdminLink({ href, icon: Icon, label }: { href: string; icon: any; label: string }) {
  return (
    <Link href={href} className="flex items-center gap-2 px-3 py-2 rounded text-sm text-slate-300 hover:bg-slate-800 hover:text-white transition">
      <Icon className="w-4 h-4" />
      {label}
    </Link>
  );
}

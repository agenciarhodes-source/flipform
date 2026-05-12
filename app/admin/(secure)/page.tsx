import type React from 'react';
'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Building2, Users, FileText, TrendingUp, AlertTriangle, ShieldOff, Clock, Loader2, ArrowRight } from 'lucide-react';
import { StatusBadge } from '@/components/admin/status-badge';

export default function AdminOverviewPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch('/api/admin/overview').then((r) => r.json()).then(setData); }, []);

  if (!data) return <div className="p-8 text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Carregando...</div>;

  return (
    <div className="p-8 space-y-6">
      <h1 className="font-heading text-2xl font-bold">Visão geral da plataforma</h1>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Tenants totais" value={data.tenants.total} icon={Building2} />
        <Stat label="Ativos" value={data.tenants.active} icon={TrendingUp} tone="success" />
        <Stat label="Past due" value={data.tenants.pastDue} icon={AlertTriangle} tone="warning" />
        <Stat label="Suspensos / bloqueados" value={data.tenants.suspended + data.tenants.blocked} icon={ShieldOff} tone="danger" />
        <Stat label="Trial" value={data.tenants.trial} icon={Clock} />
        <Stat label="Usuários" value={data.users} icon={Users} />
        <Stat label="Formulários" value={data.forms} icon={FileText} />
        <Stat label="Leads totais" value={data.leads} icon={TrendingUp} />
      </div>
      <Card className="p-5">
        <div className="flex items-end justify-between mb-1">
          <div>
            <div className="text-sm text-muted-foreground">MRR estimado</div>
            <div className="font-heading text-3xl font-bold">R$ {Number(data.mrr).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
          </div>
          <Link href="/admin/billing" className="text-sm text-primary hover:underline inline-flex items-center gap-1">Billing & Planos <ArrowRight className="w-3 h-3" /></Link>
        </div>
      </Card>
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-heading font-semibold">Clientes recentes</h2>
          <Link href="/admin/tenants" className="text-sm text-primary hover:underline inline-flex items-center gap-1">Ver todos <ArrowRight className="w-3 h-3" /></Link>
        </div>
        <table className="w-full text-sm">
          <thead><tr className="border-b text-xs text-muted-foreground uppercase"><th className="text-left py-2">Nome</th><th className="text-left py-2">Slug</th><th className="text-left py-2">Status</th><th className="text-left py-2">Plano</th><th className="text-left py-2">Criado em</th></tr></thead>
          <tbody>
            {data.recentTenants.map((t: any) => (
              <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-2"><Link href={`/admin/tenants/${t.id}`} className="hover:underline">{t.name}</Link></td>
                <td className="py-2 text-muted-foreground">{t.slug}</td>
                <td className="py-2"><StatusBadge status={t.status} /></td>
                <td className="py-2">{t.planName || <span className="text-muted-foreground">—</span>}</td>
                <td className="py-2 text-muted-foreground">{new Date(t.createdAt).toLocaleDateString('pt-BR')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

type StatProps = { label: string; value: number; icon: React.ComponentType<{ className?: string }>; tone?: "success" | "danger" | "warning" }

function Stat({ label, value, icon: Icon, tone }: StatProps) {
  const tones: Record<string, string> = { success: 'text-emerald-600 bg-emerald-50', danger: 'text-red-600 bg-red-50', warning: 'text-amber-600 bg-amber-50' };
  return (
    <Card className="p-4 flex items-start justify-between">
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-heading text-2xl font-bold mt-1">{value}</div>
      </div>
      <div className={`w-9 h-9 rounded-md flex items-center justify-center ${(tone ? tones[tone] : undefined) || 'text-slate-600 bg-slate-100'}`}>
        <Icon className="w-4 h-4" />
      </div>
    </Card>
  );
}

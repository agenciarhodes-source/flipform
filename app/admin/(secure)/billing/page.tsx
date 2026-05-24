'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RefreshCcw } from 'lucide-react';
import { safeJson } from '@/lib/http/safe-json';

type PlanRow = { id: string; name: string; slug: string; description: string | null; price: number; billingCycle: string; maxUsers: number; maxForms: number; maxPipelines: number; maxLeadsPerMonth: number; canUseReports: boolean; canExportCsv: boolean; canUseCustomBranding: boolean; canUseMetaPixel: boolean; canUseWebhooks: boolean; canUseTasks: boolean; isActive: boolean; tenantsCount: number; subscriptionsCount: number; };

export default function AdminBillingPage() {
  const [plans, setPlans] = useState<PlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true); setError(null);
      const res = await fetch('/api/admin/plans', { cache: 'no-store' });
      const data = await safeJson<any>(res);
      if (!data) throw new Error('Resposta vazia do servidor');
      if (!res.ok) throw new Error((data as any)?.error || 'Falha ao carregar planos');
      const payload = (data as any).data ?? data;
      setPlans(payload.plans || []);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar planos');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  if (loading) return <div className="p-8 text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Carregando planos...</div>;

  return (
    <div className="p-8 space-y-5"> 
      <div className="flex items-center justify-between"><div><h1 className="font-heading text-2xl font-bold">Billing & Planos</h1><p className="text-sm text-muted-foreground">Estrutura comercial ativa do FlipForm.</p></div><Button variant="outline" onClick={load}><RefreshCcw className="w-4 h-4 mr-2" />Atualizar</Button></div>
      {error && <Card className="p-4 bg-rose-50 border-rose-200 text-sm text-rose-800"><AlertCircle className="w-4 h-4 inline mr-2" />{error}</Card>}
      {!error && plans.length === 0 && <Card className="p-4 text-sm text-muted-foreground">Nenhum plano encontrado.</Card>}
      {!error && plans.length > 0 && <Card className="p-0 overflow-x-auto"><table className="w-full text-sm"><thead className="bg-muted/50"><tr className="text-left"><th className="p-3">Nome</th><th className="p-3">Slug</th><th className="p-3">Preço</th><th className="p-3">Limites</th><th className="p-3">Features</th><th className="p-3">Ativo</th></tr></thead><tbody>{plans.map((p)=><tr key={p.id} className="border-t align-top"><td className="p-3"><div className="font-medium">{p.name}</div><div className="text-xs text-muted-foreground">{p.description || '—'}</div></td><td className="p-3 font-mono text-xs">{p.slug}</td><td className="p-3">R$ {Number(p.price).toFixed(2)}/{p.billingCycle === 'yearly' ? 'ano' : 'mês'}</td><td className="p-3 text-xs">users {p.maxUsers} · forms {p.maxForms} · pipelines {p.maxPipelines} · leads {p.maxLeadsPerMonth.toLocaleString('pt-BR')}</td><td className="p-3 text-xs">reports {String(p.canUseReports)} · csv {String(p.canExportCsv)} · branding {String(p.canUseCustomBranding)} · pixel {String(p.canUseMetaPixel)} · webhooks {String(p.canUseWebhooks)} · tasks {String(p.canUseTasks)}</td><td className="p-3"><Badge variant={p.isActive ? 'secondary' : 'outline'}>{p.isActive ? 'ativo' : 'inativo'}</Badge></td></tr>)}</tbody></table></Card>}
    </div>
  );
}

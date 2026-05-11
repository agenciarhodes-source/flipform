'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Loader2, ArrowLeft, Power, RotateCcw, ShieldOff, Ban } from 'lucide-react';
import { StatusBadge } from '@/components/admin/status-badge';

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [tenant, setTenant] = useState<any>(null);
  const [plans, setPlans] = useState<any[]>([]);
  const [savingPlan, setSavingPlan] = useState(false);
  const [planForm, setPlanForm] = useState<{ planId: string; nextDueDate: string; internalNotes: string }>({ planId: '', nextDueDate: '', internalNotes: '' });

  const load = async () => {
    const d = await fetch(`/api/admin/tenants/${id}`).then((r) => r.json());
    setTenant(d.tenant);
    setPlanForm({
      planId: d.tenant?.planId || 'none',
      nextDueDate: d.tenant?.nextDueDate ? new Date(d.tenant.nextDueDate).toISOString().slice(0, 10) : '',
      internalNotes: d.tenant?.internalNotes || '',
    });
  };
  useEffect(() => { load(); fetch('/api/admin/plans').then((r) => r.json()).then((d) => setPlans(d.plans || [])); /* eslint-disable-next-line */ }, [id]);

  const changeStatus = async (newStatus: string, label: string) => {
    const reason = prompt(`Motivo para ${label.toLowerCase()} (opcional):`) ?? undefined;
    try {
      const res = await fetch(`/api/admin/tenants/${id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, reason }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Erro'); }
      toast.success(`Status atualizado para ${label}`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const savePlan = async () => {
    setSavingPlan(true);
    try {
      const res = await fetch(`/api/admin/tenants/${id}/plan`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: planForm.planId === 'none' ? null : planForm.planId,
          nextDueDate: planForm.nextDueDate ? new Date(planForm.nextDueDate + 'T00:00:00').toISOString() : null,
          internalNotes: planForm.internalNotes,
        }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Erro'); }
      toast.success('Plano atualizado');
      load();
    } catch (e: any) { toast.error(e.message); }
    finally { setSavingPlan(false); }
  };

  if (!tenant) return <div className="p-8 text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Carregando...</div>;

  return (
    <div className="p-8 space-y-5">
      <Link href="/admin/tenants" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1"><ArrowLeft className="w-3.5 h-3.5" />Voltar</Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-md flex items-center justify-center text-white font-bold text-xl" style={{ backgroundColor: tenant.primaryColor }}>{tenant.name.charAt(0)}</div>
          <div>
            <h1 className="font-heading text-2xl font-bold flex items-center gap-2">{tenant.name} <StatusBadge status={tenant.status} /></h1>
            <div className="text-sm text-muted-foreground">slug: <code>{tenant.slug}</code> • criado em {new Date(tenant.createdAt).toLocaleDateString('pt-BR')}</div>
          </div>
        </div>
        <div className="flex gap-2">
          {tenant.status !== 'active' && <Button onClick={() => changeStatus('active', 'Ativo')} className="bg-emerald-600 hover:bg-emerald-700 text-white"><Power className="w-4 h-4 mr-1" />Ativar</Button>}
          {tenant.status !== 'suspended' && <Button onClick={() => changeStatus('suspended', 'Suspenso')} variant="outline"><RotateCcw className="w-4 h-4 mr-1 text-amber-600" />Suspender</Button>}
          {tenant.status !== 'blocked' && <Button onClick={() => changeStatus('blocked', 'Bloqueado')} variant="outline"><ShieldOff className="w-4 h-4 mr-1 text-red-600" />Bloquear</Button>}
          {tenant.status !== 'canceled' && <Button onClick={() => changeStatus('canceled', 'Cancelado')} variant="outline"><Ban className="w-4 h-4 mr-1" />Cancelar</Button>}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Card className="p-3"><div className="text-xs text-muted-foreground">Usuários</div><div className="font-heading text-xl font-bold">{tenant.tenantUsers.length}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Formulários</div><div className="font-heading text-xl font-bold">{tenant.forms.length}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Pipelines</div><div className="font-heading text-xl font-bold">{tenant.pipelines.length}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Leads</div><div className="font-heading text-xl font-bold">{tenant.leadsCount}</div></Card>
        <Card className="p-3"><div className="text-xs text-muted-foreground">Último login</div><div className="text-sm mt-1">{tenant.lastLoginAt ? new Date(tenant.lastLoginAt).toLocaleString('pt-BR') : '—'}</div></Card>
      </div>

      <Tabs defaultValue="plan">
        <TabsList>
          <TabsTrigger value="plan">Plano & Cobrança</TabsTrigger>
          <TabsTrigger value="users">Usuários ({tenant.tenantUsers.length})</TabsTrigger>
          <TabsTrigger value="history">Histórico de status</TabsTrigger>
          <TabsTrigger value="notes">Notas internas</TabsTrigger>
        </TabsList>
        <TabsContent value="plan">
          <Card className="p-5 space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium">Plano</label>
                <Select value={planForm.planId} onValueChange={(v) => setPlanForm({ ...planForm, planId: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione um plano" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem plano</SelectItem>
                    {plans.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} — R$ {Number(p.price).toFixed(2)}/{p.billingCycle === 'yearly' ? 'ano' : 'mês'}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Próximo vencimento</label>
                <Input type="date" value={planForm.nextDueDate} onChange={(e) => setPlanForm({ ...planForm, nextDueDate: e.target.value })} />
              </div>
            </div>
            <Button onClick={savePlan} disabled={savingPlan}>{savingPlan ? 'Salvando...' : 'Salvar plano'}</Button>
          </Card>
        </TabsContent>
        <TabsContent value="users">
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b"><tr className="text-xs uppercase text-muted-foreground"><th className="text-left py-2 px-4">Nome</th><th className="text-left py-2 px-4">E-mail</th><th className="text-left py-2 px-4">Role</th><th className="text-left py-2 px-4">Status</th></tr></thead>
              <tbody>
                {tenant.tenantUsers.map((tu: any) => (
                  <tr key={tu.id} className="border-b last:border-0"><td className="py-2 px-4">{tu.user.name}</td><td className="py-2 px-4">{tu.user.email}</td><td className="py-2 px-4">{tu.role}</td><td className="py-2 px-4">{tu.status}</td></tr>
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
        <TabsContent value="history">
          <Card className="p-5">
            {tenant.statusHistory.length === 0 ? <div className="text-sm text-muted-foreground">Sem mudanças de status registradas.</div> : (
              <ul className="space-y-2">
                {tenant.statusHistory.map((h: any) => (
                  <li key={h.id} className="text-sm flex items-center gap-2">
                    <StatusBadge status={h.previousStatus || 'inactive'} />
                    <span className="text-muted-foreground">→</span>
                    <StatusBadge status={h.newStatus} />
                    <span className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString('pt-BR')} — por {h.changer?.name || 'sistema'}{h.reason ? ` — "${h.reason}"` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </TabsContent>
        <TabsContent value="notes">
          <Card className="p-5 space-y-3">
            <Textarea rows={6} value={planForm.internalNotes} onChange={(e) => setPlanForm({ ...planForm, internalNotes: e.target.value })} placeholder="Notas internas (não visíveis ao cliente)..." />
            <Button onClick={savePlan} disabled={savingPlan}>Salvar notas</Button>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

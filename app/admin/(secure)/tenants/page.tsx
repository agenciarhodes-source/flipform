'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, ExternalLink, Power, Ban, ShieldOff, RotateCcw } from 'lucide-react';
import { StatusBadge } from '@/components/admin/status-badge';

const credits = new Intl.NumberFormat('pt-BR');

const KIND_LABELS: Record<string, string> = {
  client: 'Cliente',
  internal_test: 'Teste interno',
  technical_access: 'Acesso técnico',
  unclassified: 'Não classificado',
};
const ROLE_LABELS: Record<string, string> = { owner: 'Dono', admin: 'Administrador', manager: 'Gestor' };

export default function AdminTenantsPage() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('client');

  const load = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (q) params.set('q', q);
    if (kind === 'client') params.set('clientsOnly', 'true');
    else if (kind !== 'all') params.set('kind', kind);
    const data = await fetch(`/api/admin/tenants?${params}`).then((r) => r.json());
    setTenants(data.tenants || []);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [status, kind]);

  const changeKind = async (id: string, accountKind: string) => {
    try {
      const res = await fetch(`/api/admin/tenants/${id}/account-kind`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountKind }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Erro');
      }
      toast.success('Tipo de conta atualizado');
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  const changeStatus = async (id: string, newStatus: string, label: string) => {
    if (newStatus !== 'active' && !confirm(`Tem certeza que deseja ${label.toLowerCase()} este tenant?`)) return;
    try {
      const res = await fetch(`/api/admin/tenants/${id}/status`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const e = await res.json();
        throw new Error(e.error || 'Erro');
      }
      toast.success(`Tenant ${label.toLowerCase()} com sucesso`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };

  return (
    <div className="p-8 space-y-5">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Clientes</h1>
          <p className="text-sm text-muted-foreground">
            Empresas classificadas como Cliente. O tipo de cada conta é definido aqui, na coluna Tipo; contas de teste interno e acessos técnicos ficam fora desta lista por padrão. Os usuários de cada empresa continuam disponíveis no painel Acessos. A carteira e o consumo de IA são da empresa, somando todos os acessos dela.
          </p>
        </div>
      </div>
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[220px]">
            <label className="text-xs text-muted-foreground">Buscar</label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Empresa, slug, dono ou e-mail..."
                className="pl-8"
                onKeyDown={(e) => e.key === 'Enter' && load()}
              />
            </div>
          </div>
          <div className="min-w-[180px]">
            <label className="text-xs text-muted-foreground">Tipo</label>
            <Select value={kind} onValueChange={setKind}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="client">Clientes</SelectItem>
                <SelectItem value="unclassified">Não classificados</SelectItem>
                <SelectItem value="internal_test">Teste interno</SelectItem>
                <SelectItem value="technical_access">Acesso técnico</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="min-w-[180px]">
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="trial">Trial</SelectItem>
                <SelectItem value="past_due">Pagamento pendente</SelectItem>
                <SelectItem value="suspended">Suspenso</SelectItem>
                <SelectItem value="blocked">Bloqueado</SelectItem>
                <SelectItem value="canceled">Cancelado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={load}>Aplicar</Button>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-muted-foreground"><Loader2 className="w-5 h-5 inline animate-spin mr-2" />Carregando...</div>
        ) : tenants.length === 0 ? (
          <div className="p-10 text-center text-muted-foreground">
            {kind === 'client'
              ? 'Nenhuma conta classificada como Cliente. Use o filtro Tipo para ver as não classificadas e definir o tipo de cada uma.'
              : 'Nenhuma conta encontrada.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b">
                <tr className="text-xs uppercase text-muted-foreground">
                  <th className="text-left py-3 px-4">Cliente</th>
                  <th className="text-left py-3 px-4">Tipo</th>
                  <th className="text-left py-3 px-4">Responsável</th>
                  <th className="text-left py-3 px-4">Status</th>
                  <th className="text-left py-3 px-4">Plano</th>
                  <th className="text-right py-3 px-4">Acessos</th>
                  <th className="text-right py-3 px-4">Formulários</th>
                  <th className="text-right py-3 px-4">Leads</th>
                  <th className="text-right py-3 px-4">Carteira IA</th>
                  <th className="text-right py-3 px-4">Consumo IA (30 dias)</th>
                  <th className="text-left py-3 px-4">Último login</th>
                  <th className="text-left py-3 px-4">Vence em</th>
                  <th className="text-right py-3 px-4">Ações</th>
                </tr>
              </thead>
              <tbody>
                {tenants.map((t) => (
                  <tr key={t.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-3 px-4">
                      <Link href={`/admin/tenants/${t.id}`} className="font-medium hover:underline">{t.name}</Link>
                      <div className="text-xs text-muted-foreground">{t.slug}</div>
                    </td>
                    <td className="py-3 px-4">
                      <select
                        className="rounded border bg-background px-2 py-1 text-xs"
                        value={t.accountKind}
                        aria-label="Tipo de conta"
                        onChange={(e) => changeKind(t.id, e.target.value)}
                      >
                        {Object.entries(KIND_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                    </td>
                    <td className="py-3 px-4 min-w-[220px]">
                      {t.owners?.length ? (
                        <div className="space-y-1.5">
                          {t.owners.map((owner: any) => (
                            <div key={owner.tenantUserId}>
                              <div className="font-medium">{owner.name}</div>
                              {owner.role !== 'owner' && (
                                <div className="text-[11px] text-muted-foreground">{ROLE_LABELS[owner.role] || owner.role} (sem dono cadastrado)</div>
                              )}
                              <div className="text-xs text-muted-foreground">{owner.email}</div>
                              {owner.status !== 'active' && (
                                <div className="text-[11px] text-amber-700">Acesso owner: {owner.status}</div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : <span className="text-xs text-muted-foreground">Sem responsável</span>}
                    </td>
                    <td className="py-3 px-4"><StatusBadge status={t.status} /></td>
                    <td className="py-3 px-4">{t.planName ? <span>{t.planName} <span className="text-xs text-muted-foreground">(R$ {Number(t.planPrice).toFixed(2)})</span></span> : <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-3 px-4 text-right">{t.usersCount}</td>
                    <td className="py-3 px-4 text-right">{t.formsCount}</td>
                    <td className="py-3 px-4 text-right">{t.leadsCount}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">{t.flipAi ? `${credits.format(t.flipAi.balanceCredits)} créditos` : <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">{t.flipAi ? `${credits.format(t.flipAi.consumedCredits30d)} créditos` : <span className="text-muted-foreground">—</span>}</td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">{t.lastLoginAt ? new Date(t.lastLoginAt).toLocaleString('pt-BR') : '—'}</td>
                    <td className="py-3 px-4 text-xs text-muted-foreground">{t.nextDueDate ? new Date(t.nextDueDate).toLocaleDateString('pt-BR') : '—'}</td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex gap-1">
                        <Link href={`/admin/tenants/${t.id}`}><Button variant="outline" size="sm"><ExternalLink className="w-3.5 h-3.5" /></Button></Link>
                        {t.status !== 'active' && <Button size="sm" variant="outline" title="Ativar" onClick={() => changeStatus(t.id, 'active', 'Ativado')}><Power className="w-3.5 h-3.5 text-emerald-600" /></Button>}
                        {t.status !== 'suspended' && <Button size="sm" variant="outline" title="Suspender" onClick={() => changeStatus(t.id, 'suspended', 'Suspenso')}><RotateCcw className="w-3.5 h-3.5 text-amber-600" /></Button>}
                        {t.status !== 'blocked' && <Button size="sm" variant="outline" title="Bloquear" onClick={() => changeStatus(t.id, 'blocked', 'Bloqueado')}><ShieldOff className="w-3.5 h-3.5 text-red-600" /></Button>}
                        {t.status !== 'canceled' && <Button size="sm" variant="outline" title="Cancelar" onClick={() => changeStatus(t.id, 'canceled', 'Cancelado')}><Ban className="w-3.5 h-3.5 text-slate-600" /></Button>}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

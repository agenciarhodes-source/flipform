'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ExternalLink, Loader2, RefreshCcw, Search, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatLeadSource } from '@/lib/leads';

type TenantOption = {
  id: string;
  name: string;
  slug: string;
  status: string;
  accessAllowed: boolean;
  accessReason: string;
};

type LeadRow = {
  id: string;
  tenantId: string;
  name: string;
  email: string | null;
  phone: string | null;
  source: string;
  temperature: string;
  status: string;
  enteredAt: string;
  createdAt: string;
  assignedUser: { id: string; name: string } | null;
  stage: { id: string; name: string; color: string } | null;
  form: { id: string; name: string } | null;
  company: { id: string; name: string; slug: string } | null;
};

type Payload = {
  period: 'today' | '7d' | '30d' | '90d' | 'all';
  group: { id: string; name: string; role: string };
  selectedTenantId: string | null;
  scopeLabel: string;
  groupOptions: Array<{ id: string; name: string; role: string }>;
  tenantOptions: TenantOption[];
  agentOptions: Array<{ id: string; name: string }>;
  leads: LeadRow[];
};

const STATUS_LABELS: Record<string, string> = {
  open: 'Em andamento',
  won: 'Ganho',
  lost: 'Perdido',
};

export function BusinessGroupLeadsClient() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [groupId, setGroupId] = useState('');
  const [tenantId, setTenantId] = useState('all');
  const [period, setPeriod] = useState<'today' | '7d' | '30d' | '90d' | 'all'>('30d');
  const [status, setStatus] = useState('all');
  const [assignedTo, setAssignedTo] = useState('all');
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switchingTenantId, setSwitchingTenantId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ period });
      if (groupId) params.set('groupId', groupId);
      if (tenantId !== 'all') params.set('tenantId', tenantId);
      if (status !== 'all') params.set('status', status);
      if (assignedTo !== 'all') params.set('assignedTo', assignedTo);
      if (search) params.set('q', search);
      const response = await fetch(`/api/business-groups/leads?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro ao carregar leads do grupo.');
      setData(payload);
      if (!groupId) setGroupId(payload.group.id);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar leads do grupo.');
    } finally {
      setLoading(false);
    }
  }, [period, groupId, tenantId, status, assignedTo, search]);

  useEffect(() => { load(); }, [load]);

  const selectedTenant = useMemo(
    () => data?.tenantOptions.find((tenant) => tenant.id === tenantId) || null,
    [data, tenantId],
  );

  async function openTenant(targetTenantId: string) {
    if (!data?.group.id) return;
    setSwitchingTenantId(targetTenantId);
    setError(null);
    try {
      const response = await fetch('/api/business-groups/switch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupId: data.group.id, tenantId: targetTenantId }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível abrir esta empresa.');
      router.push('/leads');
      router.refresh();
    } catch (e: any) {
      setError(e.message || 'Não foi possível abrir esta empresa.');
    } finally {
      setSwitchingTenantId(null);
    }
  }

  function submitSearch(event: React.FormEvent) {
    event.preventDefault();
    setSearch(draftSearch.trim());
  }

  return (
    <div className="p-4 lg:p-8 space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="w-6 h-6 text-brand-600" />
            <h1 className="font-heading text-2xl lg:text-3xl font-bold">Leads do grupo</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Acompanhe os leads de todas as empresas, identificando empresa e atendente responsável.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data && data.groupOptions.length > 1 && (
            <Select value={groupId || data.group.id} onValueChange={(value) => { setGroupId(value); setTenantId('all'); setAssignedTo('all'); }}>
              <SelectTrigger className="w-[210px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent>{data.groupOptions.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={tenantId} onValueChange={(value) => { setTenantId(value); setAssignedTo('all'); }}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Toda a operação</SelectItem>
              {data?.tenantOptions.map((tenant) => (
                <SelectItem key={tenant.id} value={tenant.id} disabled={!tenant.accessAllowed}>
                  {tenant.name}{tenant.accessAllowed ? '' : ' — indisponível'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
            <SelectTrigger className="w-[135px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Hoje</SelectItem>
              <SelectItem value="7d">7 dias</SelectItem>
              <SelectItem value="30d">30 dias</SelectItem>
              <SelectItem value="90d">90 dias</SelectItem>
              <SelectItem value="all">Todo período</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(240px,1fr)_180px_220px_auto] gap-3 items-end">
          <form onSubmit={submitSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={draftSearch} onChange={(e) => setDraftSearch(e.target.value)} placeholder="Buscar nome, telefone ou e-mail" className="pl-9" />
            </div>
            <Button type="submit" variant="secondary">Buscar</Button>
          </form>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="open">Em andamento</SelectItem>
                <SelectItem value="won">Ganhos</SelectItem>
                <SelectItem value="lost">Perdidos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Atendente</label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os atendentes</SelectItem>
                {data?.agentOptions.map((agent) => <SelectItem key={agent.id} value={agent.id}>{agent.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {selectedTenant?.accessAllowed && (
            <Button onClick={() => openTenant(selectedTenant.id)} disabled={switchingTenantId === selectedTenant.id}>
              {switchingTenantId === selectedTenant.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
              Operar empresa
            </Button>
          )}
        </div>
      </Card>

      {error && <Card className="p-4 border-rose-200 bg-rose-50 text-rose-800 text-sm">{error}</Card>}

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading font-semibold">{data?.scopeLabel || 'Leads'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Leitura consolidada. Para editar um lead, abra a empresa correspondente.</p>
          </div>
          <Badge variant="secondary">{data?.leads.length ?? 0} exibidos</Badge>
        </div>
        {loading && !data ? (
          <div className="py-16 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando leads...</div>
        ) : data?.leads.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Lead</th>
                  <th className="text-left px-4 py-3">Empresa</th>
                  <th className="text-left px-4 py-3">Atendente</th>
                  <th className="text-left px-4 py-3">Etapa</th>
                  <th className="text-left px-4 py-3">Origem</th>
                  <th className="text-left px-4 py-3">Entrada</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-right px-4 py-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.leads.map((lead) => (
                  <tr key={lead.id} className="border-t align-top">
                    <td className="px-4 py-3 min-w-[220px]">
                      <div className="font-medium">{lead.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{lead.phone || lead.email || 'Sem contato'}</div>
                      {lead.form?.name && <div className="text-xs text-muted-foreground mt-0.5">Formulário: {lead.form.name}</div>}
                    </td>
                    <td className="px-4 py-3"><Badge variant="outline"><Building2 className="w-3 h-3 mr-1" />{lead.company?.name || 'Empresa'}</Badge></td>
                    <td className="px-4 py-3"><Badge variant="secondary">{lead.assignedUser?.name || 'Sem atendente'}</Badge></td>
                    <td className="px-4 py-3">{lead.stage?.name || '—'}</td>
                    <td className="px-4 py-3">{formatLeadSource(lead.source)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(lead.enteredAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</td>
                    <td className="px-4 py-3"><Badge variant={lead.status === 'won' ? 'default' : 'outline'}>{STATUS_LABELS[lead.status] || lead.status}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      {lead.company && (
                        <Button size="sm" variant="outline" onClick={() => openTenant(lead.company!.id)} disabled={switchingTenantId === lead.company.id}>
                          {switchingTenantId === lead.company.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
                          Abrir empresa
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-14 text-center text-sm text-muted-foreground">Nenhum lead encontrado para os filtros selecionados.</div>
        )}
      </Card>
    </div>
  );
}

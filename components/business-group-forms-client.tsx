'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, ExternalLink, FileText, Loader2, RefreshCcw, Search } from 'lucide-react';
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

type FormRow = {
  id: string;
  tenantId: string;
  name: string;
  publicTitle: string;
  slug: string;
  isActive: boolean;
  leadSource: string;
  createdAt: string;
  updatedAt: string;
  pipeline: { id: string; name: string } | null;
  initialStage: { id: string; name: string } | null;
  _count: { leads: number; fields: number };
  company: { id: string; name: string; slug: string } | null;
};

type Payload = {
  group: { id: string; name: string; role: string };
  selectedTenantId: string | null;
  scopeLabel: string;
  groupOptions: Array<{ id: string; name: string; role: string }>;
  tenantOptions: TenantOption[];
  forms: FormRow[];
};

export function BusinessGroupFormsClient() {
  const router = useRouter();
  const [data, setData] = useState<Payload | null>(null);
  const [groupId, setGroupId] = useState('');
  const [tenantId, setTenantId] = useState('all');
  const [status, setStatus] = useState('all');
  const [draftSearch, setDraftSearch] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [switchingTenantId, setSwitchingTenantId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (groupId) params.set('groupId', groupId);
      if (tenantId !== 'all') params.set('tenantId', tenantId);
      if (status !== 'all') params.set('status', status);
      if (search) params.set('q', search);
      const response = await fetch(`/api/business-groups/forms?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro ao carregar formulários do grupo.');
      setData(payload);
      if (!groupId) setGroupId(payload.group.id);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar formulários do grupo.');
    } finally {
      setLoading(false);
    }
  }, [groupId, tenantId, status, search]);

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
      router.push('/forms');
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
            <FileText className="w-6 h-6 text-brand-600" />
            <h1 className="font-heading text-2xl lg:text-3xl font-bold">Formulários do grupo</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1">Visualize os formulários de todas as empresas sem misturar os dados de cada tenant.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data && data.groupOptions.length > 1 && (
            <Select value={groupId || data.group.id} onValueChange={(value) => { setGroupId(value); setTenantId('all'); }}>
              <SelectTrigger className="w-[210px]"><SelectValue placeholder="Grupo" /></SelectTrigger>
              <SelectContent>{data.groupOptions.map((group) => <SelectItem key={group.id} value={group.id}>{group.name}</SelectItem>)}</SelectContent>
            </Select>
          )}
          <Select value={tenantId} onValueChange={setTenantId}>
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
          <Button variant="outline" onClick={load} disabled={loading}>
            <RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-[minmax(240px,1fr)_180px_auto] gap-3 items-end">
          <form onSubmit={submitSearch} className="flex gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={draftSearch} onChange={(e) => setDraftSearch(e.target.value)} placeholder="Buscar formulário ou slug" className="pl-9" />
            </div>
            <Button type="submit" variant="secondary">Buscar</Button>
          </form>
          <div>
            <label className="text-xs text-muted-foreground">Status</label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {selectedTenant?.accessAllowed && (
            <Button onClick={() => openTenant(selectedTenant.id)} disabled={switchingTenantId === selectedTenant.id}>
              {switchingTenantId === selectedTenant.id ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ExternalLink className="w-4 h-4 mr-2" />}
              Gerenciar empresa
            </Button>
          )}
        </div>
      </Card>

      {error && <Card className="p-4 border-rose-200 bg-rose-50 text-rose-800 text-sm">{error}</Card>}

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading font-semibold">{data?.scopeLabel || 'Formulários'}</h2>
            <p className="text-xs text-muted-foreground mt-0.5">A listagem é somente leitura; edição continua dentro da empresa correspondente.</p>
          </div>
          <Badge variant="secondary">{data?.forms.length ?? 0} formulários</Badge>
        </div>
        {loading && !data ? (
          <div className="py-16 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 animate-spin mr-2" />Carregando formulários...</div>
        ) : data?.forms.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Formulário</th>
                  <th className="text-left px-4 py-3">Empresa</th>
                  <th className="text-left px-4 py-3">Pipeline / etapa</th>
                  <th className="text-left px-4 py-3">Origem</th>
                  <th className="text-right px-4 py-3">Leads</th>
                  <th className="text-right px-4 py-3">Campos</th>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Atualizado</th>
                  <th className="text-right px-4 py-3">Ação</th>
                </tr>
              </thead>
              <tbody>
                {data.forms.map((form) => (
                  <tr key={form.id} className="border-t align-top">
                    <td className="px-4 py-3 min-w-[220px]">
                      <div className="font-medium">{form.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">/{form.slug}</div>
                    </td>
                    <td className="px-4 py-3"><Badge variant="outline"><Building2 className="w-3 h-3 mr-1" />{form.company?.name || 'Empresa'}</Badge></td>
                    <td className="px-4 py-3 min-w-[180px]">
                      <div>{form.pipeline?.name || '—'}</div>
                      <div className="text-xs text-muted-foreground">{form.initialStage?.name || 'Sem etapa'}</div>
                    </td>
                    <td className="px-4 py-3">{formatLeadSource(form.leadSource)}</td>
                    <td className="px-4 py-3 text-right font-medium">{form._count.leads}</td>
                    <td className="px-4 py-3 text-right">{form._count.fields}</td>
                    <td className="px-4 py-3"><Badge variant={form.isActive ? 'default' : 'outline'}>{form.isActive ? 'Ativo' : 'Inativo'}</Badge></td>
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(form.updatedAt).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right">
                      {form.company && (
                        <Button size="sm" variant="outline" onClick={() => openTenant(form.company!.id)} disabled={switchingTenantId === form.company.id}>
                          {switchingTenantId === form.company.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ExternalLink className="w-3.5 h-3.5 mr-1" />}
                          Gerenciar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-14 text-center text-sm text-muted-foreground">Nenhum formulário encontrado para os filtros selecionados.</div>
        )}
      </Card>
    </div>
  );
}

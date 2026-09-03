'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ROLE_LABELS_PT_BR, ROLE_LEVEL, canManageRole, type RoleName } from '@/lib/rbac';
import type { SessionPayload } from '@/lib/auth';
import { CircleDollarSign, Network, Power, RefreshCw, Save, ShieldCheck, Target, TrendingUp, UsersRound } from 'lucide-react';

type Overview = {
  period: 'today' | '7d' | '30d';
  schemaReady: boolean;
  hierarchyConfigured: boolean;
  legacyMode: boolean;
  selectedTenantUserId: string | null;
  scopeLabel: string;
  summary: {
    totalLeads: number;
    inProgress: number;
    won: number;
    lost: number;
    conversionRate: number;
    revenueCents: number;
    teamMembers: number;
    agents: number;
  };
  viewOptions: { tenantUserId: string; name: string; role: RoleName }[];
  teamPerformance: {
    tenantUserId: string;
    userId: string;
    name: string;
    leads: number;
    inProgress: number;
    won: number;
    lost: number;
    conversionRate: number;
    revenueCents: number;
  }[];
};

type HierarchyMember = {
  tenantUserId: string;
  userId: string;
  name: string;
  role: RoleName;
};

type Hierarchy = {
  schemaReady: boolean;
  hierarchyConfigured: boolean;
  hierarchyEnabled: boolean;
  legacyMode: boolean;
  actorTenantUserId: string;
  canManage: boolean;
  members: HierarchyMember[];
  visibleTenantUserIds: string[];
  edges: { id: string; superiorTenantUserId: string; subordinateTenantUserId: string }[];
};

function money(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}

function MetricCard({ label, value, detail, icon: Icon }: { label: string; value: string | number; detail?: string; icon: any }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold">{value}</p>
          {detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}
        </div>
        <div className="rounded-xl bg-muted p-2.5"><Icon className="h-4 w-4" /></div>
      </div>
    </Card>
  );
}

export function TeamOverviewClient({ session }: { session: SessionPayload }) {
  const [period, setPeriod] = useState<'today' | '7d' | '30d'>('30d');
  const [scopeTenantUserId, setScopeTenantUserId] = useState('');
  const [overview, setOverview] = useState<Overview | null>(null);
  const [hierarchy, setHierarchy] = useState<Hierarchy | null>(null);
  const [loading, setLoading] = useState(true);
  const [subordinateId, setSubordinateId] = useState('');
  const [superiorIds, setSuperiorIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);

  const loadHierarchy = useCallback(async () => {
    const response = await fetch('/api/team/hierarchy');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao carregar hierarquia');
    setHierarchy(data);
    return data as Hierarchy;
  }, []);

  const loadOverview = useCallback(async () => {
    const params = new URLSearchParams({ period });
    if (scopeTenantUserId) params.set('scopeTenantUserId', scopeTenantUserId);
    const response = await fetch(`/api/team/overview?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Erro ao carregar visão da equipe');
    setOverview(data);
  }, [period, scopeTenantUserId]);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadHierarchy(), loadOverview()]);
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  }, [loadHierarchy, loadOverview]);

  useEffect(() => { void reload(); }, [reload]);

  const manageableMembers = useMemo(() => {
    if (!hierarchy?.canManage) return [];
    return hierarchy.members.filter((member) => member.tenantUserId !== hierarchy.actorTenantUserId && canManageRole(session.role, member.role, session.globalRole));
  }, [hierarchy, session.role, session.globalRole]);

  const selectedSubordinate = hierarchy?.members.find((member) => member.tenantUserId === subordinateId) || null;
  const superiorCandidates = useMemo(() => {
    if (!hierarchy || !selectedSubordinate) return [];
    return hierarchy.members.filter((member) =>
      member.tenantUserId !== selectedSubordinate.tenantUserId &&
      (ROLE_LEVEL[member.role] ?? 0) > (ROLE_LEVEL[selectedSubordinate.role] ?? 0),
    );
  }, [hierarchy, selectedSubordinate]);

  useEffect(() => {
    if (!hierarchy || !subordinateId) return setSuperiorIds([]);
    setSuperiorIds(hierarchy.edges.filter((edge) => edge.subordinateTenantUserId === subordinateId).map((edge) => edge.superiorTenantUserId));
  }, [hierarchy, subordinateId]);

  const saveHierarchy = async () => {
    if (!subordinateId) return;
    setSaving(true);
    try {
      const response = await fetch('/api/team/hierarchy', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subordinateTenantUserId: subordinateId, superiorTenantUserIds: superiorIds }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao salvar hierarquia');
      await loadHierarchy();
      toast.success('Vínculo salvo em modo seguro.');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleHierarchy = async () => {
    if (!hierarchy) return;
    const enabled = !hierarchy.hierarchyEnabled;
    if (enabled && !confirm('Ativar a hierarquia agora? Administradores e Gestores passarão a enxergar somente suas árvores vinculadas.')) return;
    setActivating(true);
    try {
      const response = await fetch('/api/team/hierarchy', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erro ao alterar ativação');
      setScopeTenantUserId('');
      await loadHierarchy();
      toast.success(enabled ? 'Hierarquia ativada.' : 'Hierarquia desativada; visão ampla restaurada.');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setActivating(false);
    }
  };

  const parentNames = (memberId: string) => {
    if (!hierarchy) return '—';
    const parents = hierarchy.edges
      .filter((edge) => edge.subordinateTenantUserId === memberId)
      .map((edge) => hierarchy.members.find((member) => member.tenantUserId === edge.superiorTenantUserId)?.name)
      .filter(Boolean);
    return parents.length ? parents.join(', ') : 'Sem vínculo';
  };

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border bg-muted/40 px-2.5 py-1 text-xs text-muted-foreground"><Network className="h-3.5 w-3.5" /> Hierarquia operacional</div>
          <h1 className="font-heading text-2xl font-bold lg:text-3xl">Visão da equipe</h1>
          <p className="mt-1 text-sm text-muted-foreground">Acompanhe sua operação e alterne entre gestores e atendentes sem trocar de login.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="text-xs font-medium text-muted-foreground">Período
            <select className="mt-1 block min-w-32 rounded-md border bg-background px-3 py-2 text-sm text-foreground" value={period} onChange={(event) => setPeriod(event.target.value as 'today' | '7d' | '30d')}>
              <option value="today">Hoje</option><option value="7d">7 dias</option><option value="30d">30 dias</option>
            </select>
          </label>
          <label className="text-xs font-medium text-muted-foreground">Visão atual
            <select className="mt-1 block min-w-56 rounded-md border bg-background px-3 py-2 text-sm text-foreground" value={scopeTenantUserId} onChange={(event) => setScopeTenantUserId(event.target.value)}>
              <option value="">Toda minha operação</option>
              {overview?.viewOptions.map((member) => <option key={member.tenantUserId} value={member.tenantUserId}>{member.name} · {ROLE_LABELS_PT_BR[member.role]}</option>)}
            </select>
          </label>
          <Button variant="outline" className="self-end" onClick={() => void reload()}><RefreshCw className="mr-2 h-4 w-4" /> Atualizar</Button>
        </div>
      </div>

      {overview?.legacyMode ? (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <div className="flex items-start gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /><div><strong>Modo de compatibilidade ativo.</strong> Você pode montar toda a hierarquia sem mudar a visão atual de ninguém. Administradores e Gestores só passam a usar suas árvores depois que Dono/Administrador ativar explicitamente a hierarquia.</div></div>
        </Card>
      ) : null}

      {loading || !overview ? <Card className="p-8 text-center text-sm text-muted-foreground">Carregando visão consolidada...</Card> : (
        <>
          <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
            <div><p className="text-xs text-muted-foreground">Escopo aplicado</p><p className="font-semibold">{overview.scopeLabel}</p></div>
            <Badge variant="outline">{overview.summary.agents} atendente(s) · {overview.summary.teamMembers} membro(s)</Badge>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <MetricCard label="Leads" value={overview.summary.totalLeads} detail="no escopo selecionado" icon={UsersRound} />
            <MetricCard label="Em atendimento" value={overview.summary.inProgress} icon={TrendingUp} />
            <MetricCard label="Fechamentos" value={overview.summary.won} icon={Target} />
            <MetricCard label="Conversão" value={`${overview.summary.conversionRate}%`} icon={ShieldCheck} />
            <MetricCard label="Receita" value={money(overview.summary.revenueCents)} detail="compras registradas" icon={CircleDollarSign} />
          </div>
          <Card className="overflow-hidden">
            <div className="border-b px-4 py-3"><h2 className="font-heading font-semibold">Performance por atendente</h2><p className="text-xs text-muted-foreground">Somente usuários pertencentes ao escopo selecionado.</p></div>
            <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
              <thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-4 py-3">Atendente</th><th>Leads</th><th>Em atendimento</th><th>Fechamentos</th><th>Perdidos</th><th>Conversão</th><th className="pr-4">Receita</th></tr></thead>
              <tbody>{overview.teamPerformance.length ? overview.teamPerformance.map((agent) => <tr key={agent.tenantUserId} className="border-t"><td className="px-4 py-3 font-medium">{agent.name}</td><td>{agent.leads}</td><td>{agent.inProgress}</td><td>{agent.won}</td><td>{agent.lost}</td><td>{agent.conversionRate}%</td><td className="pr-4">{money(agent.revenueCents)}</td></tr>) : <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">Nenhum atendente no escopo selecionado.</td></tr>}</tbody>
            </table></div>
          </Card>
        </>
      )}

      {hierarchy?.canManage ? <Card className="p-4 lg:p-5">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div><h2 className="font-heading text-lg font-semibold">Gerenciar hierarquia</h2><p className="text-sm text-muted-foreground">Vincule cada usuário a um ou mais níveis superiores. Esses vínculos não alteram leads, acessos, integrações ou credenciais.</p></div>
          {hierarchy.schemaReady ? <div className="flex items-center gap-2"><Badge variant="outline" className={hierarchy.hierarchyEnabled ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-800'}>{hierarchy.hierarchyEnabled ? 'Hierarquia ativa' : 'Rascunho / visão antiga'}</Badge><Button variant={hierarchy.hierarchyEnabled ? 'outline' : 'default'} onClick={toggleHierarchy} disabled={activating}><Power className="mr-2 h-4 w-4" />{activating ? 'Aplicando...' : hierarchy.hierarchyEnabled ? 'Desativar' : 'Ativar hierarquia'}</Button></div> : null}
        </div>

        {!hierarchy.schemaReady ? <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">A estrutura aditiva de hierarquia ainda não está instalada neste ambiente. O FlipForm permanece com o comportamento atual; aplique o reparo manual desta atualização antes de cadastrar vínculos.</div> : <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <div className="space-y-3">
            <label className="block text-sm font-medium">Usuário subordinado</label>
            <select className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={subordinateId} onChange={(event) => setSubordinateId(event.target.value)}><option value="">Selecione...</option>{manageableMembers.map((member) => <option key={member.tenantUserId} value={member.tenantUserId}>{member.name} · {ROLE_LABELS_PT_BR[member.role]}</option>)}</select>
            {selectedSubordinate ? <div className="space-y-2 rounded-lg border p-3">
              <p className="text-xs font-semibold uppercase text-muted-foreground">Superior(es) permitido(s)</p>
              {superiorCandidates.length ? superiorCandidates.map((candidate) => <label key={candidate.tenantUserId} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60"><input type="checkbox" checked={superiorIds.includes(candidate.tenantUserId)} onChange={(event) => setSuperiorIds((current) => event.target.checked ? [...new Set([...current, candidate.tenantUserId])] : current.filter((id) => id !== candidate.tenantUserId))} /><span className="text-sm"><strong>{candidate.name}</strong> <span className="text-muted-foreground">· {ROLE_LABELS_PT_BR[candidate.role]}</span></span></label>) : <p className="text-sm text-muted-foreground">Não há um nível superior compatível para este usuário.</p>}
              <Button className="mt-2 w-full" onClick={saveHierarchy} disabled={saving}><Save className="mr-2 h-4 w-4" />{saving ? 'Salvando...' : 'Salvar vínculo'}</Button>
            </div> : null}
          </div>
          <div><p className="mb-2 text-sm font-medium">Estrutura cadastrada</p><div className="overflow-x-auto rounded-lg border"><table className="w-full min-w-[560px] text-sm"><thead className="bg-muted/40 text-left text-xs uppercase text-muted-foreground"><tr><th className="px-3 py-2.5">Usuário</th><th>Papel</th><th className="pr-3">Superior(es)</th></tr></thead><tbody>{hierarchy.members.filter((member) => member.role !== 'owner').map((member) => <tr key={member.tenantUserId} className="border-t"><td className="px-3 py-2.5 font-medium">{member.name}</td><td>{ROLE_LABELS_PT_BR[member.role]}</td><td className="pr-3 text-muted-foreground">{parentNames(member.tenantUserId)}</td></tr>)}</tbody></table></div></div>
        </div>}
      </Card> : null}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Building2, Loader2, Plus, RefreshCcw, Save, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const GROUP_ROLES = ['owner', 'admin', 'viewer'] as const;

type Tenant = { id: string; name: string; slug: string; status: string };
type Member = { id: string; userId: string; name: string; email: string; role: string; status: string };
type Group = { id: string; name: string; slug: string; status: string; tenants: Tenant[]; members: Member[] };
type Snapshot = { schemaReady: boolean; groups: Group[]; availableTenants: Tenant[] };

export default function BusinessGroupsAdminPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tenantDrafts, setTenantDrafts] = useState<Record<string, string[]>>({});
  const [memberEmail, setMemberEmail] = useState<Record<string, string>>({});
  const [memberRole, setMemberRole] = useState<Record<string, string>>({});
  const [savingGroup, setSavingGroup] = useState<string | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/business-groups', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao carregar grupos empresariais.');
      setSnapshot(data);
      const drafts: Record<string, string[]> = {};
      const roles: Record<string, string> = {};
      for (const group of data.groups || []) {
        drafts[group.id] = group.tenants.map((tenant: Tenant) => tenant.id);
        roles[group.id] = 'owner';
      }
      setTenantDrafts(drafts);
      setMemberRole(roles);
    } catch (e: any) {
      setError(e.message || 'Falha ao carregar grupos empresariais.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function createGroup() {
    if (newName.trim().length < 2) return;
    setCreating(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/admin/business-groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao criar grupo.');
      setNewName('');
      setSuccess('Grupo empresarial criado. Agora vincule as empresas e os responsáveis.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Falha ao criar grupo.');
    } finally {
      setCreating(false);
    }
  }

  function toggleTenant(groupId: string, tenantId: string) {
    setTenantDrafts((current) => {
      const list = current[groupId] || [];
      return { ...current, [groupId]: list.includes(tenantId) ? list.filter((id) => id !== tenantId) : [...list, tenantId] };
    });
  }

  async function saveTenants(groupId: string) {
    setSavingGroup(groupId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/business-groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantIds: tenantDrafts[groupId] || [] }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao salvar empresas do grupo.');
      setSuccess('Empresas vinculadas ao grupo com sucesso.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Falha ao salvar empresas do grupo.');
    } finally {
      setSavingGroup(null);
    }
  }

  async function saveMember(groupId: string) {
    const email = (memberEmail[groupId] || '').trim();
    if (!email) return;
    setSavingGroup(groupId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/business-groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member: { email, role: memberRole[groupId] || 'owner', status: 'active' } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao adicionar responsável.');
      setMemberEmail((current) => ({ ...current, [groupId]: '' }));
      setSuccess('Responsável vinculado ao grupo com sucesso.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Falha ao adicionar responsável.');
    } finally {
      setSavingGroup(null);
    }
  }

  async function deleteGroup(group: Group) {
    const confirmed = window.confirm(
      `Excluir definitivamente o grupo empresarial "${group.name}"?\n\n` +
      `Serão removidos apenas os vínculos do grupo com ${group.tenants.length} empresa(s) e ${group.members.length} responsável(is). ` +
      'As empresas, usuários, leads, formulários, pipelines, integrações, credenciais e demais dados NÃO serão apagados.',
    );
    if (!confirmed) return;

    setDeletingGroup(group.id);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/business-groups/${group.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao excluir grupo empresarial.');
      setSuccess(`Grupo "${group.name}" excluído. As empresas e seus dados foram preservados.`);
      await load();
    } catch (e: any) {
      setError(e.message || 'Falha ao excluir grupo empresarial.');
    } finally {
      setDeletingGroup(null);
    }
  }

  const groups = snapshot?.groups || [];
  const availableTenants = snapshot?.availableTenants || [];
  const statusCount = useMemo(() => availableTenants.filter((tenant) => tenant.status === 'active').length, [availableTenants]);

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2"><Building2 className="w-6 h-6" /><h1 className="text-2xl font-semibold">Grupos empresariais</h1></div>
          <p className="text-sm text-muted-foreground mt-1">Consolide empresas independentes sem mover leads, formulários ou integrações entre tenants.</p>
        </div>
        <Button variant="outline" onClick={load} disabled={loading}><RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button>
      </div>

      {error && <Card className="p-4 border-rose-200 bg-rose-50 text-rose-800 text-sm">{error}</Card>}
      {success && <Card className="p-4 border-emerald-200 bg-emerald-50 text-emerald-800 text-sm">{success}</Card>}

      {!loading && snapshot && !snapshot.schemaReady && (
        <Card className="p-5 border-amber-200 bg-amber-50">
          <div className="font-medium text-amber-900">Estrutura de grupos ainda não instalada</div>
          <p className="text-sm text-amber-800 mt-1">No GitHub Actions, execute manualmente <strong>Repair Business Group Schema</strong>. O workflow é aditivo e não executa prisma migrate deploy.</p>
        </Card>
      )}

      <Card className="p-5 space-y-3">
        <div>
          <h2 className="font-medium">Criar grupo</h2>
          <p className="text-xs text-muted-foreground">Exemplo: Belo Norte. Depois você seleciona Parnaíba, Imperatriz e São Luís.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do grupo empresarial" disabled={!snapshot?.schemaReady || creating} />
          <Button onClick={createGroup} disabled={!snapshot?.schemaReady || creating || newName.trim().length < 2}>
            {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}Criar grupo
          </Button>
        </div>
        <div className="text-xs text-muted-foreground">{availableTenants.length} tenant(s) disponível(is), {statusCount} ativo(s).</div>
      </Card>

      {loading ? (
        <div className="py-12 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 mr-2 animate-spin" />Carregando...</div>
      ) : groups.length === 0 ? (
        snapshot?.schemaReady ? <Card className="p-8 text-center text-sm text-muted-foreground">Nenhum grupo empresarial criado ainda.</Card> : null
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.id} className="p-5 space-y-5">
              <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                <div><h2 className="font-heading font-semibold text-lg">{group.name}</h2><div className="text-xs text-muted-foreground">{group.slug}</div></div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{group.status}</Badge>
                  <Button size="sm" variant="outline" className="text-rose-700 hover:text-rose-800" onClick={() => deleteGroup(group)} disabled={deletingGroup === group.id || savingGroup === group.id}>
                    <Trash2 className="w-4 h-4 mr-1" />{deletingGroup === group.id ? 'Excluindo...' : 'Excluir grupo'}
                  </Button>
                </div>
              </div>

              <div className="space-y-3">
                <div><div className="font-medium text-sm">Empresas do grupo</div><div className="text-xs text-muted-foreground">Marque somente os tenants que pertencem a este grupo.</div></div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                  {availableTenants.map((tenant) => {
                    const checked = (tenantDrafts[group.id] || []).includes(tenant.id);
                    return (
                      <label key={tenant.id} className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
                        <input type="checkbox" checked={checked} onChange={() => toggleTenant(group.id, tenant.id)} className="mt-1" />
                        <div className="min-w-0"><div className="text-sm font-medium truncate">{tenant.name}</div><div className="text-xs text-muted-foreground truncate">{tenant.slug} · {tenant.status}</div></div>
                      </label>
                    );
                  })}
                </div>
                <Button size="sm" variant="outline" onClick={() => saveTenants(group.id)} disabled={savingGroup === group.id || deletingGroup === group.id}><Save className="w-4 h-4 mr-2" />Salvar empresas</Button>
              </div>

              <div className="border-t pt-5 space-y-3">
                <div><div className="font-medium text-sm">Responsáveis pelo grupo</div><div className="text-xs text-muted-foreground">O e-mail precisa já existir como usuário no FlipForm. Nenhuma senha é alterada.</div></div>
                <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_auto] gap-2">
                  <Input value={memberEmail[group.id] || ''} onChange={(e) => setMemberEmail((current) => ({ ...current, [group.id]: e.target.value }))} placeholder="responsavel@empresa.com" />
                  <select className="h-9 rounded-md border bg-background px-3 text-sm" value={memberRole[group.id] || 'owner'} onChange={(e) => setMemberRole((current) => ({ ...current, [group.id]: e.target.value }))}>
                    {GROUP_ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                  <Button onClick={() => saveMember(group.id)} disabled={savingGroup === group.id || deletingGroup === group.id || !(memberEmail[group.id] || '').trim()}><UserPlus className="w-4 h-4 mr-2" />Adicionar</Button>
                </div>
                {group.members.length > 0 && (
                  <div className="divide-y rounded-md border">
                    {group.members.map((member) => (
                      <div key={member.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                        <div className="min-w-0"><div className="font-medium truncate">{member.name}</div><div className="text-xs text-muted-foreground truncate">{member.email}</div></div>
                        <div className="flex items-center gap-2"><Badge variant="outline">{member.role}</Badge><Badge variant={member.status === 'active' ? 'secondary' : 'outline'}>{member.status}</Badge></div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

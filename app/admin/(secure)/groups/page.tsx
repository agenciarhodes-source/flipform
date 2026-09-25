'use client';

import { useEffect, useState } from 'react';
import { Building2, Loader2, Plus, RefreshCcw, Save, Settings2, Trash2, UserPlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

const GROUP_ROLES = ['owner', 'admin', 'viewer'] as const;
const GROUP_ROLE_LABELS: Record<string, string> = {
  owner: 'Dono do grupo',
  admin: 'Gestor do grupo',
  viewer: 'Visualizador do grupo',
};

type Tenant = { id: string; name: string; slug: string; status: string };
type Member = { id: string; userId: string; name: string; email: string; role: string; status: string };
type AccessAccount = { userId: string; name: string; email: string };
type Group = { id: string; name: string; slug: string; status: string; tenants: Tenant[]; members: Member[] };
type Snapshot = { schemaReady: boolean; groups: Group[]; availableTenants: Tenant[]; availableAccesses: AccessAccount[] };

export default function BusinessGroupsAdminPage() {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [managingGroupId, setManagingGroupId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tenantDrafts, setTenantDrafts] = useState<Record<string, string[]>>({});
  const [tenantQuery, setTenantQuery] = useState<Record<string, string>>({});
  const [memberUserId, setMemberUserId] = useState<Record<string, string>>({});
  const [memberRole, setMemberRole] = useState<Record<string, string>>({});
  const [memberEditRole, setMemberEditRole] = useState<Record<string, string>>({});
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
      const editRoles: Record<string, string> = {};
      for (const group of data.groups || []) {
        drafts[group.id] = group.tenants.map((tenant: Tenant) => tenant.id);
        roles[group.id] = 'admin';
        for (const member of group.members || []) editRoles[member.id] = member.role;
      }
      setTenantDrafts(drafts);
      setMemberRole(roles);
      setMemberEditRole(editRoles);
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
      const createdGroupId = data.group?.id || null;
      setNewName('');
      setShowCreate(false);
      if (createdGroupId) setManagingGroupId(createdGroupId);
      setSuccess('Grupo criado. Agora selecione as empresas e o acesso responsável.');
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
    const userId = memberUserId[groupId] || '';
    if (!userId) return;
    setSavingGroup(groupId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/business-groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ member: { userId, role: memberRole[groupId] || 'admin', status: 'active' } }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao adicionar responsável.');
      setMemberUserId((current) => ({ ...current, [groupId]: '' }));
      setSuccess('Responsável vinculado ao grupo com sucesso.');
      await load();
    } catch (e: any) {
      setError(e.message || 'Falha ao adicionar responsável.');
    } finally {
      setSavingGroup(null);
    }
  }

  async function saveExistingMemberRole(groupId: string, member: Member) {
    const role = memberEditRole[member.id] || member.role;
    if (role === member.role) return;

    setSavingGroup(groupId);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch(`/api/admin/business-groups/${groupId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member: {
            userId: member.userId,
            role,
            status: member.status === 'revoked' ? 'revoked' : 'active',
          },
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Falha ao alterar o nível de acesso.');
      setSuccess(`Acesso de ${member.name} atualizado para ${GROUP_ROLE_LABELS[role] || role}.`);
      await load();
    } catch (e: any) {
      setError(e.message || 'Falha ao alterar o nível de acesso.');
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
      if (managingGroupId === group.id) setManagingGroupId(null);
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
  const availableAccesses = snapshot?.availableAccesses || [];

  return (
    <div className="p-6 space-y-5 max-w-6xl mx-auto">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2"><Building2 className="w-6 h-6" /><h1 className="text-2xl font-semibold">Grupos empresariais</h1></div>
          <p className="text-sm text-muted-foreground mt-1">Visualize os grupos criados e abra a configuração somente quando precisar criar ou gerenciar um grupo.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={load} disabled={loading}><RefreshCcw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Atualizar</Button>
          <Button onClick={() => { setShowCreate(true); setManagingGroupId(null); setError(null); setSuccess(null); }} disabled={!snapshot?.schemaReady}>
            <Plus className="w-4 h-4 mr-2" />Novo grupo
          </Button>
        </div>
      </div>

      {error && <Card className="p-4 border-rose-200 bg-rose-50 text-rose-800 text-sm">{error}</Card>}
      {success && <Card className="p-4 border-emerald-200 bg-emerald-50 text-emerald-800 text-sm">{success}</Card>}

      {!loading && snapshot && !snapshot.schemaReady && (
        <Card className="p-5 border-amber-200 bg-amber-50">
          <div className="font-medium text-amber-900">Estrutura de grupos ainda não instalada</div>
          <p className="text-sm text-amber-800 mt-1">No GitHub Actions, execute manualmente <strong>Repair Business Group Schema</strong>. O workflow é aditivo e não executa prisma migrate deploy.</p>
        </Card>
      )}

      {showCreate && (
        <Card className="p-5 space-y-4 border-brand-200">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-medium">Criar novo grupo empresarial</h2>
              <p className="text-xs text-muted-foreground mt-1">Crie o grupo primeiro. Em seguida, ele ficará visível na lista e a configuração de empresas e responsável será aberta.</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setNewName(''); }}><X className="w-4 h-4 mr-1" />Fechar</Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Nome do grupo empresarial" disabled={creating} />
            <Button onClick={createGroup} disabled={creating || newName.trim().length < 2}>
              {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}Criar grupo
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">Na próxima etapa estarão disponíveis {availableTenants.length} empresa(s) e {availableAccesses.length} acesso(s) cadastrado(s).</div>
        </Card>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">Grupos criados</h2>
          <p className="text-xs text-muted-foreground">{groups.length} grupo(s) empresarial(is)</p>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex justify-center text-muted-foreground"><Loader2 className="w-5 h-5 mr-2 animate-spin" />Carregando...</div>
      ) : groups.length === 0 ? (
        snapshot?.schemaReady ? (
          <Card className="p-8 text-center space-y-3">
            <div className="text-sm text-muted-foreground">Nenhum grupo empresarial criado ainda.</div>
            <Button size="sm" onClick={() => setShowCreate(true)}><Plus className="w-4 h-4 mr-2" />Criar primeiro grupo</Button>
          </Card>
        ) : null
      ) : (
        <div className="space-y-3">
          {groups.map((group) => {
            const isManaging = managingGroupId === group.id;
            const query = (tenantQuery[group.id] || '').trim().toLowerCase();
            const filteredTenants = query
              ? availableTenants.filter((tenant) => `${tenant.name} ${tenant.slug}`.toLowerCase().includes(query))
              : availableTenants;
            const tenantPreview = group.tenants.slice(0, 3).map((tenant) => tenant.name).join(' • ');

            return (
              <Card key={group.id} className="overflow-hidden">
                <div className="p-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-heading font-semibold text-lg truncate">{group.name}</h3>
                      <Badge variant="outline">{group.status}</Badge>
                      <Badge variant="secondary">{group.tenants.length} empresa(s)</Badge>
                      <Badge variant="secondary">{group.members.length} responsável(is)</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {group.tenants.length > 0 ? `${tenantPreview}${group.tenants.length > 3 ? ` • +${group.tenants.length - 3}` : ''}` : 'Nenhuma empresa vinculada'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant={isManaging ? 'secondary' : 'outline'}
                      onClick={() => setManagingGroupId(isManaging ? null : group.id)}
                      disabled={deletingGroup === group.id}
                    >
                      {isManaging ? <X className="w-4 h-4 mr-1" /> : <Settings2 className="w-4 h-4 mr-1" />}
                      {isManaging ? 'Fechar' : 'Gerenciar'}
                    </Button>
                    <Button size="sm" variant="outline" className="text-rose-700 hover:text-rose-800" onClick={() => deleteGroup(group)} disabled={deletingGroup === group.id || savingGroup === group.id}>
                      <Trash2 className="w-4 h-4 mr-1" />{deletingGroup === group.id ? 'Excluindo...' : 'Excluir'}
                    </Button>
                  </div>
                </div>

                {isManaging && (
                  <div className="border-t bg-muted/10 p-5 space-y-6">
                    <div className="space-y-3">
                      <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                        <div>
                          <div className="font-medium text-sm">Empresas do grupo</div>
                          <div className="text-xs text-muted-foreground">Marque somente as empresas que pertencem a este grupo. A lista fica oculta quando você fecha o gerenciamento.</div>
                        </div>
                        <div className="text-xs text-muted-foreground">{(tenantDrafts[group.id] || []).length} selecionada(s)</div>
                      </div>

                      <Input
                        value={tenantQuery[group.id] || ''}
                        onChange={(e) => setTenantQuery((current) => ({ ...current, [group.id]: e.target.value }))}
                        placeholder="Buscar empresa por nome ou slug"
                        className="max-w-md"
                      />

                      <div className="max-h-[340px] overflow-y-auto rounded-md border bg-background p-2">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2">
                          {filteredTenants.map((tenant) => {
                            const checked = (tenantDrafts[group.id] || []).includes(tenant.id);
                            return (
                              <label key={tenant.id} className="flex items-start gap-2 rounded-md border p-3 cursor-pointer hover:bg-muted/30">
                                <input type="checkbox" checked={checked} onChange={() => toggleTenant(group.id, tenant.id)} className="mt-1" />
                                <div className="min-w-0"><div className="text-sm font-medium truncate">{tenant.name}</div><div className="text-xs text-muted-foreground truncate">{tenant.slug} · {tenant.status}</div></div>
                              </label>
                            );
                          })}
                        </div>
                        {filteredTenants.length === 0 && <div className="p-6 text-center text-sm text-muted-foreground">Nenhuma empresa encontrada.</div>}
                      </div>

                      <Button size="sm" variant="outline" onClick={() => saveTenants(group.id)} disabled={savingGroup === group.id || deletingGroup === group.id}><Save className="w-4 h-4 mr-2" />Salvar empresas</Button>
                    </div>

                    <div className="border-t pt-5 space-y-3">
                      <div>
                        <div className="font-medium text-sm">Administrador / responsável do grupo</div>
                        <div className="text-xs text-muted-foreground">Os acessos cadastrados só aparecem enquanto este grupo está sendo gerenciado.</div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-2">
                        <select
                          className="h-9 rounded-md border bg-background px-3 text-sm"
                          value={memberUserId[group.id] || ''}
                          onChange={(e) => setMemberUserId((current) => ({ ...current, [group.id]: e.target.value }))}
                        >
                          <option value="">Selecione um acesso cadastrado</option>
                          {availableAccesses.map((access) => (
                            <option key={access.userId} value={access.userId}>{access.name} — {access.email}</option>
                          ))}
                        </select>
                        <select className="h-9 rounded-md border bg-background px-3 text-sm" value={memberRole[group.id] || 'admin'} onChange={(e) => setMemberRole((current) => ({ ...current, [group.id]: e.target.value }))}>
                          {GROUP_ROLES.map((role) => <option key={role} value={role}>{GROUP_ROLE_LABELS[role]}</option>)}
                        </select>
                        <Button onClick={() => saveMember(group.id)} disabled={savingGroup === group.id || deletingGroup === group.id || !(memberUserId[group.id] || '')}><UserPlus className="w-4 h-4 mr-2" />Vincular acesso</Button>
                      </div>
                      {availableAccesses.length === 0 && <div className="text-xs text-amber-700">Nenhum acesso cadastrado. Crie primeiro em Acessos da plataforma.</div>}
                      {group.members.length > 0 && (
                        <div className="divide-y rounded-md border bg-background">
                          {group.members.map((member) => (
                            <div key={member.id} className="p-3 flex flex-col gap-3 text-sm md:flex-row md:items-center md:justify-between">
                              <div className="min-w-0">
                                <div className="font-medium truncate">{member.name}</div>
                                <div className="text-xs text-muted-foreground truncate">{member.email}</div>
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                <select
                                  className="h-9 min-w-[190px] rounded-md border bg-background px-3 text-sm"
                                  value={memberEditRole[member.id] || member.role}
                                  onChange={(e) => setMemberEditRole((current) => ({ ...current, [member.id]: e.target.value }))}
                                  disabled={savingGroup === group.id || deletingGroup === group.id}
                                  aria-label={`Nível de acesso de ${member.name}`}
                                >
                                  {GROUP_ROLES.map((role) => <option key={role} value={role}>{GROUP_ROLE_LABELS[role]}</option>)}
                                </select>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => saveExistingMemberRole(group.id, member)}
                                  disabled={savingGroup === group.id || deletingGroup === group.id || (memberEditRole[member.id] || member.role) === member.role}
                                >
                                  <Save className="w-3.5 h-3.5 mr-1" />Salvar nível
                                </Button>
                                <Badge variant={member.status === 'active' ? 'secondary' : 'outline'}>{member.status}</Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

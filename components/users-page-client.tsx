'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { UserPlus, MoreHorizontal, Copy, Trash2, Mail, Shield, ShieldCheck, Eye, User as UserIcon, UserCog } from 'lucide-react';
import { formatDate, formatDateTime } from '@/lib/utils';
import { can, canManageRole, ROLE_DESCRIPTIONS_PT_BR, ROLE_LABELS_PT_BR, ROLE_SHORT_DESCRIPTIONS_PT_BR, type RoleName } from '@/lib/rbac';
import type { SessionPayload } from '@/lib/auth';

type Role = RoleName;

const ROLE_META: Record<Role, { label: string; color: string; icon: any; desc: string }> = {
  owner: { label: ROLE_LABELS_PT_BR.owner, color: 'bg-purple-100 text-purple-700 border-purple-200', icon: ShieldCheck, desc: ROLE_DESCRIPTIONS_PT_BR.owner },
  admin: { label: ROLE_LABELS_PT_BR.admin, color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Shield, desc: ROLE_DESCRIPTIONS_PT_BR.admin },
  manager: { label: ROLE_LABELS_PT_BR.manager, color: 'bg-amber-100 text-amber-700 border-amber-200', icon: UserCog, desc: ROLE_DESCRIPTIONS_PT_BR.manager },
  agent: { label: ROLE_LABELS_PT_BR.agent, color: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: UserIcon, desc: ROLE_DESCRIPTIONS_PT_BR.agent },
  viewer: { label: ROLE_LABELS_PT_BR.viewer, color: 'bg-slate-100 text-slate-600 border-slate-200', icon: Eye, desc: ROLE_DESCRIPTIONS_PT_BR.viewer },
};

export function UsersPageClient({ session }: { session: SessionPayload }) {
  const [users, setUsers] = useState<any[]>([]);
  const [invites, setInvites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [origin, setOrigin] = useState('');

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const canCreateDirect = can(session.role, 'USERS_CREATE_DIRECT');
  const canInvite = can(session.role, 'USERS_INVITE');
  const canEdit = can(session.role, 'USERS_EDIT');

  const load = async () => {
    setLoading(true);
    const [u, i] = await Promise.all([
      fetch('/api/users').then((r) => r.json()),
      fetch('/api/invites').then((r) => r.json()).catch(() => ({ invites: [] })),
    ]);
    setUsers(u.users || []);
    setInvites(i.invites || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl lg:text-3xl font-bold">Usuários &amp; Permissões</h1>
          <p className="text-muted-foreground text-sm">Gerencie a equipe que tem acesso a esta empresa.</p>
        </div>
        <div className="flex gap-2">
          {canInvite && <Button variant="outline" onClick={() => setInviteOpen(true)}><Mail className="w-4 h-4 mr-2" />Enviar convite por link</Button>}
          {canCreateDirect && <Button onClick={() => setCreateOpen(true)}><UserPlus className="w-4 h-4 mr-2" />Adicionar usuário</Button>}
        </div>
      </div>

      <Tabs defaultValue="members">
        <TabsList>
          <TabsTrigger value="members">Membros ({users.length})</TabsTrigger>
          <TabsTrigger value="invites">Convites pendentes ({invites.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Usuário</th>
                  <th className="text-left px-4 py-3 font-medium">Papel</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Acesso autorizado</th>
                  <th className="text-left px-4 py-3 font-medium">Adicionado em</th>
                  <th className="text-right px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {loading ? <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Carregando...</td></tr> :
                  users.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum membro ainda.</td></tr> :
                  users.map((u) => {
                    const meta = ROLE_META[u.role as Role];
                    const Icon = meta?.icon || UserIcon;
                    const isYou = u.userId === session.userId;
                    return (
                      <tr key={u.tenantUserId} className="border-t">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="w-8 h-8"><AvatarFallback className="bg-brand-100 text-brand-700 text-xs">{u.name.split(' ').map((s: string) => s[0]).slice(0, 2).join('')}</AvatarFallback></Avatar>
                            <div>
                              <div className="font-medium">{u.name} {isYou && <span className="text-xs text-muted-foreground">(você)</span>}</div>
                              <div className="text-xs text-muted-foreground">{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`${meta?.color || ''} gap-1`}><Icon className="w-3 h-3" />{meta?.label || u.role}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          {u.status === 'active' ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Ativo</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-slate-100 text-slate-600">Inativo</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {u.accessStatus === 'authorized' ? (
                            <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Liberado</Badge>
                          ) : u.accessStatus === 'blocked' ? (
                            <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">Bloqueado</Badge>
                          ) : (
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Pendente</Badge>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3 text-right">
                          {canEdit && !isYou && u.role !== 'owner' && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEditUser(u)}><UserCog className="w-3.5 h-3.5 mr-2" />Editar papel/status</DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem className="text-destructive" onClick={async () => {
                                  if (!confirm(`Remover ${u.name}?`)) return;
                                  const res = await fetch(`/api/users/${u.tenantUserId}`, { method: 'DELETE' });
                                  const data = await res.json();
                                  if (res.ok) { toast.success('Usuário removido'); load(); } else toast.error(data.error);
                                }}><Trash2 className="w-3.5 h-3.5 mr-2" />Remover</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="invites" className="mt-4">
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">E-mail</th>
                  <th className="text-left px-4 py-3 font-medium">Papel</th>
                  <th className="text-left px-4 py-3 font-medium">Convidado por</th>
                  <th className="text-left px-4 py-3 font-medium">Expira em</th>
                  <th className="text-right px-4 py-3 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {invites.length === 0 ? <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Nenhum convite pendente.</td></tr> :
                  invites.map((i) => (
                    <tr key={i.id} className="border-t">
                      <td className="px-4 py-3 font-medium">{i.email}</td>
                      <td className="px-4 py-3"><Badge variant="outline" className={ROLE_META[i.role as Role]?.color}>{ROLE_META[i.role as Role]?.label || i.role}</Badge></td>
                      <td className="px-4 py-3 text-muted-foreground">{i.inviter?.name || '—'}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{formatDateTime(i.expiresAt)}</td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => {
                            navigator.clipboard.writeText(`${origin}/invite/${i.token}`);
                            toast.success('Link de convite copiado!');
                          }}><Copy className="w-3 h-3 mr-1" />Link</Button>
                          <Button size="sm" variant="outline" onClick={async () => {
                            if (!confirm('Revogar este convite?')) return;
                            const res = await fetch(`/api/invites/${i.id}`, { method: 'DELETE' });
                            if (res.ok) { toast.success('Convite revogado'); load(); }
                          }}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Cards explicativos dos roles */}
      <Card className="p-5">
        <h3 className="font-heading font-semibold mb-3">Resumo de permissões</h3>
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          {(Object.keys(ROLE_META) as Role[]).map((r) => {
            const m = ROLE_META[r];
            const Icon = m.icon;
            return (
              <div key={r} className="border rounded-md p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="w-4 h-4" />
                  <span className="font-semibold text-sm">{m.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{m.desc}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {createOpen && (
        <CreateUserDialog
          actorRole={session.role as Role}
          onClose={() => setCreateOpen(false)}
          onCreated={(message) => { setCreateOpen(false); toast.success(message || 'Usuário criado e liberado para acesso.'); load(); }}
        />
      )}
      {inviteOpen && (
        <InviteDialog
          actorRole={session.role as Role}
          onClose={() => setInviteOpen(false)}
          onSent={(token) => {
            const url = `${origin}/invite/${token}`;
            navigator.clipboard.writeText(url);
            toast.success('Convite criado! Link copiado para clipboard.');
            load();
          }}
        />
      )}
      {editUser && (
        <EditUserDialog
          user={editUser}
          actorRole={session.role as Role}
          onClose={() => setEditUser(null)}
          onSaved={() => { setEditUser(null); load(); }}
        />
      )}
    </div>
  );
}


function CreateUserDialog({ onClose, onCreated, actorRole }: { onClose: () => void; onCreated: (message?: string) => void; actorRole: Role }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [status] = useState<'active'>('active');
  const [loading, setLoading] = useState(false);

  const create = async () => {
    if (password !== confirmPassword) { toast.error('As senhas não conferem.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, password, role, status }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao criar usuário');
      setPassword('');
      setConfirmPassword('');
      onCreated(data.message);
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  const roles = (['admin', 'manager', 'agent', 'viewer'] as Role[]).filter((r) => canManageRole(actorRole, r));

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-heading">Adicionar usuário</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Erica" /></div>
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="erica@empresa.com" /></div>
          <div className="grid grid-cols-2 gap-3"><div><Label>Senha</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="mínimo 6 caracteres" /></div><div><Label>Confirmar senha</Label><Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></div></div>
          <div><Label>Papel</Label><Select value={role} onValueChange={(v) => setRole(v as Role)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{roles.map((r) => <SelectItem key={r} value={r}>{ROLE_LABELS_PT_BR[r]} — {ROLE_SHORT_DESCRIPTIONS_PT_BR[r]}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Status</Label><Input value={status === 'active' ? 'Ativo' : status} disabled /></div>
          <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">O usuário será criado ativo, vinculado a esta empresa e poderá entrar com a senha definida. Nenhum convite será enviado.</div>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={create} disabled={!name || !email || !password || loading}>{loading ? 'Criando...' : 'Adicionar usuário'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InviteDialog({ onClose, onSent, actorRole }: { onClose: () => void; onSent: (token: string) => void; actorRole: Role }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('agent');
  const [loading, setLoading] = useState(false);

  const send = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSent(data.invite.token);
      onClose();
    } catch (e: any) { toast.error(e.message); } finally { setLoading(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-heading">Convidar usuário</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@empresa.com" /></div>
          <div>
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['owner', 'admin', 'manager', 'agent', 'viewer'] as Role[]).filter((r) => canManageRole(actorRole, r)).map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS_PT_BR[r]} — {ROLE_SHORT_DESCRIPTIONS_PT_BR[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="bg-muted/50 rounded-md p-3 text-xs text-muted-foreground flex items-start gap-2">
            <Mail className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>O envio de e-mail ainda é mockado. Após criar o convite, o link será copiado para o clipboard para você compartilhar manualmente.</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={send} disabled={!email || loading}>{loading ? 'Enviando...' : 'Convidar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditUserDialog({ user, actorRole, onClose, onSaved }: { user: any; actorRole: Role; onClose: () => void; onSaved: () => void }) {
  const [role, setRole] = useState<Role>(user.role);
  const [status, setStatus] = useState<'active' | 'inactive'>(user.status);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/users/${user.tenantUserId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, status }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success('Usuário atualizado');
      onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-heading">Editar {user.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Papel</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['owner', 'admin', 'manager', 'agent', 'viewer'] as Role[]).filter((r) => canManageRole(actorRole, r)).map((r) => (
                  <SelectItem key={r} value={r}>{ROLE_LABELS_PT_BR[r]} — {ROLE_SHORT_DESCRIPTIONS_PT_BR[r]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativo</SelectItem>
                <SelectItem value="inactive">Inativo — bloqueia login</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={save} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

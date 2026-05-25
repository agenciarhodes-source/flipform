'use client';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { safeJson } from '@/lib/http/safe-json';

type TenantOption = { id: string; name: string; slug: string };
type Row = { id: string; email: string; role: string; status: string; active: boolean; acceptedAt: string | null; createdAt: string; updatedAt: string; tenant: { id: string; name: string; slug: string; status?: string; plan?: { name: string } | null; subscriptions?: Array<{ status: string }>; } | null; };

async function readJsonSafe(res: Response) {
  return (await safeJson<any>(res)) ?? {};
}

export default function AdminAccessPage() {
  const [items, setItems] = useState<Row[]>([]);
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [q, setQ] = useState(''); const [tenantId, setTenantId] = useState('all'); const [status, setStatus] = useState('all'); const [active, setActive] = useState('all');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [newTenant, setNewTenant] = useState('auto'); const [directPlanSlug, setDirectPlanSlug] = useState('growth'); const [role, setRole] = useState('owner'); const [newStatus, setNewStatus] = useState('active'); const [newActive, setNewActive] = useState(true);
  const [courtesyName, setCourtesyName] = useState('');
  const [courtesySlug, setCourtesySlug] = useState('');
  const [courtesyOwnerEmail, setCourtesyOwnerEmail] = useState('');
  const [courtesyOwnerName, setCourtesyOwnerName] = useState('');
  const [courtesyPlanSlug, setCourtesyPlanSlug] = useState('growth');

  const query = useMemo(() => { const p = new URLSearchParams(); if (q.trim()) p.set('q', q.trim()); if (tenantId !== 'all') p.set('tenantId', tenantId); if (status !== 'all') p.set('status', status); if (active !== 'all') p.set('active', active); return p.toString(); }, [q, tenantId, status, active]);

  async function load() { setLoading(true); setError(null); try { const res = await fetch(`/api/admin/allowed-users${query ? `?${query}` : ''}`, { cache: 'no-store' }); const data = await readJsonSafe(res); if (!res.ok) throw new Error((data as any)?.error || 'Falha ao carregar acessos'); const payload = (data as any).data || data; setItems(Array.isArray(payload.items) ? payload.items : []); setTenants(Array.isArray(payload.tenants) ? payload.tenants : []); } catch (e: any) { setError(e?.message || 'Falha ao carregar acessos'); setItems([]); setTenants([]); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [query]);
  useEffect(() => {
    
  }, [tenants]);

  async function createAccess() {
    setError(null); setSuccess(null);
    const payload: any = { email, password, planSlug: directPlanSlug, role, status: newStatus, active: newActive, mode: 'direct' };
    if (newTenant && newTenant !== 'auto') payload.tenantId = newTenant;
    const res = await fetch('/api/admin/allowed-users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await readJsonSafe(res);
    if (!res.ok) return setError((data as any)?.error || (data as any)?.message || 'Falha ao criar acesso');
    setSuccess('Acesso criado com sucesso. O usuário já pode entrar com e-mail e senha.');
    setEmail('');
    setPassword('');
    setRole('owner');
    setNewStatus('active');
    setNewActive(true);
    setNewTenant('auto');
    load();
  }

  async function createCourtesyTenant() {
    setError(null); setSuccess(null);
    const res = await fetch('/api/admin/tenants/courtesy', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: courtesyName, slug: courtesySlug, ownerEmail: courtesyOwnerEmail, ownerName: courtesyOwnerName, planSlug: courtesyPlanSlug }) });
    const data = await readJsonSafe(res);
    if (!res.ok) return setError((data as any)?.error || (data as any)?.message || 'Falha ao criar tenant de cortesia');
    const payload = (data as any).data || data;
    const createdTenantId = payload?.tenant?.id || '';
    setSuccess('Tenant de cortesia criado com sucesso.');
    setCourtesyName(''); setCourtesySlug(''); setCourtesyOwnerEmail(''); setCourtesyOwnerName(''); setCourtesyPlanSlug('growth');
    await load();
    if (createdTenantId) setNewTenant(createdTenantId);
  }

  async function patchAccess(id: string, payload: { status?: string; active?: boolean }) { setError(null); setSuccess(null); const res = await fetch(`/api/admin/allowed-users/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await readJsonSafe(res); if (!res.ok) return setError((data as any)?.error || (data as any)?.message || 'Falha ao atualizar acesso'); setSuccess('Acesso atualizado.'); load(); }

  return (<div className="p-8 space-y-5"><div><h1 className="font-heading text-2xl font-bold">Acessos da plataforma</h1><p className="text-sm text-muted-foreground">Gerencie os e-mails autorizados a acessar cada tenant.</p></div>{error && <Card className="p-4 text-sm text-rose-700 bg-rose-50 border-rose-200">{error}</Card>}{success && <Card className="p-4 text-sm text-emerald-700 bg-emerald-50 border-emerald-200">{success}</Card>}<Card className="p-4 space-y-3"><div className="font-medium">Criar tenant de cortesia</div><div className="grid md:grid-cols-5 gap-2"><Input placeholder="Nome do tenant" value={courtesyName} onChange={(e) => setCourtesyName(e.target.value)} /><Input placeholder="slug-do-tenant" value={courtesySlug} onChange={(e) => setCourtesySlug(e.target.value)} /><Input placeholder="owner@empresa.com" value={courtesyOwnerEmail} onChange={(e) => setCourtesyOwnerEmail(e.target.value)} /><Input placeholder="Nome do owner (opcional)" value={courtesyOwnerName} onChange={(e) => setCourtesyOwnerName(e.target.value)} /><Select value={courtesyPlanSlug} onValueChange={setCourtesyPlanSlug}><SelectTrigger><SelectValue placeholder="Plano" /></SelectTrigger><SelectContent><SelectItem value="starter">Starter</SelectItem><SelectItem value="growth">Growth</SelectItem><SelectItem value="pro">Pro</SelectItem></SelectContent></Select></div><Button onClick={createCourtesyTenant}>Criar cortesia</Button></Card><Card className="p-4 space-y-3"><div className="font-medium">Adicionar acesso direto</div><p className="text-sm text-muted-foreground">Use esta opção para liberar um cliente, teste ou cortesia sem passar pelo checkout. O sistema criará automaticamente uma conta interna de cortesia.</p><p className="text-xs text-muted-foreground">Se nenhum tenant for selecionado, criaremos automaticamente uma conta interna de cortesia para este e-mail.</p><div className="grid md:grid-cols-6 gap-2"><Input placeholder="email@empresa.com" value={email} onChange={(e) => setEmail(e.target.value)} /><Input placeholder="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /><Select value={directPlanSlug} onValueChange={setDirectPlanSlug}><SelectTrigger><SelectValue placeholder="Plano" /></SelectTrigger><SelectContent><SelectItem value="starter">Starter</SelectItem><SelectItem value="growth">Growth</SelectItem><SelectItem value="pro">Pro</SelectItem></SelectContent></Select><Select value={newTenant} onValueChange={setNewTenant}><SelectTrigger><SelectValue placeholder="Tenant (opcional)" /></SelectTrigger><SelectContent><SelectItem value="auto">Criar cortesia automática</SelectItem>{tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select><Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue placeholder="Role" /></SelectTrigger><SelectContent>{['owner', 'admin', 'manager', 'agent', 'viewer'].map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select><Select value={newStatus} onValueChange={setNewStatus}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent>{['pending', 'accepted', 'active', 'blocked'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><Select value={String(newActive)} onValueChange={(v) => setNewActive(v === 'true')}><SelectTrigger><SelectValue placeholder="Ativo" /></SelectTrigger><SelectContent><SelectItem value="true">Ativo</SelectItem><SelectItem value="false">Inativo</SelectItem></SelectContent></Select></div><Button onClick={createAccess} >Criar acesso</Button></Card><Card className="p-4 space-y-3"><div className="grid md:grid-cols-4 gap-2"><Input placeholder="Buscar por e-mail" value={q} onChange={(e) => setQ(e.target.value)} /><Select value={tenantId} onValueChange={setTenantId}><SelectTrigger><SelectValue placeholder="Tenant" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{tenants.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue placeholder="Status" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem>{['pending', 'accepted', 'active', 'blocked'].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><Select value={active} onValueChange={setActive}><SelectTrigger><SelectValue placeholder="Ativo" /></SelectTrigger><SelectContent><SelectItem value="all">Todos</SelectItem><SelectItem value="true">Ativo</SelectItem><SelectItem value="false">Inativo</SelectItem></SelectContent></Select></div></Card><Card className="p-0 overflow-x-auto">{loading ? <div className="p-4 text-sm text-muted-foreground">Carregando...</div> : items.length === 0 ? <div className="p-4 text-sm text-muted-foreground">Nenhum e-mail autorizado encontrado.</div> : <table className="w-full text-sm"><thead className="bg-muted/50"><tr className="text-left"><th className="p-3">E-mail</th><th className="p-3">Tenant</th><th className="p-3">Role</th><th className="p-3">Status</th><th className="p-3">Ativo</th><th className="p-3">Assinatura</th><th className="p-3">Aceito em</th><th className="p-3">Criado em</th><th className="p-3">Atualizado em</th><th className="p-3">Ações</th></tr></thead><tbody>{items.map((r) => { const subStatus = r.tenant?.subscriptions?.[0]?.status || '—'; const courtesy = subStatus === 'courtesy'; return <tr key={r.id} className="border-t align-top"><td className="p-3 font-medium">{r.email}</td><td className="p-3">{r.tenant?.name || 'Tenant removido'}<div className="text-xs text-muted-foreground">{r.tenant?.slug || '—'}</div></td><td className="p-3">{r.role}</td><td className="p-3"><Badge>{r.status}</Badge></td><td className="p-3"><Badge variant={r.active ? 'secondary' : 'outline'}>{r.active ? 'ativo' : 'inativo'}</Badge></td><td className="p-3"><Badge variant="outline">{subStatus}</Badge><div className="text-xs text-muted-foreground mt-1">{r.tenant?.plan?.name || 'Sem plano'} · tenant {r.tenant?.status || '—'} {courtesy ? '· cortesia' : ''}</div></td><td className="p-3">{r.acceptedAt ? new Date(r.acceptedAt).toLocaleString('pt-BR') : '—'}</td><td className="p-3">{new Date(r.createdAt).toLocaleString('pt-BR')}</td><td className="p-3">{new Date(r.updatedAt).toLocaleString('pt-BR')}</td><td className="p-3 space-x-1"><Button size="sm" variant="outline" onClick={() => patchAccess(r.id, { active: true })}>Ativar</Button><Button size="sm" variant="outline" onClick={() => patchAccess(r.id, { active: false })}>Desativar</Button><Button size="sm" variant="outline" onClick={() => patchAccess(r.id, { status: 'blocked' })}>Bloquear</Button><Button size="sm" variant="outline" onClick={() => patchAccess(r.id, { status: 'active' })}>Desbloquear</Button></td></tr>; })}</tbody></table>}</Card></div>);
}

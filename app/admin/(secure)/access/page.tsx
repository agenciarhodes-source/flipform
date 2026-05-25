
'use client';
import { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

export default function AdminAccessPage() {
  const [items, setItems] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [directPlanSlug, setDirectPlanSlug] = useState('growth');
  const [role, setRole] = useState('owner');
  const [newStatus, setNewStatus] = useState('active');
  const [newActive, setNewActive] = useState(true);
  const [newTenant, setNewTenant] = useState('auto');
  const [creating, setCreating] = useState(false);

  const query = useMemo(() => { const p = new URLSearchParams(); if (q.trim()) p.set('q', q.trim()); return p.toString(); }, [q]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/allowed-users${query ? `?${query}` : ''}`, { cache: 'no-store' });
      const raw = await readJsonSafe(res);
      if (!raw) throw new Error('Resposta vazia do servidor. Verifique os logs da API.');
      if (!res.ok || raw.ok === false) throw new Error(raw.error || 'Falha ao carregar acessos autorizados.');
      const payload = raw.data || raw;
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setTenants(Array.isArray(payload.tenants) ? payload.tenants : []);
      setPlans(Array.isArray(payload.plans) ? payload.plans : []);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar acessos autorizados.');
      setItems([]);
      setTenants([]);
      setPlans([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [query]);

  async function createDirectAccess() {
    setError(null); setSuccess(null);
    if (!/.+@.+\..+/.test(email)) return setError('E-mail inválido.');
    if (password.length < 8) return setError('Senha deve ter ao menos 8 caracteres.');
    setCreating(true);
    try {
      const payload: any = { email, password, planSlug: directPlanSlug, role, status: newStatus, active: newActive, mode: 'direct' };
      if (newTenant && newTenant !== 'auto') payload.tenantId = newTenant;
      const res = await fetch('/api/admin/allowed-users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const raw = await readJsonSafe(res);
      if (!raw) throw new Error('Resposta vazia do servidor. Verifique os logs da API.');
      if (!res.ok || raw.ok === false) throw new Error(raw.error || raw.message || 'Falha ao criar acesso.');
      setSuccess('Acesso criado com sucesso.');
      setEmail(''); setPassword(''); setNewTenant('auto'); setRole('owner'); setNewStatus('active'); setNewActive(true);
      await load();
    } catch (e: any) { setError(e?.message || 'Falha ao criar acesso.'); }
    finally { setCreating(false); }
  }

  return <div className="p-8 space-y-5">
    <div><h1 className="text-2xl font-bold">Acessos da plataforma</h1><p className="text-sm text-muted-foreground">Adicionar acesso direto</p></div>
    {error && <Card className="p-3 text-sm text-rose-700">{error}</Card>}
    {success && <Card className="p-3 text-sm text-emerald-700">{success}</Card>}
    <Card className="p-4 space-y-3">
      <div className="font-medium">Adicionar acesso direto</div>
      <p className="text-xs text-muted-foreground">Informe apenas e-mail, senha e plano. O sistema cria automaticamente tenant, assinatura de cortesia e acesso.</p>
      <div className="grid md:grid-cols-3 gap-2">
        <Input placeholder="email@empresa.com" value={email} onChange={(e)=>setEmail(e.target.value)} />
        <Input placeholder="Senha (mínimo 8 caracteres)" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
        <Select value={directPlanSlug} onValueChange={setDirectPlanSlug}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="starter">Starter</SelectItem><SelectItem value="growth">Growth</SelectItem><SelectItem value="pro">Pro</SelectItem></SelectContent></Select>
      </div>
      <div className="grid md:grid-cols-4 gap-2">
        <Select value={newTenant} onValueChange={setNewTenant}><SelectTrigger><SelectValue placeholder="Tenant" /></SelectTrigger><SelectContent><SelectItem value="auto">Criar cortesia automática</SelectItem>{tenants.map((t)=> <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
        <Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['owner','admin','manager','agent','viewer'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
        <Select value={newStatus} onValueChange={setNewStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['active','pending','accepted','blocked'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
        <Select value={String(newActive)} onValueChange={v=>setNewActive(v==='true')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Ativo</SelectItem><SelectItem value="false">Inativo</SelectItem></SelectContent></Select>
      </div>
      <Button onClick={createDirectAccess} disabled={creating}>{creating ? 'Criando...' : 'Criar acesso'}</Button>
    </Card>

    <Card className="p-4 space-y-2">
      <Input placeholder="Buscar por e-mail" value={q} onChange={(e)=>setQ(e.target.value)} />
      {loading ? <div className="text-sm text-muted-foreground">Carregando...</div> : <div className="text-sm">{items.length} acesso(s)</div>}
    </Card>
  </div>;
}

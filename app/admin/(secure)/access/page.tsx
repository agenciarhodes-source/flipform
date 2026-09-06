
'use client';
import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text || !text.trim()) return null;
  try { return JSON.parse(text); } catch { return null; }
}

function getAdminAccessErrorMessage(raw: any, fallback: string) {
  const code = raw?.details?.code || raw?.details?.prismaCode || raw?.code;
  const messages: Record<string, string> = {
    INVALID_EMAIL: 'E-mail inválido.',
    INVALID_PASSWORD: 'Senha deve ter ao menos 8 caracteres.',
    ACCESS_ACCOUNT_EXISTS: 'Este e-mail já possui um acesso cadastrado. Use o acesso existente ao configurar o grupo empresarial.',
    NO_ACTIVE_PLAN: 'Nenhum plano ativo encontrado.',
    DB_SCHEMA_NOT_READY: 'Banco de dados não está alinhado com o schema. Rode o diagnóstico/migration.',
    ADMIN_SCHEMA_NOT_READY: 'Banco de dados não está alinhado com o schema. Rode o diagnóstico/migration.',
    ALLOWED_USER_NOT_FOUND: 'Este acesso não existe mais.',
    P2002: 'Este e-mail já possui acesso neste tenant.',
    P2003: 'Falha de vínculo no banco. Rode o diagnóstico/migration.',
  };
  const detailMessage = raw?.details?.message && raw.details.message !== code ? ` (${raw.details.message})` : '';
  const missing = Array.isArray(raw?.details?.missing) && raw.details.missing.length
    ? ` Itens pendentes: ${raw.details.missing.slice(0, 6).join(', ')}${raw.details.missing.length > 6 ? '...' : ''}.`
    : '';
  return `${messages[code] || raw?.error || fallback}${detailMessage}${missing}`;
}

export default function AdminAccessPage() {
  const [items, setItems] = useState<any[]>([]);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [tenants, setTenants] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accessMode, setAccessMode] = useState<'group_account' | 'direct'>('group_account');
  const [directPlanSlug, setDirectPlanSlug] = useState('growth');
  const [role, setRole] = useState('admin');
  const [newStatus, setNewStatus] = useState('active');
  const [newActive, setNewActive] = useState(true);
  const [newTenant, setNewTenant] = useState('auto');
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const query = useMemo(() => { const p = new URLSearchParams(); if (q.trim()) p.set('q', q.trim()); return p.toString(); }, [q]);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/allowed-users${query ? `?${query}` : ''}`, { cache: 'no-store' });
      const raw = await readJsonSafe(res);
      if (!raw) throw new Error('Resposta vazia do servidor. Verifique os logs da API.');
      if (!res.ok || raw.ok === false) throw new Error(getAdminAccessErrorMessage(raw, 'Falha ao carregar acessos autorizados.'));
      const payload = raw.data || raw;
      setItems(Array.isArray(payload.items) ? payload.items : []);
      setAccounts(Array.isArray(payload.accounts) ? payload.accounts : []);
      setTenants(Array.isArray(payload.tenants) ? payload.tenants : []);
      setPlans(Array.isArray(payload.plans) ? payload.plans : []);
    } catch (e: any) {
      setError(e?.message || 'Falha ao carregar acessos autorizados.');
      setItems([]);
      setAccounts([]);
      setTenants([]);
      setPlans([]);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [query]);

  async function createAccess() {
    setError(null); setSuccess(null);
    if (!/.+@.+\..+/.test(email)) return setError('E-mail inválido.');
    if (password.length < 8) return setError('Senha deve ter ao menos 8 caracteres.');
    setCreating(true);
    try {
      const payload: any = accessMode === 'group_account'
        ? { email, password, mode: 'group_account' }
        : { email, password, planSlug: directPlanSlug, role, status: newStatus, active: newActive, mode: 'direct' };
      if (accessMode === 'direct' && newTenant && newTenant !== 'auto') payload.tenantId = newTenant;
      const res = await fetch('/api/admin/allowed-users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const raw = await readJsonSafe(res);
      if (!raw) throw new Error('Resposta vazia do servidor. Verifique os logs da API.');
      if (!res.ok || raw.ok === false) throw new Error(getAdminAccessErrorMessage(raw, 'Falha ao criar acesso.'));
      setSuccess(accessMode === 'group_account'
        ? 'Acesso cadastrado. Agora ele já pode ser selecionado como responsável em um grupo empresarial.'
        : 'Acesso direto criado com sucesso.');
      setEmail(''); setPassword(''); setNewTenant('auto'); setRole('admin'); setNewStatus('active'); setNewActive(true);
      await load();
    } catch (e: any) { setError(e?.message || 'Falha ao criar acesso.'); }
    finally { setCreating(false); }
  }

  async function deleteAccess(item: any) {
    const tenantName = item.tenant?.name || item.tenantId || 'empresa vinculada';
    const confirmed = window.confirm(
      `Excluir definitivamente o acesso de ${item.email} em ${tenantName}?\n\n` +
      'Esta ação remove somente a autorização de acesso. O usuário, a empresa, leads, formulários, integrações e demais dados NÃO serão apagados. ' +
      'Se este for o único acesso ativo desse usuário e ele não participar de um grupo empresarial, ele deixará de conseguir entrar.',
    );
    if (!confirmed) return;

    setDeletingId(item.id);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/admin/allowed-users/${item.id}`, { method: 'DELETE' });
      const raw = await readJsonSafe(res);
      if (!raw) throw new Error('Resposta vazia do servidor. Verifique os logs da API.');
      if (!res.ok || raw.ok === false) throw new Error(getAdminAccessErrorMessage(raw, 'Falha ao excluir acesso.'));
      setSuccess('Acesso direto excluído. Usuário, empresa e dados foram preservados.');
      await load();
    } catch (e: any) {
      setError(e?.message || 'Falha ao excluir acesso.');
    } finally {
      setDeletingId(null);
    }
  }

  return <div className="p-8 space-y-5">
    <div><h1 className="text-2xl font-bold">Acessos da plataforma</h1><p className="text-sm text-muted-foreground">Cadastre primeiro a pessoa. Depois, se for um gestor de grupo, selecione esse acesso em Grupos empresariais.</p></div>
    {error && <Card className="p-3 text-sm text-rose-700">{error}</Card>}
    {success && <Card className="p-3 text-sm text-emerald-700">{success}</Card>}

    <Card className="p-4 space-y-4">
      <div>
        <div className="font-medium">Cadastrar acesso</div>
        <p className="text-xs text-muted-foreground">Para administradores de grupo, crie somente o login. Nenhuma empresa técnica é criada.</p>
      </div>

      <div className="max-w-sm">
        <Select value={accessMode} onValueChange={(value) => setAccessMode(value as 'group_account' | 'direct')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="group_account">Administrador / responsável de grupo</SelectItem>
            <SelectItem value="direct">Acesso direto a uma empresa</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid md:grid-cols-2 gap-2">
        <Input placeholder="email@empresa.com" value={email} onChange={(e)=>setEmail(e.target.value)} />
        <Input placeholder="Senha (mínimo 8 caracteres)" type="password" value={password} onChange={(e)=>setPassword(e.target.value)} />
      </div>

      {accessMode === 'group_account' ? (
        <div className="rounded-md border bg-muted/20 p-3 text-xs text-muted-foreground">
          Esse cadastro cria apenas a conta de login. Depois vá em <strong>Grupos empresariais</strong>, selecione as empresas do grupo e escolha este acesso como administrador, dono ou visualizador do grupo.
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid md:grid-cols-3 gap-2">
            <Select value={newTenant} onValueChange={setNewTenant}><SelectTrigger><SelectValue placeholder="Empresa" /></SelectTrigger><SelectContent><SelectItem value="auto">Criar cortesia automática</SelectItem>{tenants.map((t)=> <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent></Select>
            <Select value={role} onValueChange={setRole}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['owner','admin','manager','agent','viewer'].map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent></Select>
            <Select value={directPlanSlug} onValueChange={setDirectPlanSlug}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{plans.map((plan) => <SelectItem key={plan.id} value={plan.slug}>{plan.name}</SelectItem>)}</SelectContent></Select>
          </div>
          <div className="grid md:grid-cols-2 gap-2">
            <Select value={newStatus} onValueChange={setNewStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['active','pending','accepted','blocked'].map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
            <Select value={String(newActive)} onValueChange={v=>setNewActive(v==='true')}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="true">Ativo</SelectItem><SelectItem value="false">Inativo</SelectItem></SelectContent></Select>
          </div>
        </div>
      )}

      <Button onClick={createAccess} disabled={creating}>{creating ? 'Criando...' : 'Criar acesso'}</Button>
    </Card>

    <Card className="p-4 space-y-3">
      <div>
        <div className="font-medium">Contas cadastradas</div>
        <p className="text-xs text-muted-foreground">Estes acessos podem ser selecionados como responsáveis nos grupos empresariais.</p>
      </div>
      <Input placeholder="Buscar por nome ou e-mail" value={q} onChange={(e)=>setQ(e.target.value)} />
      {loading ? <div className="text-sm text-muted-foreground">Carregando...</div> : error ? <div className="text-sm text-rose-700">Não foi possível carregar a lista.</div> : <div className="text-sm">{accounts.length} conta(s)</div>}
      {!loading && !error && accounts.length > 0 && <div className="divide-y rounded-md border">{accounts.map((account) => <div key={account.id} className="flex items-center justify-between gap-3 p-3 text-sm"><div className="min-w-0"><div className="font-medium truncate">{account.name}</div><div className="text-xs text-muted-foreground truncate">{account.email}</div></div><div className="text-xs text-muted-foreground">{account.directAccessCount > 0 ? `${account.directAccessCount} acesso(s) direto(s)` : 'Disponível para grupo'}</div></div>)}</div>}
    </Card>

    <Card className="p-4 space-y-2">
      <div><div className="font-medium">Acessos diretos por empresa</div><p className="text-xs text-muted-foreground">Use esta área somente quando o usuário precisar entrar diretamente em um tenant específico.</p></div>
      {loading ? <div className="text-sm text-muted-foreground">Carregando...</div> : error ? <div className="text-sm text-rose-700">Não foi possível carregar a lista.</div> : <div className="text-sm">{items.length} acesso(s) direto(s)</div>}
      {!loading && !error && items.length > 0 && <div className="divide-y rounded-md border">{items.map((item) => <div key={item.id} className="flex flex-col gap-2 p-3 text-sm md:flex-row md:items-center md:justify-between"><div><div className="font-medium">{item.email}</div><div className="text-xs text-muted-foreground">{item.tenant?.name || item.tenantId} · {item.role} · {item.status}</div></div><div className="flex items-center gap-3"><div className={item.active ? 'text-emerald-700' : 'text-rose-700'}>{item.active ? 'Ativo' : 'Inativo'}</div><Button size="sm" variant="outline" className="text-rose-700 hover:text-rose-800" onClick={() => deleteAccess(item)} disabled={deletingId === item.id}><Trash2 className="w-4 h-4 mr-1" />{deletingId === item.id ? 'Excluindo...' : 'Excluir'}</Button></div></div>)}</div>}
    </Card>
  </div>;
}

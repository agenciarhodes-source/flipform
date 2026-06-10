'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertCircle, CheckCircle2, RefreshCcw } from 'lucide-react';

type AllowedUserItem = {
  id: string;
  email: string;
  role: string;
  status: string;
  active: boolean;
  source: string;
  createdAt: string;
  tenant: { id: string; name: string; slug: string; status: string; plan: { name: string; slug: string } | null } | null;
  subscription: { status: string; paymentRequired: boolean } | null;
};

type Toast = { type: 'success' | 'error'; message: string };

const ROLES = ['owner', 'admin', 'manager', 'agent', 'viewer'];
const PLANS = ['starter', 'growth', 'pro'];

export default function AllowedUsersPage() {
  const [items, setItems] = useState<AllowedUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [creating, setCreating] = useState(false);

  // Form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [planSlug, setPlanSlug] = useState('growth');
  const [role, setRole] = useState('owner');

  function showToast(type: 'success' | 'error', message: string) {
    setToast({ type, message });
    setTimeout(() => setToast(null), 5000);
  }

  const load = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch('/api/admin/allowed-users');
      const text = await res.text();
      const data = text.trim() ? JSON.parse(text) : null;
      if (!data) throw new Error('Resposta vazia do servidor.');
      if (!res.ok || data.ok === false) throw new Error(data.error || 'Falha ao carregar acessos.');
      setItems(Array.isArray(data.data?.items) ? data.data.items : []);
    } catch (e: unknown) {
      setLoadError(e instanceof Error ? e.message : 'Falha ao carregar acessos.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const create = async () => {
    if (!email.trim()) { showToast('error', 'E-mail é obrigatório.'); return; }
    if (!password || password.length < 8) { showToast('error', 'Senha deve ter no mínimo 8 caracteres.'); return; }

    try {
      setCreating(true);
      const res = await fetch('/api/admin/allowed-users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, planSlug, role, status: 'active', active: true, mode: 'direct' }),
      });
      const text = await res.text();
      const data = text.trim() ? JSON.parse(text) : null;

      if (!res.ok || !data || data.ok === false) {
        const msg = data?.details?.message || data?.error || 'Falha ao criar acesso.';
        showToast('error', msg);
        return;
      }

      const userReused = Boolean(data.data?.user && data.data.user.id);
      const reusedMsg = data.data?.userReused ? ' Usuário já existia no sistema.' : '';
      showToast('success', `Acesso criado com sucesso.${reusedMsg}`);
      setEmail('');
      setPassword('');
      setPlanSlug('growth');
      setRole('owner');
      await load();
    } catch (e: unknown) {
      showToast('error', e instanceof Error ? e.message : 'Erro inesperado.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Acessos diretos</h1>
          <p className="text-sm text-muted-foreground mt-1">Crie acessos manuais sem necessidade de checkout ou convite.</p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCcw className="w-4 h-4 mr-2" />Atualizar
        </Button>
      </div>

      {/* Toast */}
      {toast && (
        <div className={`flex items-start gap-2 p-3 rounded-md text-sm border ${toast.type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-rose-50 border-rose-200 text-rose-800'}`}>
          {toast.type === 'success' ? <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Formulário de criação */}
      <Card className="p-5 space-y-4">
        <h2 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Adicionar acesso direto</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Input
            placeholder="email@empresa.com"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={creating}
          />
          <Input
            placeholder="Senha (mín. 8 caracteres)"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={creating}
          />
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={planSlug}
            onChange={(e) => setPlanSlug(e.target.value)}
            disabled={creating}
          >
            {PLANS.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={creating}
          >
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <Button onClick={create} disabled={creating || !email || !password}>
          {creating ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Criando...</> : 'Criar acesso'}
        </Button>
      </Card>

      {/* Listagem */}
      <Card className="p-0 overflow-hidden">
        {loading && (
          <div className="p-6 text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />Carregando acessos...
          </div>
        )}
        {!loading && loadError && (
          <div className="p-4 text-sm text-rose-800 bg-rose-50 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />{loadError}
          </div>
        )}
        {!loading && !loadError && items.length === 0 && (
          <div className="p-6 text-sm text-muted-foreground">Nenhum acesso cadastrado ainda.</div>
        )}
        {!loading && !loadError && items.length > 0 && (
          <div className="divide-y">
            {items.map((item) => (
              <div key={item.id} className="px-4 py-3 flex items-start justify-between gap-4 hover:bg-muted/30 transition-colors">
                <div className="min-w-0">
                  <div className="font-medium text-sm truncate">{item.email}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 space-x-2">
                    <span>tenant: {item.tenant?.name || item.tenant?.slug || '—'}</span>
                    <span>·</span>
                    <span>role: {item.role}</span>
                    <span>·</span>
                    <span>plano: {item.tenant?.plan?.name || '—'}</span>
                    {item.source === 'manual_admin_access' && <><span>·</span><span className="text-violet-600">manual</span></>}
                  </div>
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <Badge variant={item.active ? 'secondary' : 'outline'} className="text-xs">
                    {item.active ? 'ativo' : 'inativo'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';

type Tenant = { id: string; name: string; slug: string };
type Account = { id: string; name: string; email: string; mfaEnabledAt: string | null };
type Grant = { id: string; tenantId: string; userId: string; revokedAt: string | null };
type Snapshot = { tenants: Tenant[]; users: Account[]; grants: Grant[] };

export default function DeveloperAccessAdminPage() {
  const [data, setData] = useState<Snapshot | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [userId, setUserId] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/developer-access', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Acesso negado.');
    setData(result);
  }, []);
  useEffect(() => { refresh().catch(e => setMessage(e.message)); }, [refresh]);

  async function change(method: 'POST' | 'DELETE', selectedUser: string, selectedTenant: string) {
    if (!selectedUser || !selectedTenant) return;
    const label = method === 'POST' ? 'conceder' : 'revogar';
    if (!window.confirm('Confirma ' + label + ' acesso técnico à empresa selecionada?')) return;
    setLoading(true); setMessage('');
    try {
      const result = await fetch('/api/admin/developer-access', {
        method, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: selectedUser, tenantId: selectedTenant }),
      });
      const response = await result.json();
      if (!result.ok) throw new Error(response.error || 'Operação não autorizada.');
      await refresh();
      setMessage(method === 'POST' ? 'Vínculo cadastrado. O usuário deverá ativar MFA e entrar novamente antes de obter permissões técnicas.' : 'Acesso revogado. Sessões encerradas.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Erro ao atualizar.'); }
    finally { setLoading(false); }
  }

  return <main className="p-8 space-y-6 max-w-4xl">
    <div>
      <h1 className="text-2xl font-bold">Acesso de Desenvolvedor</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Concessões por empresa. Somente usuários já cadastrados. A concessão não habilita privilégios técnicos até a ativação e confirmação do MFA.
        Nunca solicite a senha do cliente.
      </p>
    </div>
    {message && <p role="status" className="rounded border p-3 text-sm">{message}</p>}
    <section className="rounded border p-5 space-y-4">
      <h2 className="font-semibold">Conceder acesso técnico</h2>
      <label className="block text-sm">Conta que receberá acesso técnico
        <select className="mt-1 block w-full rounded border p-2" value={userId} onChange={e => setUserId(e.target.value)}>
          <option value="">Selecione a conta</option>
          {data?.users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email} {u.mfaEnabledAt ? '· MFA ativo' : '· MFA pendente'}</option>)}
        </select>
      </label>
      <label className="block text-sm">Empresa autorizada
        <select className="mt-1 block w-full rounded border p-2" value={tenantId} onChange={e => setTenantId(e.target.value)}>
          <option value="">Selecione a empresa</option>
          {data?.tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
        </select>
      </label>
      <button type="button" disabled={loading || !data || !tenantId || !userId} onClick={() => change('POST', userId, tenantId)} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-40">
        Conceder acesso
      </button>
    </section>
    <section className="rounded border p-5 space-y-3">
      <h2 className="font-semibold">Concessões existentes</h2>
      {!data && <p className="text-sm">Carregando...</p>}
      {data?.grants.length === 0 && <p className="text-sm">Nenhum acesso técnico cadastrado.</p>}
      {data?.grants.map(g => {
        const tenant = data.tenants.find(t => t.id === g.tenantId);
        const user = data.users.find(u => u.id === g.userId);
        return <div key={g.id} className="flex items-center justify-between gap-4 border-b py-3 text-sm">
          <div><strong>{tenant?.name ?? 'Empresa não listada'}</strong><p>{user?.email ?? 'Conta não listada'} · {g.revokedAt ? 'Revogado' : 'Ativo'}</p></div>
          {!g.revokedAt && <button type="button" disabled={loading} className="rounded border px-3 py-2 disabled:opacity-40" onClick={() => change('DELETE', g.userId, g.tenantId)}>Revogar</button>}
        </div>;
      })}
    </section>
  </main>;
}

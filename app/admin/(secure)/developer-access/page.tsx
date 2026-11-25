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
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newTenantId, setNewTenantId] = useState('');
  const securityLink = 'https://app.flipform.com.br/account/security';
  const selectedAccount = data?.users.find(u => u.id === userId);

  async function copyMfaLink() {
    try {
      await navigator.clipboard.writeText(securityLink);
      setMessage('Link da configuração de MFA copiado. Encaminhe-o somente à pessoa responsável pela conta técnica.');
    } catch {
      setMessage('Não foi possível copiar automaticamente. Link: ' + securityLink);
    }
  }

  const refresh = useCallback(async () => {
    const response = await fetch('/api/admin/developer-access', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Acesso negado.');
    setData(result);
  }, []);
  useEffect(() => { refresh().catch(e => setMessage(e.message)); }, [refresh]);

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newName.trim() || !newEmail.trim() || newPassword.length < 12 || !newTenantId) return;
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/admin/developer-accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName, email: newEmail, password: newPassword, tenantId: newTenantId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Não foi possível cadastrar a conta.');
      setNewName('');
      setNewEmail('');
      setNewPassword('');
      await refresh();
      setUserId(result.account.id);
      setTenantId(newTenantId);
      setMessage('Desenvolvedor cadastrado e autorizado para a empresa selecionada. Para outras empresas, use “Adicionar empresa” abaixo. O novo usuário confirma o MFA no primeiro acesso.');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Falha no cadastro.');
    } finally {
      setLoading(false);
    }
  }

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
        Concessões por empresa. Somente usuários já cadastrados. O Admin autoriza o acesso; a própria conta ativa e confirma MFA antes de obter privilégios técnicos.
        Nunca solicite a senha do cliente.
      </p>
    </div>
    {message && <p role="status" className="rounded border p-3 text-sm">{message}</p>}
    <section className="rounded border p-5 space-y-4">
      <h2 className="font-semibold">Criar Desenvolvedor</h2>
      <p className="text-sm text-muted-foreground">Crie o acesso uma única vez e selecione a primeira empresa. Depois, adicione quantas empresas forem necessárias. A conta é separada do Super Admin e exige MFA para usar as permissões técnicas.</p>
      <form onSubmit={createAccount} className="grid gap-3">
        <label className="text-sm">Nome
          <input required minLength={2} maxLength={120} autoComplete="off" className="mt-1 block w-full rounded border p-2" value={newName} onChange={e => setNewName(e.target.value)} />
        </label>
        <label className="text-sm">E-mail
          <input required type="email" maxLength={254} autoComplete="off" className="mt-1 block w-full rounded border p-2" value={newEmail} onChange={e => setNewEmail(e.target.value)} />
        </label>
        <label className="text-sm">Perfil
          <input value="Desenvolvedor" readOnly className="mt-1 block w-full rounded border bg-muted/40 p-2" aria-label="Perfil" />
        </label>
        <label className="text-sm">Primeira empresa autorizada
          <select required className="mt-1 block w-full rounded border p-2" value={newTenantId} onChange={e => setNewTenantId(e.target.value)}>
            <option value="">Selecione a empresa</option>
            {data?.tenants.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </label>
        <label className="text-sm">Senha inicial (mínimo 12 caracteres)
          <input required type="password" minLength={12} maxLength={128} autoComplete="new-password" className="mt-1 block w-full rounded border p-2" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
        </label>
        <button type="submit" disabled={loading || !data || !newTenantId || newPassword.length < 12} className="w-fit rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-40">Criar e autorizar Desenvolvedor</button>
      </form>
    </section>
    <section className="rounded border p-5 space-y-4">
      <h2 className="font-semibold">Adicionar empresa a um Desenvolvedor</h2>
      <p className="text-sm text-muted-foreground">Selecione a conta já cadastrada e outra empresa para autorizar. O MFA é configurado uma vez por conta, não por empresa.</p>
      <label className="block text-sm">Conta que receberá acesso técnico
        <select className="mt-1 block w-full rounded border p-2" value={userId} onChange={e => setUserId(e.target.value)}>
          <option value="">Selecione a conta</option>
          {data?.users.map(u => <option key={u.id} value={u.id}>{u.name} — {u.email} {u.mfaEnabledAt ? '· MFA ativo' : '· MFA pendente'}</option>)}
        </select>
      </label>
      {selectedAccount && <div className="rounded border p-3 text-sm" role="status">Segurança da conta selecionada: <strong>{selectedAccount.mfaEnabledAt ? 'MFA ativado' : 'MFA pendente'}</strong>. {selectedAccount.mfaEnabledAt ? 'O usuário deve entrar novamente e confirmar o MFA para usar a concessão.' : 'Após conceder o acesso, a própria conta deverá ativar o MFA no primeiro acesso.'}</div>}
      <label className="block text-sm">Empresa autorizada
        <select className="mt-1 block w-full rounded border p-2" value={tenantId} onChange={e => setTenantId(e.target.value)}>
          <option value="">Selecione a empresa</option>
          {data?.tenants.map(t => <option key={t.id} value={t.id}>{t.name} ({t.slug})</option>)}
        </select>
      </label>
      <button type="button" disabled={loading || !data || !tenantId || !userId} onClick={() => change('POST', userId, tenantId)} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-40">
        Adicionar empresa
      </button>
      <div className="rounded-lg border bg-muted/30 p-4 space-y-2">
        <h3 className="font-medium text-sm">Ativação de segurança da conta técnica</h3>
        <p className="text-sm text-muted-foreground">O Super Admin autoriza o acesso aqui, mas não ativa ou confirma o autenticador em nome de outra pessoa. Compartilhe o endereço abaixo com o responsável pela conta. Após a ativação, ele deverá sair e entrar novamente, validando o código MFA.</p>
        <div className="flex flex-wrap items-center gap-3">
          <a href="/account/security" target="_blank" rel="noopener noreferrer" className="text-sm underline underline-offset-2">Abrir segurança da minha conta</a>
          <button type="button" onClick={copyMfaLink} className="rounded border px-3 py-2 text-sm">Copiar link de ativação do MFA</button>
        </div>
      </div>
    </section>
    <section className="rounded border p-5 space-y-3">
      <h2 className="font-semibold">Concessões existentes</h2>
      {!data && <p className="text-sm">Carregando...</p>}
      {data?.grants.length === 0 && <p className="text-sm">Nenhum acesso técnico cadastrado.</p>}
      {data?.grants.map(g => {
        const tenant = data.tenants.find(t => t.id === g.tenantId);
        const user = data.users.find(u => u.id === g.userId);
        const mfaActive = Boolean(user?.mfaEnabledAt);
        const status = g.revokedAt ? 'Revogado' : mfaActive ? 'Autorizado · MFA ativo (confirmar no login)' : 'Autorizado · aguardando MFA';
        return <div key={g.id} className="flex items-center justify-between gap-4 border-b py-3 text-sm">
          <div><strong>{tenant?.name ?? 'Empresa não listada'}</strong><p>{user?.email ?? 'Conta não listada'} · {status}</p></div>
          {!g.revokedAt && <button type="button" disabled={loading} className="rounded border px-3 py-2 disabled:opacity-40" onClick={() => change('DELETE', g.userId, g.tenantId)}>Revogar</button>}
        </div>;
      })}
    </section>
  </main>;
}

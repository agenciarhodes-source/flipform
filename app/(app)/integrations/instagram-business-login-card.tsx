'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConnectionHealthPanel, type ConnectionHealth } from './connection-health-panel';

type InstagramConnection = {
  id: string;
  status: string;
  instagramUserId: string;
  username: string | null;
  tokenExpiresAt: string | null;
  connectedAt: string;
  lastValidatedAt: string | null;
  revokedAt: string | null;
} | null;

export function InstagramBusinessLoginCard() {
  const [connection, setConnection] = useState<InstagramConnection>(null);
  const [health, setHealth] = useState<ConnectionHealth>(null);
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const [connectionAvailable, setConnectionAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [checking, setChecking] = useState(false);

  const loadConnection = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/instagram/connection', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setConnection(null);
        setHealth(null);
        setPlatformAvailable(false);
        setConnectionAvailable(false);
        return;
      }
      setConnection(payload.connection || null);
      setHealth(payload.health || null);
      setPlatformAvailable(Boolean(payload.platformAvailable));
      setConnectionAvailable(Boolean(payload.connectionAvailable));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadConnection(); }, [loadConnection]);

  useEffect(() => {
    const url = new URL(window.location.href);
    const result = url.searchParams.get('instagram');
    if (!result) return;
    if (result === 'connected') toast.success('Instagram profissional conectado ao FlipForm.');
    if (result === 'cancelled') toast.message('Conexão com o Instagram cancelada. Nenhuma alteração foi feita.');
    if (result === 'permissions') toast.error('Para concluir a conexão, autorize as permissões solicitadas pelo Instagram.');
    if (result === 'conflict') toast.error('Esta conta do Instagram já está vinculada a outra empresa no FlipForm.');
    if (result === 'error') toast.error('Não foi possível concluir a conexão com o Instagram agora.');
    url.searchParams.delete('instagram');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  async function connect() {
    if (!connectionAvailable) return;
    setConnecting(true);
    try {
      const response = await fetch('/api/integrations/instagram/connect', { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('Não foi possível iniciar a conexão com o Instagram agora.');
      if (typeof payload.authorizationUrl !== 'string' || !payload.authorizationUrl.startsWith('https://www.instagram.com/')) {
        throw new Error('Não foi possível iniciar a conexão com o Instagram agora.');
      }
      window.location.assign(payload.authorizationUrl);
    } catch (error) {
      setConnecting(false);
      toast.error(error instanceof Error ? error.message : 'Não foi possível iniciar a conexão com o Instagram agora.');
    }
  }

  async function checkConnection() {
    setChecking(true);
    try {
      const response = await fetch('/api/integrations/instagram/connection/validate', { method: 'POST' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error('Não foi possível verificar a conexão do Instagram agora.');
      setHealth(payload.health || null);
      if (payload.health?.state === 'healthy') toast.success('Conexão do Instagram validada com a Meta.');
      else if (payload.health?.state === 'provider_error') toast.error('A Meta não respondeu à verificação. Tente novamente mais tarde.');
      else toast.error('A conexão do Instagram precisa de atenção.');
      await loadConnection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível verificar a conexão do Instagram agora.');
    } finally {
      setChecking(false);
    }
  }

  async function disconnect() {
    if (!confirm('Desconectar o Instagram desta empresa? O histórico de conversas será preservado.')) return;
    setDisconnecting(true);
    try {
      const response = await fetch('/api/integrations/instagram/connection', { method: 'DELETE' });
      if (!response.ok) throw new Error('Não foi possível desconectar o Instagram agora.');
      toast.success('Instagram desconectado do FlipForm.');
      await loadConnection();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível desconectar o Instagram agora.');
    } finally {
      setDisconnecting(false);
    }
  }

  const connected = connection?.status === 'connected';
  const expired = connection?.status === 'expired' || health?.state === 'expired';
  const hasBinding = Boolean(connection);
  const canConnect = Boolean(connectionAvailable && !loading && !connecting && !disconnecting && !checking);

  return <div className="px-6 pb-6 max-w-7xl">
    <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">Instagram</h2>
          <p className="text-sm text-muted-foreground">Integração opcional para Direct, comentários e automações.</p>
        </div>
        <span className="rounded-full border bg-white px-2 py-1 text-xs">{loading ? 'Carregando' : connected ? health?.label || 'Conectado' : expired ? 'Token expirado' : 'Não conectado'}</span>
      </div>

      {hasBinding && <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border bg-slate-50 p-3">
          <p className="text-xs text-muted-foreground">Conta profissional</p>
          <p className="text-sm font-medium">{connection?.username ? `@${connection.username}` : 'Instagram conectado'}</p>
        </div>
        <div className="rounded-md border bg-slate-50 p-3">
          <p className="text-xs text-muted-foreground">Conectado em</p>
          <p className="text-sm font-medium">{connection?.connectedAt ? new Date(connection.connectedAt).toLocaleString('pt-BR') : '-'}</p>
        </div>
      </div>}

      {hasBinding && <ConnectionHealthPanel
        health={health}
        checking={checking}
        canCheck={Boolean(connected && platformAvailable && !connecting && !disconnecting)}
        onCheck={checkConnection}
      />}

      {expired && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">A autorização desta conta expirou. Reconecte o Instagram para continuar usando mensagens e automações.</div>}

      {!loading && !hasBinding && connectionAvailable && <p className="text-sm text-muted-foreground">Se quiser usar este módulo, conecte uma conta profissional Business ou Creator. A configuração técnica já é administrada pelo FlipForm.</p>}

      {!loading && !hasBinding && !connectionAvailable && <div className="rounded-md border bg-slate-50 p-3 text-sm text-slate-700">
        O Instagram é opcional e está desconectado. Nenhuma ação é necessária agora.
      </div>}

      <div className="flex flex-wrap gap-2">
        {connectionAvailable && <button
          type="button"
          className="rounded bg-fuchsia-700 px-4 py-2 text-sm text-white disabled:opacity-60"
          onClick={connect}
          disabled={!canConnect}
        >{connecting ? 'Abrindo Instagram...' : hasBinding ? 'Reconectar Instagram' : 'Conectar Instagram'}</button>}
        {hasBinding && <button
          type="button"
          className="rounded border px-4 py-2 text-sm disabled:opacity-60"
          onClick={disconnect}
          disabled={connecting || disconnecting || checking}
        >{disconnecting ? 'Desconectando...' : 'Desconectar'}</button>}
      </div>

      <p className="text-xs text-muted-foreground">Ao conectar, o token da conta profissional fica criptografado no servidor e não é enviado ao navegador. A conexão do Instagram é independente da integração de Meta Ads.</p>
    </div>
  </div>;
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

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
  const [platformAvailable, setPlatformAvailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const loadConnection = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/instagram/connection', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o Instagram.');
      setConnection(payload.connection || null);
      setPlatformAvailable(Boolean(payload.platformAvailable));
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível carregar o Instagram.');
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
    if (result === 'cancelled') toast.error('A conexão com o Instagram foi cancelada.');
    if (result === 'permissions') toast.error('Conceda as permissões de mensagens solicitadas para conectar o Instagram.');
    if (result === 'conflict') toast.error('Esta conta do Instagram já está vinculada a outra empresa no FlipForm.');
    if (result === 'error') toast.error('Não foi possível concluir a conexão com o Instagram.');
    url.searchParams.delete('instagram');
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`);
  }, []);

  async function connect() {
    setConnecting(true);
    try {
      const response = await fetch('/api/integrations/instagram/connect', { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível iniciar o Instagram Business Login.');
      if (typeof payload.authorizationUrl !== 'string' || !payload.authorizationUrl.startsWith('https://www.instagram.com/')) {
        throw new Error('A plataforma retornou uma URL de autorização inválida.');
      }
      window.location.assign(payload.authorizationUrl);
    } catch (error: any) {
      setConnecting(false);
      toast.error(error.message || 'Não foi possível iniciar a conexão com o Instagram.');
    }
  }

  async function disconnect() {
    if (!confirm('Desconectar o Instagram desta empresa? O histórico de conversas será preservado.')) return;
    setDisconnecting(true);
    try {
      const response = await fetch('/api/integrations/instagram/connection', { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível desconectar o Instagram.');
      toast.success('Instagram desconectado do FlipForm.');
      await loadConnection();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível desconectar o Instagram.');
    } finally {
      setDisconnecting(false);
    }
  }

  const connected = connection?.status === 'connected';
  return <div className="px-6 pb-6 max-w-7xl">
    <div className="rounded-xl border bg-white p-5 space-y-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">Instagram Messaging</h2>
          <p className="text-sm text-muted-foreground">Conexão oficial via Business Login for Instagram, isolada por empresa.</p>
        </div>
        <span className="rounded-full border bg-white px-2 py-1 text-xs">{loading ? 'Carregando' : connected ? 'Conectado' : 'Não conectado'}</span>
      </div>

      {connected && <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border bg-slate-50 p-3">
          <p className="text-xs text-muted-foreground">Conta profissional</p>
          <p className="text-sm font-medium">{connection?.username ? `@${connection.username}` : 'Instagram conectado'}</p>
        </div>
        <div className="rounded-md border bg-slate-50 p-3">
          <p className="text-xs text-muted-foreground">Conectado em</p>
          <p className="text-sm font-medium">{connection?.connectedAt ? new Date(connection.connectedAt).toLocaleString('pt-BR') : '-'}</p>
        </div>
      </div>}

      {!loading && !platformAvailable && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">A base do aplicativo Meta ainda precisa ser configurada pelo Super Admin do FlipForm.</div>}
      {!loading && platformAvailable && !connected && <p className="text-sm text-muted-foreground">Conecte uma conta profissional Business ou Creator. Este fluxo do Instagram não exige que uma Página do Facebook esteja vinculada à conta profissional.</p>}

      <div className="flex flex-wrap gap-2">
        {platformAvailable && <button
          type="button"
          className="rounded bg-fuchsia-700 px-4 py-2 text-sm text-white disabled:opacity-60"
          onClick={connect}
          disabled={loading || connecting || disconnecting}
        >{connecting ? 'Abrindo Instagram...' : connected ? 'Reconectar Instagram' : 'Conectar Instagram'}</button>}
        {connected && <button
          type="button"
          className="rounded border px-4 py-2 text-sm disabled:opacity-60"
          onClick={disconnect}
          disabled={connecting || disconnecting}
        >{disconnecting ? 'Desconectando...' : 'Desconectar'}</button>}
      </div>

      <p className="text-xs text-muted-foreground">O token da conta profissional é armazenado criptografado no servidor e nunca é enviado ao navegador. Webhook, Direct e automações entram nos próximos módulos.</p>
    </div>
  </div>;
}

'use client';

import { useCallback, useEffect, useState } from 'react';

type ApiIntegration = {
  id: string; displayName: string; status: string;
  createdAt: string; updatedAt: string;
};
type ApiKey = { id: string; scopes: string[]; createdAt: string;
  expiresAt: string | null; revokedAt: string | null };
type OneTimeKey = { credentialId: string; bearerToken: string; expiresAt: string };

const ROOT = '/api/integrations/api-v1';
function message(error: unknown): string {
  return error instanceof Error ? error.message : 'Não foi possível executar a operação.';
}
async function apiFetch<T>(url: string, method = 'GET', payload?: unknown): Promise<T> {
  const response = await fetch(url, {
    method, credentials: 'same-origin', cache: 'no-store',
    headers: payload === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
  if (!response.ok) {
    if (response.status === 403) throw new Error('Somente o proprietário com plano elegível pode administrar a API.');
    if (response.status === 429) throw new Error('Limite de credenciais atingido.');
    if (response.status === 503) throw new Error('API ainda não está pronta neste ambiente.');
    throw new Error('A operação não foi autorizada ou não pôde ser concluída.');
  }
  return response.json() as Promise<T>;
}

/**
 * This screen renders ONLY while the global feature flag is explicitly ON.
 * Tokens are never persisted, sent to telemetry, or cached; shown once only.
 */
export function ApiV1Card() {
  const [integrations, setIntegrations] = useState<ApiIntegration[]>([]);
  const [keys, setKeys] = useState<Record<string, ApiKey[]>>({});
  const [newName, setNewName] = useState('');
  const [visibleToken, setVisibleToken] = useState<OneTimeKey | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const response = await apiFetch<{ integrations: ApiIntegration[] }>(ROOT);
    setIntegrations(response.integrations);
    const views = await Promise.all(response.integrations.map(async item => {
      const result = await apiFetch<{ keys: ApiKey[] }>(ROOT + '/' + item.id + '/keys');
      return [item.id, result.keys] as const;
    }));
    setKeys(Object.fromEntries(views));
  }, []);

  useEffect(() => {
    let mounted = true;
    const initialize = async () => {
      try {
        await refresh();
      } catch (err) {
        if (mounted) setError(message(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void initialize();
    return () => { mounted = false; };
  }, [refresh]);

  async function perform(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setVisibleToken(null);
    try {
      await action();
      await refresh();
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    await perform(async () => {
      await apiFetch(ROOT, 'POST', { displayName: newName.trim() });
      setNewName('');
    });
  }
  async function setState(item: ApiIntegration) {
    await perform(() => apiFetch(ROOT + '/' + item.id, 'PATCH',
      { status: item.status === 'active' ? 'disabled' : 'active' }));
  }
  async function issue(item: ApiIntegration, scope: 'integrations.read' | 'pipelines.read' | 'forms.read') {
    await perform(async () => {
      const response = await apiFetch<{ key: OneTimeKey }>(
        ROOT + '/' + item.id + '/keys', 'POST', { scopes: [scope] });
      // Do not let perform's refresh discard the one-time secret.
      setVisibleToken(response.key);
    });
  }
  async function rotate(item: ApiIntegration, keyId: string) {
    await perform(async () => {
      const response = await apiFetch<{ key: OneTimeKey }>(
        ROOT + '/' + item.id + '/keys/' + keyId, 'POST');
      setVisibleToken(response.key);
    });
  }
  async function revoke(item: ApiIntegration, keyId: string) {
    await perform(() => apiFetch(ROOT + '/' + item.id + '/keys/' + keyId, 'DELETE'));
  }
  async function copyOnce() {
    if (!visibleToken) return;
    try {
      await navigator.clipboard.writeText(visibleToken.bearerToken);
    } catch {
      setError('Cópia automática indisponível. Copie a chave do campo abaixo.');
    }
  }
  return (
    <section id="native-api" className="rounded-xl border bg-card p-5 space-y-4" aria-label="Integrações e API v1">
      <div>
        <h2 className="text-xl font-semibold">Integrações e API</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Credenciais por empresa. A conexão começa desativada; esta versão oferece apenas uma consulta técnica,
          sem acesso a leads, contratos ou campanhas. Leitura de pipelines, etapas e catálogo de formulários, mediante autorização específica.
        </p>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {loading ? <p className="text-sm">Carregando...</p> : (
        <>
          <div className="flex flex-wrap gap-2 items-center">
            <input aria-label="Nome da integração" value={newName} maxLength={80}
              onChange={e => setNewName(e.target.value)} placeholder="Nome do sistema conectado"
              className="rounded-md border px-3 py-2 min-w-52 flex-1" />
            <button type="button" disabled={busy || newName.trim().length < 2}
              onClick={() => void create()} className="rounded-md bg-primary text-primary-foreground px-4 py-2 disabled:opacity-50">
              Criar integração
            </button>
          </div>
          {integrations.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma integração configurada.</p>}
          {integrations.map(item => (
            <div key={item.id} className="rounded-lg border p-4 space-y-3">
              <div className="flex flex-wrap items-center gap-3 justify-between">
                <div>
                  <p className="font-semibold">{item.displayName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.status === 'active' ? 'Integração ativa' : 'Integração desativada'}
                  </p>
                </div>
                <button type="button" disabled={busy} onClick={() => void setState(item)}
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
                  {item.status === 'active' ? 'Desativar' : 'Ativar'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy || item.status !== 'active'}
                  onClick={() => void issue(item, 'integrations.read')}
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
                  Chave de diagnóstico
                </button>
                <button type="button" disabled={busy || item.status !== 'active'}
                  onClick={() => void issue(item, 'pipelines.read')}
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
                  Chave de leitura de pipelines
                </button>
                <button type="button" disabled={busy || item.status !== 'active'}
                  onClick={() => void issue(item, 'forms.read')}
                  className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">
                  Chave de leitura de formulários
                </button>
              </div>
              {(keys[item.id] || []).map(key => (
                <div key={key.id} className="flex flex-wrap items-center justify-between gap-2 text-sm border-t pt-2">
                  <span className="break-all">
                    {key.id.slice(0, 8)}… · {key.scopes.join(', ')} · {key.revokedAt ? 'Revogada'
                      : key.expiresAt && new Date(key.expiresAt).getTime() <= Date.now() ? 'Expirada' : 'Ativa'}
                  </span>
                  <div className="flex gap-2">
                    <button type="button" disabled={busy || !!key.revokedAt || item.status !== 'active'}
                      onClick={() => void rotate(item, key.id)} className="rounded-md border px-2 py-1 disabled:opacity-50">
                      Rotacionar
                    </button>
                    <button type="button" disabled={busy || !!key.revokedAt}
                      onClick={() => void revoke(item, key.id)} className="rounded-md border px-2 py-1 disabled:opacity-50">
                      Revogar
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </>
      )}
      {visibleToken && (
        <div className="rounded-lg border p-4 space-y-2" role="status">
          <p className="font-semibold">Chave gerada — copie agora</p>
          <p className="text-sm">O segredo não será mostrado novamente. Guarde-o em um cofre seguro.</p>
          <textarea readOnly value={visibleToken.bearerToken} rows={2}
            aria-label="Chave de API de uso único" className="w-full rounded-md border p-2 font-mono text-xs" />
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void copyOnce()} className="rounded-md border px-3 py-2 text-sm">
              Copiar chave
            </button>
            <button type="button" onClick={() => setVisibleToken(null)} className="rounded-md border px-3 py-2 text-sm">
              Ocultar definitivamente
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

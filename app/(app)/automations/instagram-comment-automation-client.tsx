'use client';

import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type MatchType = 'exact' | 'contains';

type AutomationRule = {
  id: string;
  versionId: string;
  versionNumber: number;
  configuredByUserId: string | null;
  name: string;
  orderIndex: number;
  keyword: string;
  keywordNormalized: string;
  matchType: MatchType;
  replyText: string;
  enabled: boolean;
  updatedAt: string;
};

type InstagramConnection = {
  id: string;
  status: string;
  instagramUserId: string;
  username?: string | null;
} | null;

type ConnectionHealth = {
  state: 'healthy' | 'degraded' | 'action_required' | 'expired' | 'revoked' | 'provider_error' | 'not_connected';
  label: string;
  summary: string;
  reconnectRecommended: boolean;
} | null;

type DraftRule = {
  name: string;
  keyword: string;
  matchType: MatchType;
  replyText: string;
  enabled: boolean;
  orderIndex: number;
};

const EMPTY_DRAFT: DraftRule = {
  name: 'Resposta por comentário',
  keyword: '',
  matchType: 'contains',
  replyText: '',
  enabled: true,
  orderIndex: 0,
};

function payloadFromRule(rule: AutomationRule, overrides?: Partial<DraftRule>) {
  return {
    name: overrides?.name ?? rule.name,
    keyword: overrides?.keyword ?? rule.keyword,
    matchType: overrides?.matchType ?? rule.matchType,
    replyText: overrides?.replyText ?? rule.replyText,
    enabled: overrides?.enabled ?? rule.enabled,
    orderIndex: overrides?.orderIndex ?? rule.orderIndex,
  };
}

async function responsePayload(response: Response) {
  return response.json().catch(() => ({}));
}

function statusTone(health: ConnectionHealth, connected: boolean, connectionError: string | null) {
  if (connectionError) return 'border-amber-200 bg-amber-50 text-amber-900';
  if (!connected || !health || health.state === 'not_connected' || health.state === 'revoked') {
    return 'border-slate-200 bg-slate-50 text-slate-800';
  }
  if (health.state === 'healthy') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (health.state === 'degraded' || health.state === 'provider_error') {
    return 'border-amber-200 bg-amber-50 text-amber-900';
  }
  return 'border-rose-200 bg-rose-50 text-rose-900';
}

function connectionLabel(connection: InstagramConnection, health: ConnectionHealth, connectionError: string | null) {
  if (connectionError) return 'Status do Instagram indisponível';
  if (!connection || connection.status !== 'connected') return 'Instagram não conectado';
  if (!health) return 'Instagram conectado';
  return `Instagram: ${health.label}`;
}

export function InstagramCommentAutomationClient({ canEdit }: { canEdit: boolean }) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [connection, setConnection] = useState<InstagramConnection>(null);
  const [health, setHealth] = useState<ConnectionHealth>(null);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftRule>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setRulesError(null);
    setConnectionError(null);

    const [rulesResult, connectionResult] = await Promise.allSettled([
      fetch('/api/integrations/instagram/comment-automations', { cache: 'no-store' }),
      fetch('/api/integrations/instagram/connection', { cache: 'no-store' }),
    ]);

    if (rulesResult.status === 'fulfilled') {
      const payload = await responsePayload(rulesResult.value);
      if (rulesResult.value.ok) {
        setRules(Array.isArray(payload.rules) ? payload.rules : []);
      } else {
        const message = payload.error || 'Não foi possível carregar as automações.';
        setRulesError(message);
        toast.error(message);
      }
    } else {
      const message = 'Não foi possível carregar as automações.';
      setRulesError(message);
      toast.error(message);
    }

    if (connectionResult.status === 'fulfilled') {
      const payload = await responsePayload(connectionResult.value);
      if (connectionResult.value.ok) {
        setConnection(payload.connection || null);
        setHealth(payload.health || null);
      } else {
        const message = payload.error || 'Não foi possível verificar o Instagram.';
        setConnectionError(message);
      }
    } else {
      setConnectionError('Não foi possível verificar o Instagram agora.');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(() => rules.filter(rule => rule.enabled).length, [rules]);
  const connected = connection?.status === 'connected';
  const needsReconnect = !connectionError && (
    !connected
    || health?.state === 'expired'
    || health?.state === 'revoked'
    || health?.state === 'action_required'
  );

  function openCreate() {
    const highestOrder = rules.length ? Math.max(...rules.map(rule => rule.orderIndex)) : -10;
    const nextOrder = Math.min(10000, Math.max(0, highestOrder + 10));
    setEditingRuleId(null);
    setDraft({ ...EMPTY_DRAFT, orderIndex: nextOrder });
    setEditorOpen(true);
  }

  function openEdit(rule: AutomationRule) {
    setEditingRuleId(rule.id);
    setDraft(payloadFromRule(rule));
    setEditorOpen(true);
  }

  function closeEditor() {
    if (saving) return;
    setEditorOpen(false);
    setEditingRuleId(null);
  }

  async function saveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const endpoint = editingRuleId
        ? `/api/integrations/instagram/comment-automations/${encodeURIComponent(editingRuleId)}`
        : '/api/integrations/instagram/comment-automations';
      const response = await fetch(endpoint, {
        method: editingRuleId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload = await responsePayload(response);
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar a automação.');
      toast.success(editingRuleId ? 'Automação atualizada.' : 'Automação criada.');
      setEditorOpen(false);
      setEditingRuleId(null);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a automação.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: AutomationRule) {
    if (!canEdit || savingId) return;
    setSavingId(rule.id);
    try {
      const response = await fetch(`/api/integrations/instagram/comment-automations/${encodeURIComponent(rule.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFromRule(rule, { enabled: !rule.enabled })),
      });
      const payload = await responsePayload(response);
      if (!response.ok) throw new Error(payload.error || 'Não foi possível alterar o status da automação.');
      setRules(current => current.map(item => item.id === rule.id ? payload.rule : item));
      toast.success(rule.enabled ? 'Automação pausada.' : 'Automação ativada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar o status da automação.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 lg:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-700">Automações</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Comentários do Instagram</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Defina uma palavra-chave e envie uma resposta privada automática quando alguém comentar em um post ou Reel.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={openCreate}
            className="rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700"
          >
            Nova automação
          </button>
        )}
      </div>

      <div className={`rounded-xl border p-4 ${statusTone(health, connected, connectionError)}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">{connectionLabel(connection, health, connectionError)}</p>
            <p className="mt-1 text-xs opacity-85">
              {connectionError
                || (connected && health ? health.summary : 'Conecte uma conta profissional do Instagram para executar respostas automáticas.')}
            </p>
          </div>
          <Link
            href="/integrations"
            className="w-fit rounded-md border border-current bg-white/70 px-3 py-2 text-xs font-medium"
          >
            {needsReconnect ? 'Conectar ou reconectar' : 'Ver integração'}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="mt-2 text-2xl font-semibold">{rules.length}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ativas</p>
          <p className="mt-2 text-2xl font-semibold">{activeCount}</p>
        </div>
        <div className="rounded-xl border bg-card p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Canal</p>
          <p className="mt-2 text-sm font-semibold">Instagram · comentário → DM</p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="flex items-center justify-between border-b px-4 py-4 sm:px-5">
          <div>
            <h2 className="font-semibold">Fluxos configurados</h2>
            <p className="mt-1 text-xs text-muted-foreground">A primeira regra ativa que combinar com o comentário será executada.</p>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando automações...</div>
        ) : rulesError ? (
          <div className="p-8 text-center">
            <p className="font-medium">Não foi possível carregar as automações</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">{rulesError}</p>
            <button type="button" onClick={() => void load()} className="mt-4 rounded-md border px-4 py-2 text-sm font-medium">
              Tentar novamente
            </button>
          </div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center">
            <p className="font-medium">Nenhuma automação criada</p>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Crie um fluxo para responder automaticamente a comentários como “eu quero”, “preço” ou outra palavra-chave relevante.
            </p>
            {canEdit && (
              <button type="button" onClick={openCreate} className="mt-4 rounded-md border px-4 py-2 text-sm font-medium">
                Criar primeira automação
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y">
            {rules.map((rule, index) => (
              <div key={rule.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${rule.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                        {rule.enabled ? 'Ativa' : 'Pausada'}
                      </span>
                      <span className="text-xs text-muted-foreground">Prioridade {index + 1}</span>
                    </div>
                    <h3 className="mt-2 font-semibold">{rule.name}</h3>
                    <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center">
                      <span className="rounded-md border bg-muted/40 px-2.5 py-1.5 font-medium">Comentário: “{rule.keyword}”</span>
                      <span className="text-muted-foreground">→</span>
                      <span className="min-w-0 truncate rounded-md border bg-muted/40 px-2.5 py-1.5" title={rule.replyText}>
                        DM: {rule.replyText}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Correspondência: {rule.matchType === 'exact' ? 'comentário exato' : 'contém a palavra ou frase'} · ordem {rule.orderIndex}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => toggleRule(rule)}
                        disabled={savingId === rule.id}
                        className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                      >
                        {savingId === rule.id ? 'Salvando...' : rule.enabled ? 'Pausar' : 'Ativar'}
                      </button>
                    )}
                    <button type="button" onClick={() => openEdit(rule)} className="rounded-md border px-3 py-2 text-sm font-medium">
                      {canEdit ? 'Editar' : 'Visualizar'}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {!canEdit && (
        <p className="text-xs text-muted-foreground">Seu perfil possui acesso somente para visualizar as automações.</p>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={closeEditor}>
          <div
            className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl"
            onMouseDown={event => event.stopPropagation()}
          >
            <form onSubmit={saveDraft}>
              <div className="border-b p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-brand-700">Instagram</p>
                    <h2 className="mt-1 text-xl font-semibold">{editingRuleId ? 'Editar automação' : 'Nova automação'}</h2>
                  </div>
                  <button type="button" onClick={closeEditor} className="rounded-md border px-3 py-1.5 text-sm">Fechar</button>
                </div>
              </div>

              <div className="space-y-5 p-5">
                <label className="block">
                  <span className="text-sm font-medium">Nome da automação</span>
                  <input
                    value={draft.name}
                    onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
                    maxLength={120}
                    required
                    disabled={!canEdit}
                    className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-70"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium">Palavra ou frase</span>
                    <input
                      value={draft.keyword}
                      onChange={event => setDraft(current => ({ ...current, keyword: event.target.value }))}
                      placeholder="Ex.: eu quero"
                      maxLength={160}
                      required
                      disabled={!canEdit}
                      className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-70"
                    />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium">Quando deve corresponder</span>
                    <select
                      value={draft.matchType}
                      onChange={event => setDraft(current => ({ ...current, matchType: event.target.value as MatchType }))}
                      disabled={!canEdit}
                      className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-70"
                    >
                      <option value="contains">Comentário contém a palavra/frase</option>
                      <option value="exact">Comentário é exatamente igual</option>
                    </select>
                  </label>
                </div>

                <label className="block">
                  <span className="text-sm font-medium">Resposta privada</span>
                  <textarea
                    value={draft.replyText}
                    onChange={event => setDraft(current => ({ ...current, replyText: event.target.value }))}
                    placeholder="Escreva a mensagem que será enviada no Direct..."
                    rows={5}
                    maxLength={4096}
                    required
                    disabled={!canEdit}
                    className="mt-2 w-full resize-y rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-70"
                  />
                  <span className="mt-1 block text-right text-xs text-muted-foreground">{draft.replyText.length}/4096</span>
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-sm font-medium">Ordem de prioridade</span>
                    <input
                      type="number"
                      min={0}
                      max={10000}
                      step={1}
                      value={draft.orderIndex}
                      onChange={event => setDraft(current => ({ ...current, orderIndex: Number(event.target.value) }))}
                      disabled={!canEdit}
                      className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-70"
                    />
                  </label>
                  <label className="flex items-center justify-between gap-4 rounded-md border p-3 sm:mt-7">
                    <span>
                      <span className="block text-sm font-medium">Ativar ao salvar</span>
                      <span className="block text-xs text-muted-foreground">Pode ser pausada depois.</span>
                    </span>
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))}
                      disabled={!canEdit}
                      className="h-4 w-4"
                    />
                  </label>
                </div>

                <div className="rounded-xl border bg-muted/30 p-4">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prévia do fluxo</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Quando alguém comentar</p>
                      <p className="mt-1 text-sm font-semibold">{draft.keyword || 'sua palavra-chave'}</p>
                    </div>
                    <span className="text-center text-muted-foreground">→</span>
                    <div className="rounded-lg border bg-background p-3">
                      <p className="text-xs text-muted-foreground">Enviar no Direct</p>
                      <p className="mt-1 line-clamp-2 text-sm">{draft.replyText || 'sua resposta privada'}</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 border-t p-5">
                <button type="button" onClick={closeEditor} className="rounded-md border px-4 py-2 text-sm font-medium">Cancelar</button>
                {canEdit && (
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
                  >
                    {saving ? 'Salvando...' : editingRuleId ? 'Salvar alterações' : 'Criar automação'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

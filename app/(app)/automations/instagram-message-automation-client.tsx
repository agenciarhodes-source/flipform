'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type MatchType = 'exact' | 'contains';

type InstagramMessageAutomationRule = {
  id: string;
  versionId: string;
  versionNumber: number;
  name: string;
  orderIndex: number;
  keyword: string;
  keywordNormalized: string;
  matchType: MatchType;
  replyText: string;
  enabled: boolean;
  updatedAt: string;
};

type Draft = {
  name: string;
  keyword: string;
  matchType: MatchType;
  replyText: string;
  enabled: boolean;
  orderIndex: number;
};

const EMPTY_DRAFT: Draft = {
  name: '',
  keyword: '',
  matchType: 'contains',
  replyText: '',
  enabled: true,
  orderIndex: 0,
};

function draftFromRule(rule: InstagramMessageAutomationRule): Draft {
  return {
    name: rule.name,
    keyword: rule.keyword,
    matchType: rule.matchType,
    replyText: rule.replyText,
    enabled: rule.enabled,
    orderIndex: rule.orderIndex,
  };
}

export function InstagramMessageAutomationClient({ canEdit }: { canEdit: boolean }) {
  const [rules, setRules] = useState<InstagramMessageAutomationRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);

  const orderedRules = useMemo(
    () => [...rules].sort((a, b) => a.orderIndex - b.orderIndex || a.name.localeCompare(b.name)),
    [rules],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/instagram/message-automations', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar as automações de Direct.');
      setRules(Array.isArray(payload.rules) ? payload.rules : []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar as automações de Direct.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function resetDraft() {
    setEditingId(null);
    setDraft({ ...EMPTY_DRAFT, orderIndex: rules.length ? Math.max(...rules.map(rule => rule.orderIndex)) + 10 : 0 });
  }

  function editRule(rule: InstagramMessageAutomationRule) {
    setEditingId(rule.id);
    setDraft(draftFromRule(rule));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function save() {
    if (!canEdit || saving) return;
    if (!draft.name.trim() || !draft.keyword.trim() || !draft.replyText.trim()) {
      toast.error('Preencha nome, palavra-chave e resposta.');
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(
        editingId
          ? `/api/integrations/instagram/message-automations/${encodeURIComponent(editingId)}`
          : '/api/integrations/instagram/message-automations',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(draft),
        },
      );
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar a automação.');
      toast.success(editingId ? 'Automação de Direct atualizada.' : 'Automação de Direct criada.');
      setEditingId(null);
      setDraft(EMPTY_DRAFT);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar a automação.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleRule(rule: InstagramMessageAutomationRule) {
    if (!canEdit || saving) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/integrations/instagram/message-automations/${encodeURIComponent(rule.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draftFromRule(rule), enabled: !rule.enabled }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar a automação.');
      toast.success(rule.enabled ? 'Automação pausada.' : 'Automação ativada.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível atualizar a automação.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 lg:p-6">
      <div>
        <p className="text-sm font-medium text-brand-700">Instagram · Direct</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Mensagem recebida → resposta automática</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Crie respostas por palavra-chave para conversas iniciadas pelo próprio usuário no Instagram. O módulo é opcional: se a conta não estiver conectada, as regras ficam salvas e simplesmente não executam.
        </p>
      </div>

      <section className="rounded-2xl border bg-card p-5 sm:p-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="font-semibold">{editingId ? 'Editar automação' : 'Nova automação'}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              O FlipForm responde somente após receber uma mensagem válida do usuário. Não inicia conversas não solicitadas.
            </p>
          </div>
          {editingId && canEdit && (
            <button type="button" onClick={resetDraft} className="text-sm font-medium text-brand-700">
              Cancelar edição
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Nome da automação</span>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
              value={draft.name}
              maxLength={120}
              disabled={!canEdit || saving}
              onChange={event => setDraft(current => ({ ...current, name: event.target.value }))}
              placeholder="Ex.: Resposta para orçamento"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Palavra-chave ou frase</span>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
              value={draft.keyword}
              maxLength={160}
              disabled={!canEdit || saving}
              onChange={event => setDraft(current => ({ ...current, keyword: event.target.value }))}
              placeholder="Ex.: eu quero"
            />
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Correspondência</span>
            <select
              className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
              value={draft.matchType}
              disabled={!canEdit || saving}
              onChange={event => setDraft(current => ({ ...current, matchType: event.target.value as MatchType }))}
            >
              <option value="contains">Mensagem contém a palavra/frase</option>
              <option value="exact">Mensagem é exatamente igual</option>
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Ordem de prioridade</span>
            <input
              className="w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
              type="number"
              min={0}
              max={10000}
              value={draft.orderIndex}
              disabled={!canEdit || saving}
              onChange={event => setDraft(current => ({ ...current, orderIndex: Number(event.target.value) || 0 }))}
            />
          </label>
        </div>

        <label className="mt-4 block space-y-1.5 text-sm">
          <span className="font-medium">Resposta automática</span>
          <textarea
            className="min-h-32 w-full rounded-md border bg-background px-3 py-2 outline-none focus:ring-2 focus:ring-brand-200 disabled:opacity-60"
            value={draft.replyText}
            maxLength={4096}
            disabled={!canEdit || saving}
            onChange={event => setDraft(current => ({ ...current, replyText: event.target.value }))}
            placeholder="Digite a mensagem que será enviada no Direct."
          />
          <span className="text-xs text-muted-foreground">{draft.replyText.length}/4096</span>
        </label>

        <label className="mt-4 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.enabled}
            disabled={!canEdit || saving}
            onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))}
          />
          <span>Deixar esta automação ativa</span>
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void save()}
            disabled={!canEdit || saving}
            className="rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Salvando...' : editingId ? 'Salvar alterações' : 'Criar automação'}
          </button>
          {!canEdit && <span className="self-center text-xs text-muted-foreground">Seu perfil possui acesso somente leitura.</span>}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Automações configuradas</h2>
          <p className="mt-1 text-sm text-muted-foreground">A primeira regra ativa que combinar com a mensagem é executada.</p>
        </div>

        {loading && <div className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">Carregando automações...</div>}
        {!loading && orderedRules.length === 0 && (
          <div className="rounded-xl border border-dashed bg-muted/20 p-6 text-sm text-muted-foreground">
            Nenhuma automação de Direct configurada. Isso não é um erro — o Instagram continua sendo um módulo opcional.
          </div>
        )}

        {!loading && orderedRules.map(rule => (
          <article key={rule.id} className="rounded-xl border bg-card p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold">{rule.name}</h3>
                  <span className={`rounded-full px-2 py-1 text-xs font-medium ${rule.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                    {rule.enabled ? 'Ativa' : 'Pausada'}
                  </span>
                  <span className="rounded-full border px-2 py-1 text-xs text-muted-foreground">Prioridade {rule.orderIndex}</span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  Quando a mensagem {rule.matchType === 'exact' ? 'for exatamente' : 'contiver'} <strong className="text-foreground">“{rule.keyword}”</strong>
                </p>
                <div className="mt-3 rounded-lg border bg-muted/20 p-3 text-sm whitespace-pre-wrap">{rule.replyText}</div>
                <p className="mt-2 text-xs text-muted-foreground">Versão {rule.versionNumber}</p>
              </div>

              <div className="flex shrink-0 flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => editRule(rule)}
                  disabled={!canEdit || saving}
                  className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  Editar
                </button>
                <button
                  type="button"
                  onClick={() => void toggleRule(rule)}
                  disabled={!canEdit || saving}
                  className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {rule.enabled ? 'Pausar' : 'Ativar'}
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>

      <section className="rounded-xl border bg-slate-50 p-4 text-xs text-slate-700">
        Este fluxo não cria, edita ou move Leads e não altera Meta Ads, Pixel, Dataset ou CAPI. Ele atua somente sobre mensagens do Instagram recebidas depois que a conta profissional estiver conectada.
      </section>
    </div>
  );
}

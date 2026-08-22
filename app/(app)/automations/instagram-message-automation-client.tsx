'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type MatchType = 'exact' | 'contains';
type LeadTemperature = 'cold' | 'warm' | 'hot';

type DraftEnsureLead = {
  pipelineId: string;
  stageId: string;
  temperature: LeadTemperature;
};

type DraftMoveLead = {
  pipelineId: string;
  stageId: string;
};

type PipelineStageOption = {
  id: string;
  name: string;
  isArchived?: boolean;
};

type PipelineOption = {
  id: string;
  name: string;
  isDefault?: boolean;
  stages: PipelineStageOption[];
};

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
  ensureLead: (DraftEnsureLead & { actionId: string }) | null;
  moveLead: (DraftMoveLead & { actionId: string }) | null;
  updatedAt: string;
};

type Draft = {
  name: string;
  keyword: string;
  matchType: MatchType;
  replyText: string;
  enabled: boolean;
  orderIndex: number;
  ensureLead: DraftEnsureLead | null;
  moveLead: DraftMoveLead | null;
};

const EMPTY_DRAFT: Draft = {
  name: '',
  keyword: '',
  matchType: 'contains',
  replyText: '',
  enabled: true,
  orderIndex: 0,
  ensureLead: null,
  moveLead: null,
};

function draftFromRule(rule: InstagramMessageAutomationRule): Draft {
  return {
    name: rule.name,
    keyword: rule.keyword,
    matchType: rule.matchType,
    replyText: rule.replyText,
    enabled: rule.enabled,
    orderIndex: rule.orderIndex,
    ensureLead: rule.ensureLead
      ? {
          pipelineId: rule.ensureLead.pipelineId,
          stageId: rule.ensureLead.stageId,
          temperature: rule.ensureLead.temperature,
        }
      : null,
    moveLead: rule.moveLead
      ? { pipelineId: rule.moveLead.pipelineId, stageId: rule.moveLead.stageId }
      : null,
  };
}

async function responsePayload(response: Response) {
  return response.json().catch(() => ({}));
}

export function InstagramMessageAutomationClient({ canEdit }: { canEdit: boolean }) {
  const [rules, setRules] = useState<InstagramMessageAutomationRule[]>([]);
  const [pipelines, setPipelines] = useState<PipelineOption[]>([]);
  const [pipelinesError, setPipelinesError] = useState<string | null>(null);
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
    setPipelinesError(null);
    try {
      const [rulesResult, pipelinesResult] = await Promise.allSettled([
        fetch('/api/integrations/instagram/message-automations', { cache: 'no-store' }),
        fetch('/api/pipelines', { cache: 'no-store' }),
      ]);

      if (rulesResult.status !== 'fulfilled') {
        throw new Error('Não foi possível carregar as automações de Direct.');
      }
      const rulesPayload = await responsePayload(rulesResult.value);
      if (!rulesResult.value.ok) {
        throw new Error(rulesPayload.error || 'Não foi possível carregar as automações de Direct.');
      }
      setRules(Array.isArray(rulesPayload.rules) ? rulesPayload.rules : []);

      if (pipelinesResult.status === 'fulfilled') {
        const pipelinesPayload = await responsePayload(pipelinesResult.value);
        if (pipelinesResult.value.ok) {
          setPipelines(Array.isArray(pipelinesPayload.pipelines) ? pipelinesPayload.pipelines : []);
        } else {
          setPipelines([]);
          setPipelinesError(pipelinesPayload.error || 'Não foi possível carregar os pipelines.');
        }
      } else {
        setPipelines([]);
        setPipelinesError('Não foi possível carregar os pipelines.');
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar as automações de Direct.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function activeStages(pipelineId: string) {
    return pipelines.find(pipeline => pipeline.id === pipelineId)?.stages.filter(stage => !stage.isArchived) || [];
  }

  function defaultTarget(preferredPipelineId?: string | null) {
    const preferred = preferredPipelineId
      ? pipelines.find(pipeline => pipeline.id === preferredPipelineId)
      : null;
    const pipeline = preferred || pipelines.find(candidate => candidate.isDefault) || pipelines[0];
    if (!pipeline) return null;
    const stage = pipeline.stages.find(candidate => !candidate.isArchived);
    if (!stage) return null;
    return { pipelineId: pipeline.id, stageId: stage.id };
  }

  function stageName(pipelineId: string, stageId: string) {
    const pipeline = pipelines.find(item => item.id === pipelineId);
    const stage = pipeline?.stages.find(item => item.id === stageId);
    return stage ? `${pipeline?.name || 'Pipeline'} · ${stage.name}` : 'Etapa configurada';
  }

  function resetDraft() {
    setEditingId(null);
    setDraft({
      ...EMPTY_DRAFT,
      orderIndex: rules.length ? Math.max(...rules.map(rule => rule.orderIndex)) + 10 : 0,
    });
  }

  function editRule(rule: InstagramMessageAutomationRule) {
    setEditingId(rule.id);
    setDraft(draftFromRule(rule));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function toggleEnsureLead(checked: boolean) {
    if (!checked) {
      setDraft(current => ({ ...current, ensureLead: null }));
      return;
    }
    const target = defaultTarget(draft.moveLead?.pipelineId);
    if (!target) {
      toast.error('Crie um pipeline com pelo menos uma etapa ativa para usar o CRM nesta automação.');
      return;
    }
    setDraft(current => ({
      ...current,
      ensureLead: { ...target, temperature: 'warm' },
      moveLead: current.moveLead
        ? { ...current.moveLead, pipelineId: target.pipelineId, stageId: target.stageId }
        : null,
    }));
  }

  function toggleMoveLead(checked: boolean) {
    if (!checked) {
      setDraft(current => ({ ...current, moveLead: null }));
      return;
    }
    const target = defaultTarget(draft.ensureLead?.pipelineId);
    if (!target) {
      toast.error('Crie um pipeline com pelo menos uma etapa ativa para usar o Kanban nesta automação.');
      return;
    }
    setDraft(current => ({ ...current, moveLead: target }));
  }

  function changeEnsurePipeline(pipelineId: string) {
    const firstStage = activeStages(pipelineId)[0];
    setDraft(current => ({
      ...current,
      ensureLead: current.ensureLead
        ? { ...current.ensureLead, pipelineId, stageId: firstStage?.id || '' }
        : null,
      moveLead: current.moveLead
        ? { ...current.moveLead, pipelineId, stageId: firstStage?.id || '' }
        : null,
    }));
  }

  function changeMovePipeline(pipelineId: string) {
    const firstStage = activeStages(pipelineId)[0];
    setDraft(current => ({
      ...current,
      moveLead: current.moveLead
        ? { pipelineId, stageId: firstStage?.id || '' }
        : null,
    }));
  }

  async function save() {
    if (!canEdit || saving) return;
    if (!draft.name.trim() || !draft.keyword.trim() || !draft.replyText.trim()) {
      toast.error('Preencha nome, palavra-chave e resposta.');
      return;
    }
    if (draft.ensureLead && draft.moveLead && draft.ensureLead.pipelineId !== draft.moveLead.pipelineId) {
      toast.error('A criação e a movimentação do lead precisam usar o mesmo pipeline neste fluxo.');
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
      const payload = await responsePayload(response);
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
      const payload = await responsePayload(response);
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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Mensagem recebida → fluxo automático</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Responda por palavra-chave e, opcionalmente, vincule ou crie um Lead e mova-o no Kanban. O módulo é opcional e só executa depois que a conta profissional estiver conectada.
        </p>
      </div>

      {pipelinesError && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          As respostas do Direct continuam disponíveis, mas as ações de CRM estão indisponíveis agora: {pipelinesError}
        </div>
      )}

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

        <div className="mt-5 rounded-xl border bg-muted/20 p-4">
          <div>
            <h3 className="text-sm font-semibold">CRM e Kanban (opcional)</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              Nenhuma ação de CRM é habilitada por padrão. Ative somente os passos que deseja executar quando esta regra combinar com uma nova mensagem.
            </p>
          </div>

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(draft.ensureLead)}
              disabled={!canEdit || saving || Boolean(pipelinesError)}
              onChange={event => toggleEnsureLead(event.target.checked)}
            />
            <span>Criar ou vincular Lead no CRM</span>
          </label>

          {draft.ensureLead && (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Pipeline</span>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={draft.ensureLead.pipelineId}
                  disabled={!canEdit || saving}
                  onChange={event => changeEnsurePipeline(event.target.value)}
                >
                  {pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Etapa inicial</span>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={draft.ensureLead.stageId}
                  disabled={!canEdit || saving}
                  onChange={event => setDraft(current => ({
                    ...current,
                    ensureLead: current.ensureLead ? { ...current.ensureLead, stageId: event.target.value } : null,
                  }))}
                >
                  {activeStages(draft.ensureLead.pipelineId).map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Temperatura</span>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={draft.ensureLead.temperature}
                  disabled={!canEdit || saving}
                  onChange={event => setDraft(current => ({
                    ...current,
                    ensureLead: current.ensureLead
                      ? { ...current.ensureLead, temperature: event.target.value as LeadTemperature }
                      : null,
                  }))}
                >
                  <option value="cold">Frio</option>
                  <option value="warm">Morno</option>
                  <option value="hot">Quente</option>
                </select>
              </label>
            </div>
          )}

          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={Boolean(draft.moveLead)}
              disabled={!canEdit || saving || Boolean(pipelinesError)}
              onChange={event => toggleMoveLead(event.target.checked)}
            />
            <span>Mover Lead no Kanban</span>
          </label>

          {draft.moveLead && (
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Pipeline</span>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={draft.moveLead.pipelineId}
                  disabled={!canEdit || saving || Boolean(draft.ensureLead)}
                  onChange={event => changeMovePipeline(event.target.value)}
                >
                  {pipelines.map(pipeline => <option key={pipeline.id} value={pipeline.id}>{pipeline.name}</option>)}
                </select>
              </label>
              <label className="space-y-1.5 text-sm">
                <span className="font-medium">Etapa de destino</span>
                <select
                  className="w-full rounded-md border bg-background px-3 py-2"
                  value={draft.moveLead.stageId}
                  disabled={!canEdit || saving}
                  onChange={event => setDraft(current => ({
                    ...current,
                    moveLead: current.moveLead ? { ...current.moveLead, stageId: event.target.value } : null,
                  }))}
                >
                  {activeStages(draft.moveLead.pipelineId).map(stage => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                </select>
              </label>
            </div>
          )}
        </div>

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
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                  <span className="rounded-md border bg-background px-2 py-1">Responder no Direct</span>
                  {rule.ensureLead && <span className="rounded-md border bg-background px-2 py-1">CRM: {stageName(rule.ensureLead.pipelineId, rule.ensureLead.stageId)}</span>}
                  {rule.moveLead && <span className="rounded-md border bg-background px-2 py-1">Kanban: {stageName(rule.moveLead.pipelineId, rule.moveLead.stageId)}</span>}
                </div>
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
        As ações de CRM são opt-in e ficam desativadas nas regras que não as configurarem. Esta tela não altera Meta Ads, Pixel, Dataset, CAPI, campanhas ou vínculos de integração.
      </section>
    </div>
  );
}

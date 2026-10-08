'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

type Stage = { id: string; name: string; orderIndex: number };
type Pipeline = { id: string; name: string; stages: Stage[] };
type Mapping = {
  id: string;
  pipelineId: string;
  stageId: string;
  conversionActionResource: string;
  conversionActionName: string | null;
  conversionCategory: string;
  optimizationRole: string;
  valueMode: string;
  conversionValue: number | null;
  currency: string;
  triggerRule: string;
  enabled: boolean;
};

type FunnelEvent = {
  id: string;
  stageId: string;
  conversionActionResource: string;
  state: string;
  attempts: number;
  lastErrorCode: string | null;
  createdAt: string;
  lastAttemptAt: string | null;
};
type TransportMode = 'off' | 'dry_run' | 'live';

const TRANSPORT_NOTICES: Record<TransportMode, { className: string; text: string }> = {
  off: {
    className: 'border-amber-200 bg-amber-50 text-amber-950',
    text: 'O envio ao Google Ads não está ativo para esta conta. Conversões ativas registram os eventos na fila quando um lead é movido no Kanban, mas nada é transmitido.',
  },
  dry_run: {
    className: 'border-blue-200 bg-blue-50 text-blue-950',
    text: 'Modo de teste: o Google valida cada evento, mas não registra conversão. Os eventos validados ficam na fila e são enviados quando o envio real for ligado.',
  },
  live: {
    className: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    text: 'Envio ativo: cada lead movido para uma etapa com conversão ativa é enviado ao Google Ads.',
  },
};

const FAILURE_REASONS: Record<string, string> = {
  NO_IDENTIFIER: 'lead sem clique do Google Ads',
  TENANT_ACCOUNT_NOT_ALLOWED: 'conta Google Ads não liberada para esta empresa',
  LEAD_NOT_FOUND: 'lead não encontrado',
  EXPIRED: 'evento antigo demais para o Google',
  MAX_ATTEMPTS: 'limite de tentativas atingido',
  INVALID_CONVERSION_ACTION: 'ação de conversão inválida',
};

function describeEventStatus(event: FunnelEvent) {
  const code = event.lastErrorCode ? ' (' + event.lastErrorCode + ')' : '';
  if (event.state === 'SENT') return 'Enviado ao Google';
  if (event.state === 'ACCEPTED') return 'Confirmado pelo Google';
  if (event.state === 'REJECTED') return 'Rejeitado pelo Google' + code;
  if (event.state === 'RETRY') return 'Nova tentativa agendada' + code;
  if (event.state === 'FAILED') {
    const reason = event.lastErrorCode ? FAILURE_REASONS[event.lastErrorCode] || event.lastErrorCode : '';
    return reason ? 'Não enviado: ' + reason : 'Não enviado';
  }
  if (event.lastErrorCode === 'DRY_RUN_VALIDATED') return 'Validado em teste, aguardando envio real';
  return 'Na fila';
}

const eventDateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' });

const CATEGORY_LABELS: Record<string, string> = {
  lead: 'Lead',
  qualified_lead: 'Lead qualificado',
  converted_lead: 'Lead convertido',
};
const ROLE_LABELS: Record<string, string> = { primary: 'Principal', secondary: 'Secundária' };
const TRIGGER_LABELS: Record<string, string> = {
  first_entry: 'Uma vez por lead',
  every_entry: 'A cada entrada na etapa',
};

const emptyForm = {
  stageId: '',
  conversionActionResource: '',
  conversionActionName: '',
  conversionCategory: 'qualified_lead',
  optimizationRole: 'secondary',
  valueMode: 'none',
  conversionValue: '',
  currency: 'BRL',
  triggerRule: 'first_entry',
  enabled: false,
};

function describeValue(mapping: Mapping) {
  if (mapping.valueMode === 'purchase') return 'Valor da compra registrada';
  if (mapping.valueMode === 'fixed' && mapping.conversionValue !== null) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: mapping.currency }).format(mapping.conversionValue);
  }
  return 'Sem valor';
}

function toPayload(mapping: Mapping, overrides: Partial<Mapping> = {}) {
  const next = { ...mapping, ...overrides };
  return {
    pipelineId: next.pipelineId,
    stageId: next.stageId,
    conversionActionResource: next.conversionActionResource,
    conversionActionName: next.conversionActionName,
    conversionCategory: next.conversionCategory,
    optimizationRole: next.optimizationRole,
    valueMode: next.valueMode,
    conversionValue: next.valueMode === 'fixed' ? next.conversionValue : null,
    currency: next.currency,
    triggerRule: next.triggerRule,
    enabled: next.enabled,
  };
}

export function GoogleFunnelCard() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [pipelineId, setPipelineId] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [recentEvents, setRecentEvents] = useState<FunnelEvent[]>([]);
  const [transportMode, setTransportMode] = useState<TransportMode>('off');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/integrations/google-funnel/mappings', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) {
        setUnavailable(payload.error || 'Não foi possível carregar o funil Google Ads.');
        return;
      }
      setUnavailable(null);
      const loaded: Pipeline[] = payload.pipelines || [];
      setPipelines(loaded);
      setMappings(payload.mappings || []);
      setRecentEvents(payload.recentEvents || []);
      setTransportMode(payload.transport?.mode === 'live' || payload.transport?.mode === 'dry_run' ? payload.transport.mode : 'off');
      setPipelineId((current) => (loaded.some((item) => item.id === current) ? current : loaded[0]?.id || ''));
    } catch {
      setUnavailable('Não foi possível carregar o funil Google Ads.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const pipeline = useMemo(() => pipelines.find((item) => item.id === pipelineId) || null, [pipelines, pipelineId]);
  const rows = useMemo(() => {
    if (!pipeline) return [];
    return pipeline.stages.flatMap((stage, index) => {
      const stageMappings = mappings.filter((mapping) => mapping.stageId === stage.id);
      if (stageMappings.length === 0) return [{ key: stage.id, order: index + 1, stage, mapping: null as Mapping | null }];
      return stageMappings.map((mapping) => ({ key: mapping.id, order: index + 1, stage, mapping: mapping as Mapping | null }));
    });
  }, [pipeline, mappings]);

  async function addMapping() {
    if (!pipeline || !form.stageId) {
      toast.error('Escolha a etapa do funil.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/integrations/google-funnel/mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipelineId: pipeline.id,
          stageId: form.stageId,
          conversionActionResource: form.conversionActionResource,
          conversionActionName: form.conversionActionName || null,
          conversionCategory: form.conversionCategory,
          optimizationRole: form.optimizationRole,
          valueMode: form.valueMode,
          conversionValue: form.valueMode === 'fixed' && form.conversionValue !== '' ? Number(form.conversionValue) : null,
          currency: form.currency,
          triggerRule: form.triggerRule,
          enabled: form.enabled,
        }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar a conversão.');
      toast.success('Conversão adicionada ao funil.');
      setForm(emptyForm);
      await load();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível salvar a conversão.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleMapping(mapping: Mapping) {
    setBusyId(mapping.id);
    try {
      const response = await fetch(`/api/integrations/google-funnel/mappings/${mapping.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(toPayload(mapping, { enabled: !mapping.enabled })),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível atualizar a conversão.');
      await load();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível atualizar a conversão.');
    } finally {
      setBusyId(null);
    }
  }

  async function removeMapping(mapping: Mapping) {
    if (!window.confirm('Remover esta conversão do funil? O histórico de eventos é preservado.')) return;
    setBusyId(mapping.id);
    try {
      const response = await fetch(`/api/integrations/google-funnel/mappings/${mapping.id}`, { method: 'DELETE' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível remover a conversão.');
      await load();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível remover a conversão.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="max-w-7xl px-6 pb-6">
      <section className="space-y-4 rounded-xl border bg-white p-5">
        <div>
          <h2 className="text-lg font-semibold">Google Ads — Funil de conversões</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Associe etapas do Kanban a ações de conversão que já existem na sua conta Google Ads. Etapas sem conversão são
            apenas internas.
          </p>
        </div>

        <div className={'rounded-lg border p-3 text-sm ' + TRANSPORT_NOTICES[transportMode].className}>
          {TRANSPORT_NOTICES[transportMode].text}
        </div>

        {loading && <p className="text-sm text-muted-foreground">Carregando...</p>}
        {!loading && unavailable && <p className="text-sm text-muted-foreground">{unavailable}</p>}

        {!loading && !unavailable && (
          <>
            <label className="block max-w-sm text-sm">
              <span className="mb-1 block font-medium">Pipeline</span>
              <select
                className="w-full rounded border p-2"
                value={pipelineId}
                onChange={(event) => {
                  setPipelineId(event.target.value);
                  setForm(emptyForm);
                }}
              >
                {pipelines.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>

            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Ordem</th>
                    <th className="p-2 text-left">Etapa</th>
                    <th className="p-2 text-left">Ação no Google Ads</th>
                    <th className="p-2 text-left">Tipo</th>
                    <th className="p-2 text-left">Otimização</th>
                    <th className="p-2 text-left">Valor</th>
                    <th className="p-2 text-left">Disparo</th>
                    <th className="p-2 text-left">Status</th>
                    <th className="p-2 text-left">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(({ key, order, stage, mapping }) => (
                    <tr key={key} className="border-t">
                      <td className="p-2">{order}</td>
                      <td className="p-2">{stage.name}</td>
                      {mapping ? (
                        <>
                          <td className="p-2">
                            <p>{mapping.conversionActionName || CATEGORY_LABELS[mapping.conversionCategory] || 'Conversão'}</p>
                            <p className="text-xs text-muted-foreground">{mapping.conversionActionResource}</p>
                          </td>
                          <td className="p-2">{CATEGORY_LABELS[mapping.conversionCategory] || mapping.conversionCategory}</td>
                          <td className="p-2">{ROLE_LABELS[mapping.optimizationRole] || mapping.optimizationRole}</td>
                          <td className="p-2">{describeValue(mapping)}</td>
                          <td className="p-2">{TRIGGER_LABELS[mapping.triggerRule] || mapping.triggerRule}</td>
                          <td className="p-2">{mapping.enabled ? 'Ativa' : 'Inativa'}</td>
                          <td className="space-x-2 p-2">
                            <button type="button" className="underline disabled:opacity-60" disabled={busyId === mapping.id} onClick={() => void toggleMapping(mapping)}>
                              {mapping.enabled ? 'Desativar' : 'Ativar'}
                            </button>
                            <button type="button" className="text-red-600 underline disabled:opacity-60" disabled={busyId === mapping.id} onClick={() => void removeMapping(mapping)}>
                              Remover
                            </button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="p-2 text-muted-foreground">—</td>
                          <td className="p-2 text-muted-foreground">Interna</td>
                          <td className="p-2 text-muted-foreground" colSpan={5}>—</td>
                        </>
                      )}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td className="p-4 text-muted-foreground" colSpan={9}>Nenhum pipeline com etapas ativas.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-lg border p-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium">Últimos eventos do Google Ads</h3>
                <button type="button" className="text-sm underline" onClick={() => void load()}>Atualizar</button>
              </div>
              {recentEvents.length === 0 ? (
                <p className="mt-2 text-sm text-muted-foreground">Nenhum evento registrado ainda.</p>
              ) : (
                <div className="mt-2 space-y-2 text-sm">
                  {recentEvents.map((event) => {
                    const stage = pipelines.flatMap((item) => item.stages).find((item) => item.id === event.stageId);
                    const mapping = mappings.find((item) => item.conversionActionResource === event.conversionActionResource);
                    return (
                      <div key={event.id} className="flex flex-wrap justify-between gap-x-3 gap-y-1 border-b pb-1">
                        <span>
                          google_ads · {mapping?.conversionActionName || event.conversionActionResource} · {stage?.name || 'etapa removida'}
                        </span>
                        <span className="text-muted-foreground">
                          {describeEventStatus(event)} · {eventDateTime.format(new Date(event.createdAt))}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {pipeline && (
              <div className="space-y-3 rounded-lg border p-4">
                <h3 className="font-medium">Adicionar conversão</h3>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="text-sm">
                    <span className="mb-1 block">Etapa</span>
                    <select className="w-full rounded border p-2" value={form.stageId} onChange={(event) => setForm({ ...form, stageId: event.target.value })}>
                      <option value="">Selecione</option>
                      {pipeline.stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}
                    </select>
                  </label>
                  <label className="text-sm md:col-span-2">
                    <span className="mb-1 block">Recurso da ação de conversão</span>
                    <input
                      className="w-full rounded border p-2"
                      placeholder="customers/1234567890/conversionActions/987654321"
                      value={form.conversionActionResource}
                      onChange={(event) => setForm({ ...form, conversionActionResource: event.target.value })}
                    />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block">Nome para exibição (opcional)</span>
                    <input className="w-full rounded border p-2" maxLength={120} value={form.conversionActionName} onChange={(event) => setForm({ ...form, conversionActionName: event.target.value })} />
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block">Tipo</span>
                    <select className="w-full rounded border p-2" value={form.conversionCategory} onChange={(event) => setForm({ ...form, conversionCategory: event.target.value })}>
                      {Object.entries(CATEGORY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block">Otimização</span>
                    <select className="w-full rounded border p-2" value={form.optimizationRole} onChange={(event) => setForm({ ...form, optimizationRole: event.target.value })}>
                      {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="text-sm">
                    <span className="mb-1 block">Valor</span>
                    <select className="w-full rounded border p-2" value={form.valueMode} onChange={(event) => setForm({ ...form, valueMode: event.target.value, conversionValue: '' })}>
                      <option value="none">Sem valor</option>
                      <option value="fixed">Valor fixo</option>
                      <option value="purchase">Valor da compra registrada</option>
                    </select>
                  </label>
                  {form.valueMode === 'fixed' && (
                    <label className="text-sm">
                      <span className="mb-1 block">Valor fixo ({form.currency})</span>
                      <input className="w-full rounded border p-2" type="number" min="0.01" step="0.01" value={form.conversionValue} onChange={(event) => setForm({ ...form, conversionValue: event.target.value })} />
                    </label>
                  )}
                  <label className="text-sm">
                    <span className="mb-1 block">Disparo</span>
                    <select className="w-full rounded border p-2" value={form.triggerRule} onChange={(event) => setForm({ ...form, triggerRule: event.target.value })}>
                      {Object.entries(TRIGGER_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 self-end rounded border p-2 text-sm">
                    <input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} />
                    Ativar ao salvar
                  </label>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use o recurso de uma ação de conversão criada na sua conta Google Ads. O FlipForm não cria nem altera
                  ações, campanhas ou lances. Principal ou secundária aqui registra a sua intenção; a definição efetiva
                  fica na ação de conversão dentro do Google Ads.
                </p>
                <button type="button" className="rounded bg-black px-4 py-2 text-white disabled:opacity-60" disabled={saving} onClick={() => void addMapping()}>
                  {saving ? 'Salvando...' : 'Adicionar conversão'}
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}

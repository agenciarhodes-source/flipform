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

type WhatsAppConnection = {
  status: string;
  wabaName?: string | null;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  qualityRating?: string | null;
} | null;

type ConnectionHealth = {
  state?: string;
  label?: string;
  summary?: string;
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
  name: 'Resposta automática no WhatsApp',
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

export function WhatsAppMessageAutomationClient({ canEdit }: { canEdit: boolean }) {
  const [rules, setRules] = useState<AutomationRule[]>([]);
  const [connection, setConnection] = useState<WhatsAppConnection>(null);
  const [health, setHealth] = useState<ConnectionHealth>(null);
  const [loading, setLoading] = useState(true);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);
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
      fetch('/api/integrations/whatsapp/message-automations', { cache: 'no-store' }),
      fetch('/api/integrations/whatsapp/connection', { cache: 'no-store' }),
    ]);

    if (rulesResult.status === 'fulfilled') {
      const payload = await responsePayload(rulesResult.value);
      if (rulesResult.value.ok) setRules(Array.isArray(payload.rules) ? payload.rules : []);
      else setRulesError(payload.error || 'Não foi possível carregar as automações.');
    } else {
      setRulesError('Não foi possível carregar as automações.');
    }

    if (connectionResult.status === 'fulfilled') {
      const payload = await responsePayload(connectionResult.value);
      if (connectionResult.value.ok) {
        setConnection(payload.connection || null);
        setHealth(payload.health || null);
      } else {
        setConnectionError(payload.error || 'Não foi possível verificar o WhatsApp.');
      }
    } else {
      setConnectionError('Não foi possível verificar o WhatsApp.');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeCount = useMemo(() => rules.filter(rule => rule.enabled).length, [rules]);
  const connected = connection?.status === 'connected';

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
        ? `/api/integrations/whatsapp/message-automations/${encodeURIComponent(editingRuleId)}`
        : '/api/integrations/whatsapp/message-automations';
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
      const response = await fetch(`/api/integrations/whatsapp/message-automations/${encodeURIComponent(rule.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadFromRule(rule, { enabled: !rule.enabled })),
      });
      const payload = await responsePayload(response);
      if (!response.ok) throw new Error(payload.error || 'Não foi possível alterar o status.');
      setRules(current => current.map(item => item.id === rule.id ? payload.rule : item));
      toast.success(rule.enabled ? 'Automação pausada.' : 'Automação ativada.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível alterar o status.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 lg:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-medium text-brand-700">Automações</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Mensagens do WhatsApp</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Defina uma palavra-chave recebida no WhatsApp e envie uma resposta automática pelo mesmo Automation Core.
          </p>
        </div>
        {canEdit && (
          <button type="button" onClick={openCreate} className="rounded-md bg-brand-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-700">
            Nova automação
          </button>
        )}
      </div>

      <div className={`rounded-xl border p-4 ${connected ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-slate-50 text-slate-800'}`}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold">
              {connectionError ? 'Status do WhatsApp indisponível' : connected ? 'WhatsApp conectado' : 'WhatsApp não conectado'}
            </p>
            <p className="mt-1 text-xs opacity-85">
              {connectionError || health?.summary || (connected
                ? [connection?.verifiedName || connection?.wabaName, connection?.displayPhoneNumber].filter(Boolean).join(' · ') || 'Conexão pronta para automações.'
                : 'Conecte o WhatsApp Business para executar respostas automáticas.')}
            </p>
          </div>
          <Link href="/integrations" className="w-fit rounded-md border border-current bg-white/70 px-3 py-2 text-xs font-medium">
            {connected ? 'Ver integração' : 'Conectar WhatsApp'}
          </Link>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border bg-card p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total</p><p className="mt-2 text-2xl font-semibold">{rules.length}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ativas</p><p className="mt-2 text-2xl font-semibold">{activeCount}</p></div>
        <div className="rounded-xl border bg-card p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Canal</p><p className="mt-2 text-sm font-semibold">WhatsApp · mensagem → resposta</p></div>
      </div>

      <section className="overflow-hidden rounded-xl border bg-card">
        <div className="border-b px-4 py-4 sm:px-5">
          <h2 className="font-semibold">Fluxos configurados</h2>
          <p className="mt-1 text-xs text-muted-foreground">A primeira automação ativa que combinar com a mensagem será executada.</p>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Carregando automações...</div>
        ) : rulesError ? (
          <div className="p-8 text-center"><p className="font-medium">Não foi possível carregar as automações</p><p className="mt-2 text-sm text-muted-foreground">{rulesError}</p><button type="button" onClick={() => void load()} className="mt-4 rounded-md border px-4 py-2 text-sm font-medium">Tentar novamente</button></div>
        ) : rules.length === 0 ? (
          <div className="p-8 text-center"><p className="font-medium">Nenhuma automação criada</p><p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">Crie uma resposta automática para mensagens como “quero saber mais”, “preço” ou outra palavra-chave.</p>{canEdit && <button type="button" onClick={openCreate} className="mt-4 rounded-md border px-4 py-2 text-sm font-medium">Criar primeira automação</button>}</div>
        ) : (
          <div className="divide-y">
            {rules.map((rule, index) => (
              <div key={rule.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${rule.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{rule.enabled ? 'Ativa' : 'Pausada'}</span><span className="text-xs text-muted-foreground">Prioridade {index + 1}</span></div>
                    <h3 className="mt-2 font-semibold">{rule.name}</h3>
                    <div className="mt-3 flex flex-col gap-2 text-sm sm:flex-row sm:items-center"><span className="rounded-md border bg-muted/40 px-2.5 py-1.5 font-medium">Mensagem: “{rule.keyword}”</span><span className="text-muted-foreground">→</span><span className="min-w-0 truncate rounded-md border bg-muted/40 px-2.5 py-1.5" title={rule.replyText}>Resposta: {rule.replyText}</span></div>
                    <p className="mt-2 text-xs text-muted-foreground">Correspondência: {rule.matchType === 'exact' ? 'mensagem exata' : 'contém a palavra ou frase'} · ordem {rule.orderIndex}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canEdit && <button type="button" onClick={() => void toggleRule(rule)} disabled={savingId === rule.id} className="rounded-md border px-3 py-2 text-sm font-medium disabled:opacity-50">{savingId === rule.id ? 'Salvando...' : rule.enabled ? 'Pausar' : 'Ativar'}</button>}
                    <button type="button" onClick={() => openEdit(rule)} className="rounded-md border px-3 py-2 text-sm font-medium">{canEdit ? 'Editar' : 'Visualizar'}</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editorOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" onMouseDown={closeEditor}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-background shadow-2xl sm:rounded-2xl" onMouseDown={event => event.stopPropagation()}>
            <form onSubmit={saveDraft}>
              <div className="border-b p-5 sm:p-6"><h2 className="text-lg font-semibold">{editingRuleId ? 'Editar automação' : 'Nova automação do WhatsApp'}</h2><p className="mt-1 text-sm text-muted-foreground">Configure o gatilho e a resposta automática.</p></div>
              <div className="space-y-5 p-5 sm:p-6">
                <label className="block"><span className="text-sm font-medium">Nome</span><input value={draft.name} onChange={event => setDraft(current => ({ ...current, name: event.target.value }))} disabled={!canEdit} maxLength={120} required className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-sm" /></label>
                <label className="block"><span className="text-sm font-medium">Palavra-chave ou frase</span><input value={draft.keyword} onChange={event => setDraft(current => ({ ...current, keyword: event.target.value }))} disabled={!canEdit} maxLength={160} required placeholder="Ex.: quero saber mais" className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-sm" /></label>
                <label className="block"><span className="text-sm font-medium">Correspondência</span><select value={draft.matchType} onChange={event => setDraft(current => ({ ...current, matchType: event.target.value as MatchType }))} disabled={!canEdit} className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-sm"><option value="contains">Contém a palavra ou frase</option><option value="exact">Mensagem exata</option></select></label>
                <label className="block"><span className="text-sm font-medium">Resposta automática</span><textarea value={draft.replyText} onChange={event => setDraft(current => ({ ...current, replyText: event.target.value }))} disabled={!canEdit} maxLength={4096} required rows={6} placeholder="Digite a mensagem que será enviada no WhatsApp." className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-sm" /></label>
                <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="text-sm font-medium">Ordem</span><input type="number" min={0} max={10000} value={draft.orderIndex} onChange={event => setDraft(current => ({ ...current, orderIndex: Number(event.target.value) }))} disabled={!canEdit} className="mt-2 w-full rounded-md border bg-background px-3 py-2.5 text-sm" /></label><label className="flex items-center gap-3 self-end rounded-md border px-3 py-2.5"><input type="checkbox" checked={draft.enabled} onChange={event => setDraft(current => ({ ...current, enabled: event.target.checked }))} disabled={!canEdit} /><span className="text-sm font-medium">Automação ativa</span></label></div>
              </div>
              <div className="flex justify-end gap-2 border-t p-5 sm:p-6"><button type="button" onClick={closeEditor} className="rounded-md border px-4 py-2 text-sm font-medium">Cancelar</button>{canEdit && <button type="submit" disabled={saving} className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{saving ? 'Salvando...' : 'Salvar automação'}</button>}</div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { WHATSAPP_CONNECTION_CHANGED_EVENT } from './connection-events';

type Template = {
  id: string | null;
  name: string;
  status: string;
  category: string | null;
  language: string | null;
};

type LoadState = 'loading' | 'ready' | 'not_connected' | 'unavailable' | 'error';

const STATUS_LABELS: Record<string, string> = {
  APPROVED: 'Aprovado',
  PENDING: 'Em análise',
  REJECTED: 'Rejeitado',
  PAUSED: 'Pausado',
  DISABLED: 'Desativado',
  IN_APPEAL: 'Em recurso',
  PENDING_DELETION: 'Exclusão pendente',
};

function statusLabel(status: string) {
  return STATUS_LABELS[status] || status;
}

function statusClasses(status: string) {
  if (status === 'APPROVED') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
  if (status === 'REJECTED' || status === 'DISABLED') return 'border-red-200 bg-red-50 text-red-800';
  if (status === 'PENDING' || status === 'IN_APPEAL') return 'border-amber-200 bg-amber-50 text-amber-800';
  return 'border-slate-200 bg-slate-50 text-slate-700';
}

function mergeTemplates(current: Template[], incoming: Template[]) {
  const byKey = new Map<string, Template>();
  for (const template of [...current, ...incoming]) {
    byKey.set(`${template.name}:${template.language || ''}`, template);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function WhatsAppTemplatesCard() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [state, setState] = useState<LoadState>('loading');
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<'UTILITY' | 'MARKETING'>('UTILITY');
  const [language, setLanguage] = useState<'pt_BR' | 'en_US'>('pt_BR');
  const [header, setHeader] = useState('');
  const [body, setBody] = useState('');
  const [footer, setFooter] = useState('');
  const requestSequence = useRef(0);

  const load = useCallback(async (options: { append?: boolean; cursor?: string | null; silent?: boolean } = {}) => {
    const requestId = ++requestSequence.current;
    const append = Boolean(options.append);
    if (append) setLoadingMore(true);
    else if (!options.silent) setState('loading');

    try {
      const url = new URL('/api/integrations/whatsapp/templates', window.location.origin);
      if (options.cursor) url.searchParams.set('after', options.cursor);
      const response = await fetch(url.toString(), { cache: 'no-store' });
      const data = await response.json();

      if (requestId !== requestSequence.current) return;

      if (response.status === 409) {
        setState('not_connected');
        setTemplates([]);
        setNextCursor(null);
        return;
      }
      if (response.status === 503) {
        setState('unavailable');
        setTemplates([]);
        setNextCursor(null);
        return;
      }
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os modelos.');

      const incoming = Array.isArray(data.templates) ? data.templates as Template[] : [];
      setTemplates(current => append ? mergeTemplates(current, incoming) : mergeTemplates([], incoming));
      setNextCursor(typeof data.nextCursor === 'string' ? data.nextCursor : null);
      setState('ready');
    } catch (error: any) {
      if (requestId !== requestSequence.current) return;
      setState('error');
      toast.error(error.message || 'Não foi possível carregar os modelos do WhatsApp.');
    } finally {
      if (requestId === requestSequence.current) setLoadingMore(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const handleConnectionChange = () => void load();
    window.addEventListener(WHATSAPP_CONNECTION_CHANGED_EVENT, handleConnectionChange);
    return () => window.removeEventListener(WHATSAPP_CONNECTION_CHANGED_EVENT, handleConnectionChange);
  }, [load]);

  const counters = useMemo(() => ({
    approved: templates.filter(item => item.status === 'APPROVED').length,
    pending: templates.filter(item => item.status === 'PENDING').length,
    rejected: templates.filter(item => item.status === 'REJECTED').length,
  }), [templates]);

  async function createTemplate() {
    const cleanName = name.trim().toLowerCase();
    if (!/^[a-z0-9_]+$/.test(cleanName)) {
      toast.error('O nome deve usar apenas letras minúsculas, números e _.');
      return;
    }
    if (!body.trim()) {
      toast.error('Escreva o texto principal do modelo.');
      return;
    }
    if ([header, body, footer].some(text => text.includes('{{') || text.includes('}}'))) {
      toast.error('Nesta primeira versão, crie o modelo sem variáveis como {{1}}.');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/integrations/whatsapp/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: cleanName,
          category,
          language,
          header: header.trim(),
          body: body.trim(),
          footer: footer.trim(),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível criar o modelo.');

      toast.success(`Modelo ${data.template?.name || cleanName} enviado para análise da Meta.`);
      setName('');
      setHeader('');
      setBody('');
      setFooter('');
      await load({ silent: true });
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível criar o modelo do WhatsApp.');
    } finally {
      setCreating(false);
    }
  }

  return <div className="px-6 pb-8 max-w-7xl">
    <div className="rounded-xl border bg-white p-5 space-y-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-lg">Modelos do WhatsApp</h2>
          <p className="text-sm text-muted-foreground">Consulte e crie modelos oficiais da conta de WhatsApp conectada a esta empresa.</p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded border px-3 py-2 text-sm disabled:opacity-60"
          onClick={() => void load()}
          disabled={state === 'loading' || loadingMore || creating}
        >
          <RefreshCw className={`h-4 w-4 ${state === 'loading' ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {state === 'not_connected' && <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">Conecte o WhatsApp desta empresa acima para listar e criar modelos.</div>}
      {state === 'unavailable' && <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">A plataforma ainda está concluindo a configuração universal necessária para gerenciar modelos do WhatsApp.</div>}
      {state === 'error' && <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">Não foi possível consultar os modelos agora. Use “Atualizar” para tentar novamente.</div>}
      {state === 'loading' && <p className="text-sm text-muted-foreground">Carregando modelos...</p>}

      {state === 'ready' && <>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Aprovados{nextCursor ? ' carregados' : ''}</p><p className="text-xl font-semibold">{counters.approved}</p></div>
          <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Em análise{nextCursor ? ' carregados' : ''}</p><p className="text-xl font-semibold">{counters.pending}</p></div>
          <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Rejeitados{nextCursor ? ' carregados' : ''}</p><p className="text-xl font-semibold">{counters.rejected}</p></div>
        </div>
        {nextCursor && <p className="text-xs text-muted-foreground">Contagens dos modelos carregados nesta tela. Use “Carregar mais” para incluir as próximas páginas da conta.</p>}

        <div className="space-y-2">
          {templates.length === 0 && <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Nenhum modelo encontrado nesta conta. Você pode criar o primeiro modelo abaixo.</div>}
          {templates.map(template => <div key={`${template.name}:${template.language || ''}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
            <div>
              <p className="font-medium text-sm">{template.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{template.category || 'Sem categoria'} · {template.language || 'Idioma não informado'}</p>
            </div>
            <span className={`rounded-full border px-2 py-1 text-xs font-medium ${statusClasses(template.status)}`}>{statusLabel(template.status)}</span>
          </div>)}
          {nextCursor && <button type="button" className="rounded border px-3 py-2 text-sm disabled:opacity-60" disabled={loadingMore} onClick={() => void load({ append: true, cursor: nextCursor })}>{loadingMore ? 'Carregando...' : 'Carregar mais'}</button>}
        </div>

        <div className="border-t pt-5">
          <div className="mb-4">
            <h3 className="font-semibold">Criar novo modelo</h3>
            <p className="mt-1 text-xs text-muted-foreground">Para o App Review, esta primeira versão cria modelos de texto sem variáveis. O modelo é enviado diretamente à Meta e não é copiado para o banco do FlipForm.</p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-1 text-sm">
              <span className="font-medium">Nome do modelo</span>
              <input value={name} onChange={event => setName(event.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))} maxLength={512} placeholder="ex: confirmacao_atendimento" className="w-full rounded border px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-600" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-sm">
                <span className="font-medium">Categoria</span>
                <select value={category} onChange={event => setCategory(event.target.value as 'UTILITY' | 'MARKETING')} className="w-full rounded border px-3 py-2">
                  <option value="UTILITY">Utilidade</option>
                  <option value="MARKETING">Marketing</option>
                </select>
              </label>
              <label className="space-y-1 text-sm">
                <span className="font-medium">Idioma</span>
                <select value={language} onChange={event => setLanguage(event.target.value as 'pt_BR' | 'en_US')} className="w-full rounded border px-3 py-2">
                  <option value="pt_BR">Português (Brasil)</option>
                  <option value="en_US">English (US)</option>
                </select>
              </label>
            </div>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium">Cabeçalho <span className="font-normal text-muted-foreground">(opcional)</span></span>
              <input value={header} onChange={event => setHeader(event.target.value.slice(0, 60))} maxLength={60} placeholder="Ex.: Atualização do seu atendimento" className="w-full rounded border px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-600" />
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium">Mensagem</span>
              <textarea value={body} onChange={event => setBody(event.target.value.slice(0, 1024))} maxLength={1024} rows={5} placeholder="Escreva a mensagem que será enviada para análise da Meta." className="w-full rounded border px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-600" />
              <span className="block text-right text-xs text-muted-foreground">{body.length}/1024</span>
            </label>
            <label className="space-y-1 text-sm md:col-span-2">
              <span className="font-medium">Rodapé <span className="font-normal text-muted-foreground">(opcional)</span></span>
              <input value={footer} onChange={event => setFooter(event.target.value.slice(0, 60))} maxLength={60} placeholder="Ex.: Equipe de atendimento" className="w-full rounded border px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-600" />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={createTemplate} disabled={creating || !name || !body.trim()} className="rounded bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{creating ? 'Enviando para a Meta...' : 'Criar modelo na Meta'}</button>
            <p className="text-xs text-muted-foreground">A Meta pode deixar o modelo como “Em análise” antes de aprová-lo.</p>
          </div>
        </div>
      </>}

      <p className="text-xs text-muted-foreground">Credenciais técnicas e identificadores internos da conta ficam somente no backend do FlipForm e não são exibidos nesta tela.</p>
    </div>
  </div>;
}

'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { FileSearch, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AgentDraft, KnowledgeMaster, KnowledgeMasterSummary } from '@/lib/flip-ai/policy';

type IndexStatus = { id: string; revision: number; status: string; chunkCount: number;
  completedBatches: number; totalBatches: number; inputTokens: number; lastErrorCode: string | null };
type PreviewHit = { id: string; heading: string | null; content: string; score: number };
type RetryPreview = { requestId: string; query: string };

export function KnowledgeMasterEditor({ agent, onClose, onSaved }: {
  agent: AgentDraft;
  onClose: () => void;
  onSaved: (summary: KnowledgeMasterSummary) => void;
}) {
  const [master, setMaster] = useState<KnowledgeMaster | null>(null);
  const [title, setTitle] = useState('Markdown Mestre');
  const [content, setContent] = useState('');
  const [index, setIndex] = useState<IndexStatus | null>(null);
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PreviewHit[]>([]);
  const [retryPreview, setRetryPreview] = useState<RetryPreview | null>(null);
  const [confirmIndexRetry, setConfirmIndexRetry] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [indexing, setIndexing] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);
  const dirty = master ? title !== master.title || content !== master.content : content.length > 0;
  const byteSize = new Blob([content]).size;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const masterResponse = await fetch(`/api/flip-ai/agents/${agent.id}/knowledge/master`, { cache: 'no-store', signal: controller.signal });
        const masterData = await masterResponse.json();
        if (!masterResponse.ok) throw new Error(masterData.error || 'Não foi possível carregar o Markdown Mestre.');
        const current = masterData.master as KnowledgeMaster | null;
        setMaster(current);
        if (current) {
          setTitle(current.title); setContent(current.content);
          const indexResponse = await fetch(`/api/flip-ai/agents/${agent.id}/knowledge/index`, { cache: 'no-store', signal: controller.signal });
          const indexData = await indexResponse.json();
          if (indexResponse.ok) setIndex(indexData.index as IndexStatus | null);
        }
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Falha ao carregar.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [agent.id]);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.md') || file.size > 1_000_000) {
      setMessage('Selecione um arquivo .md de até 1 MB.'); return;
    }
    setContent(await file.text());
    if (!master) setTitle(file.name.replace(/\.md$/i, '').slice(0, 120));
    setMessage('Arquivo carregado localmente. Salve para criar a revisão.');
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true; setSaving(true); setMessage('');
    try {
      const response = await fetch(`/api/flip-ai/agents/${agent.id}/knowledge/master`, { method: 'PUT',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, expectedRevision: master?.revision || 0 }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      const saved = data.master as KnowledgeMasterSummary;
      setMaster({ ...saved, content }); setIndex(null); setHits([]); onSaved(saved);
      setMessage(`Revisão ${saved.revision} salva. Agora processe a base.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão. Reabra o editor antes de tentar novamente.');
    } finally { inFlight.current = false; setSaving(false); }
  }

  async function processIndex(confirmAmbiguousRetry = false) {
    if (!master || dirty || indexing) return;
    setIndexing(true); setMessage('Processando a base…'); setConfirmIndexRetry(false);
    try {
      for (let step = 0; step < 50; step += 1) {
        const response = await fetch(`/api/flip-ai/agents/${agent.id}/knowledge/index`, { method: 'POST',
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ expectedRevision: master.revision,
            confirmAmbiguousRetry: step === 0 && confirmAmbiguousRetry }) });
        const data = await response.json();
        if (!response.ok) {
          if (data.code?.includes('AMBIGUOUS')) setConfirmIndexRetry(true);
          throw new Error(data.error || 'Não foi possível processar a base.');
        }
        const next = data.index as IndexStatus; setIndex(next);
        if (next.status === 'completed') { setMessage(`Base pronta: ${next.chunkCount} trechos indexados.`); return; }
        if (next.status === 'ambiguous') { setConfirmIndexRetry(true); setMessage('Um lote ficou incerto. Confirme antes de repetir.'); return; }
        if (next.status === 'processing') { setMessage('Já existe um lote em processamento. Aguarde antes de tentar novamente.'); return; }
        if (next.status !== 'pending') { setMessage(`Indexação interrompida: ${next.lastErrorCode || next.status}.`); return; }
      }
      setMessage('O processamento exige mais lotes. Clique para continuar.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha durante a indexação.');
    } finally { setIndexing(false); }
  }

  async function runPreview(request: RetryPreview, confirmRetry: boolean) {
    setPreviewing(true); setMessage('Consultando a base indexada…');
    try {
      const response = await fetch(`/api/flip-ai/agents/${agent.id}/knowledge/preview`, { method: 'POST',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...request, confirmRetry }) });
      const data = await response.json();
      if (!response.ok) {
        if (data.code?.includes('AMBIGUOUS') || data.code?.includes('RETRY')) setRetryPreview(request);
        throw new Error(data.error || 'Não foi possível testar a recuperação.');
      }
      setHits(data.preview.hits as PreviewHit[]); setRetryPreview(null);
      setMessage(data.preview.cached ? 'Resultado idempotente recuperado.' : `Teste concluído com ${data.preview.inputTokens} tokens.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha no teste da base.');
    } finally { setPreviewing(false); }
  }

  function preview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const request = { requestId: crypto.randomUUID(), query: query.trim() };
    setRetryPreview(null); void runPreview(request, false);
  }

  return <section className="rounded-lg border bg-card p-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-brand-600" aria-hidden="true" />
        <h2 className="text-lg font-medium">Markdown Mestre de {agent.name}</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">Fonte interna prioritária. Cada alteração cria uma revisão preservada.</p></div>
      <Button type="button" variant="outline" onClick={onClose} disabled={saving || indexing || previewing}>Fechar</Button>
    </div>
    {loading ? <p role="status">Carregando…</p> : <div className="space-y-6">
      <form onSubmit={save}><fieldset disabled={saving || indexing || previewing} className="space-y-4">
        <legend className="sr-only">Conteúdo da base de conhecimento</legend>
        <label className="block text-sm" htmlFor="master-title">Título
          <Input id="master-title" className="mt-1" required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label className="block text-sm" htmlFor="master-file">Importar arquivo Markdown
          <Input id="master-file" className="mt-1" type="file" accept=".md,text/markdown,text/plain" onChange={importFile} />
        </label>
        <label className="block text-sm" htmlFor="master-content">Conteúdo
          <textarea id="master-content" className="mt-1 min-h-80 w-full rounded-md border bg-background p-3 font-mono text-sm"
            required minLength={20} value={content} onChange={(event) => setContent(event.target.value)} />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={byteSize > 1_000_000}>{saving ? 'Salvando…' : master ? 'Criar nova revisão' : 'Salvar Markdown Mestre'}</Button>
          <span className="text-xs text-muted-foreground">{master ? `Revisão ${master.revision}` : 'Ainda não salvo'} · {byteSize.toLocaleString('pt-BR')} / 1.000.000 bytes</span>
        </div>
      </fieldset></form>

      {master ? <div className="rounded-md border p-4">
        <div className="flex flex-wrap items-center justify-between gap-3"><div>
          <h3 className="font-medium">Processamento da base</h3>
          <p className="text-sm text-muted-foreground">{index ? `${index.completedBatches}/${index.totalBatches} lotes · ${index.chunkCount} trechos · ${index.inputTokens} tokens` : 'Revisão ainda não processada'}</p>
        </div><div className="flex gap-2">
          <Button type="button" variant="outline" disabled={dirty || indexing || saving || previewing || index?.status === 'completed'} onClick={() => void processIndex(false)}>
            {indexing ? 'Processando…' : index ? 'Continuar processamento' : 'Processar base'}
          </Button>
          {confirmIndexRetry ? <Button type="button" variant="destructive" disabled={indexing} onClick={() => void processIndex(true)}>Confirmar nova tentativa</Button> : null}
        </div></div>
        {dirty ? <p className="mt-2 text-xs text-amber-700">Salve as alterações antes de processar.</p> : null}
      </div> : null}

      {index?.status === 'completed' ? <form onSubmit={preview} className="rounded-md border p-4">
        <div className="flex items-center gap-2"><FileSearch className="h-4 w-4" aria-hidden="true" /><h3 className="font-medium">Preview do que a IA encontra</h3></div>
        <p className="mt-1 text-sm text-muted-foreground">Faça uma pergunta e confira somente os trechos internos recuperados. Nenhuma resposta é gerada nesta etapa.</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row"><Input required minLength={3} maxLength={500} value={query}
          onChange={(event) => setQuery(event.target.value)} placeholder="Ex.: Qual é o horário de atendimento?" />
          <Button type="submit" disabled={previewing || !!retryPreview}>{previewing ? 'Consultando…' : 'Testar recuperação'}</Button></div>
        {retryPreview ? <Button className="mt-2" type="button" variant="destructive" disabled={previewing}
          onClick={() => void runPreview(retryPreview, true)}>Confirmar nova tentativa deste teste</Button> : null}
        {hits.length ? <ol className="mt-4 space-y-3">{hits.map((hit) => <li key={hit.id} className="rounded-md bg-muted/50 p-3">
          <div className="flex justify-between gap-3 text-xs text-muted-foreground"><span>{hit.heading || 'Markdown Mestre'}</span><span>{Math.max(0, hit.score * 100).toFixed(1)}%</span></div>
          <p className="mt-2 whitespace-pre-wrap text-sm">{hit.content}</p>
        </li>)}</ol> : null}
      </form> : null}
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
    </div>}
  </section>;
}

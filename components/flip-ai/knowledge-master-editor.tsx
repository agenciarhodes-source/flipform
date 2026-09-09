'use client';

import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { AgentDraft, KnowledgeMaster, KnowledgeMasterSummary } from '@/lib/flip-ai/policy';

export function KnowledgeMasterEditor({ agent, onClose, onSaved }: {
  agent: AgentDraft;
  onClose: () => void;
  onSaved: (summary: KnowledgeMasterSummary) => void;
}) {
  const [master, setMaster] = useState<KnowledgeMaster | null>(null);
  const [title, setTitle] = useState('Markdown Mestre');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const inFlight = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    async function loadMaster() {
      try {
        const response = await fetch(`/api/flip-ai/agents/${agent.id}/knowledge/master`, { cache: 'no-store', signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o Markdown Mestre.');
        const current = data.master as KnowledgeMaster | null;
        setMaster(current);
        if (current) { setTitle(current.title); setContent(current.content); }
      } catch (error) {
        if (!controller.signal.aborted) setMessage(error instanceof Error ? error.message : 'Falha ao carregar.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    loadMaster();
    return () => controller.abort();
  }, [agent.id]);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.md') || file.size > 1_000_000) {
      setMessage('Selecione um arquivo .md de até 1 MB.');
      return;
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
      const response = await fetch(`/api/flip-ai/agents/${agent.id}/knowledge/master`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content, expectedRevision: master?.revision || 0 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      const saved = data.master as KnowledgeMasterSummary;
      setMaster({ ...saved, content }); onSaved(saved);
      setMessage(`Revisão ${saved.revision} salva.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha de conexão. Reabra o editor antes de tentar novamente.');
    } finally { inFlight.current = false; setSaving(false); }
  }

  return <form onSubmit={save} className="rounded-lg border bg-card p-5">
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      <div><div className="flex items-center gap-2"><FileText className="h-5 w-5 text-brand-600" aria-hidden="true" />
        <h2 className="text-lg font-medium">Markdown Mestre de {agent.name}</h2></div>
        <p className="mt-1 text-sm text-muted-foreground">Fonte interna prioritária. Cada alteração cria uma revisão preservada.</p></div>
      <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Fechar</Button>
    </div>
    {loading ? <p role="status">Carregando…</p> : <fieldset disabled={saving} className="space-y-4">
      <legend className="sr-only">Conteúdo da base de conhecimento</legend>
      <label className="block text-sm" htmlFor="master-title">Título
        <Input id="master-title" className="mt-1" required minLength={3} maxLength={120} value={title} onChange={(event) => setTitle(event.target.value)} />
      </label>
      <label className="block text-sm" htmlFor="master-file">Importar arquivo Markdown
        <Input id="master-file" className="mt-1" type="file" accept=".md,text/markdown,text/plain" onChange={importFile} />
      </label>
      <label className="block text-sm" htmlFor="master-content">Conteúdo
        <textarea id="master-content" className="mt-1 min-h-80 w-full rounded-md border bg-background p-3 font-mono text-sm"
          required minLength={20} maxLength={500000} value={content} onChange={(event) => setContent(event.target.value)} />
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit">{saving ? 'Salvando…' : master ? 'Criar nova revisão' : 'Salvar Markdown Mestre'}</Button>
        <span className="text-xs text-muted-foreground">{master ? `Revisão atual: ${master.revision}` : 'Ainda não salvo'}</span>
      </div>
      <p role="status" aria-live="polite" className="text-sm">{message}</p>
    </fieldset>}
  </form>;
}

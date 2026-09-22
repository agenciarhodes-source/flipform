'use client';

import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { BarChart3, Bot, BookOpen, Globe2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { KnowledgeMasterEditor } from '@/components/flip-ai/knowledge-master-editor';
import { ExternalSourcesEditor } from '@/components/flip-ai/external-sources-editor';
import { agentDraftSchema, type AgentDraft, type AgentDraftInput, type AgentWorkspace } from '@/lib/flip-ai/policy';

type Editor = { id?: string; version?: number; requestId: string; input: AgentDraftInput };
const control = 'mt-1 w-full rounded-md border bg-background px-3 py-2 text-sm';
export function AgentDraftManager({ initialWorkspace }: { initialWorkspace: AgentWorkspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [message, setMessage] = useState('');
  const [knowledgeAgentId, setKnowledgeAgentId] = useState<string | null>(null);
  const [externalAgentId, setExternalAgentId] = useState<string | null>(null);
  const stages = workspace.pipelines.find((p) => p.id === editor?.input.pipelineId)?.stages || [];
  const rotations = workspace.rotations.filter((rotation) => rotation.pipelineId === editor?.input.pipelineId);

  function createDraft() {
    const pipeline = workspace.pipelines.find((p) => p.stages.length);
    setMessage('');
    setEditor({ requestId: crypto.randomUUID(), input: {
      name: '', description: '', primaryColor: '#2563EB', style: 'welcoming',
      pipelineId: pipeline?.id || '', initialStageId: pipeline?.stages[0]?.id || '', rotationId: null, slug: '',
    } });
  }
  function editDraft(agent: AgentDraft) {
    setMessage('');
    setEditor({ id: agent.id, version: agent.version, requestId: crypto.randomUUID(), input: {
      name: agent.name, description: agent.description, primaryColor: agent.primaryColor, style: agent.style,
      pipelineId: agent.pipelineId, initialStageId: agent.initialStageId, rotationId: agent.rotationId, slug: agent.slug,
    } });
  }
  function change<K extends keyof AgentDraftInput>(key: K, value: AgentDraftInput[K]) {
    setEditor((current) => current ? { ...current, input: { ...current.input, [key]: value } } : current);
  }
  async function reload() {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try {
      const response = await fetch('/api/flip-ai/agents', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar a lista.');
      setWorkspace(data); setEditor(null); setMessage('Lista atualizada.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha de conexão.'); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || inFlight.current) return;
    const parsed = agentDraftSchema.safeParse(editor.input);
    if (!parsed.success) { setMessage('Revise os campos e escolha um pipeline e uma etapa ativos.'); return; }
    inFlight.current = true; setBusy(true); setMessage('');
    try {
      const response = await fetch(editor.id ? '/api/flip-ai/agents/' + editor.id : '/api/flip-ai/agents', {
        method: editor.id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsed.data, ...(editor.id ? { version: editor.version } : { requestId: editor.requestId }) }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      const agent = data.agent as AgentDraft;
      setWorkspace((current) => ({ ...current, agents: [agent, ...current.agents.filter((item) => item.id !== agent.id)] }));
      setEditor(null); setMessage('Atendente salvo como rascunho.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha de conexão. Atualize a lista para conferir se o rascunho foi salvo.');
    } finally { inFlight.current = false; setBusy(false); }
  }

  return <section className="mx-auto max-w-5xl space-y-6 p-4 lg:p-6">
    <header className="flex flex-wrap items-start justify-between gap-4">
      <div><div className="mb-2 flex items-center gap-2 text-sm text-brand-600"><Bot className="h-5 w-5" aria-hidden="true" /> Premium</div>
        <h1 className="text-2xl font-semibold">Flip AI</h1><p className="mt-1 text-sm text-muted-foreground">Prepare os atendentes virtuais da sua empresa.</p></div>
      <div className="flex flex-wrap gap-2">
        <Link href="/flip-ai/usage" className="inline-flex h-10 items-center justify-center gap-2 rounded-md border bg-background px-4 py-2 text-sm font-medium hover:bg-muted">
          <BarChart3 className="h-4 w-4" aria-hidden="true" />Consumo
        </Link>
        <Button onClick={createDraft} disabled={busy || !!editor}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Novo atendente</Button>
      </div>
    </header>
    <div className="rounded-lg border bg-muted/40 p-4 text-sm">Os atendentes continuam em rascunho. Agora você pode cadastrar o Markdown Mestre; a publicação do chat permanece bloqueada.</div>
    <div className="flex flex-wrap items-center justify-between gap-3"><p role="status" aria-live="polite" className="text-sm">{message}</p>
      <Button variant="outline" disabled={busy} onClick={reload}>Atualizar lista</Button></div>
    {editor ? <form onSubmit={save} className="rounded-lg border bg-card p-5">
      <h2 className="mb-4 text-lg font-medium">{editor.id ? 'Editar atendente' : 'Novo atendente'}</h2>
      <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2"><legend className="sr-only">Identidade e destino do atendente</legend>
        <label className="text-sm" htmlFor="ai-name">Nome<Input className="mt-1" id="ai-name" required minLength={2} maxLength={80} autoComplete="off" value={editor.input.name} onChange={(e) => change('name', e.target.value)} placeholder="Helena" /></label>
        <label className="text-sm" htmlFor="ai-style">Estilo de conversa<select id="ai-style" className={control} value={editor.input.style} onChange={(e) => change('style', e.target.value as AgentDraftInput['style'])}>
          <option value="welcoming">Acolhedor</option><option value="professional">Profissional</option><option value="direct">Direto</option></select></label>
        <label className="text-sm sm:col-span-2" htmlFor="ai-description">Descrição interna<textarea id="ai-description" className={control} rows={3} maxLength={500} value={editor.input.description} onChange={(e) => change('description', e.target.value)} /></label>
        <label className="text-sm" htmlFor="ai-color">Cor de identidade<input id="ai-color" type="color" className="mt-1 block h-10 w-20 cursor-pointer rounded border" value={editor.input.primaryColor} onChange={(e) => change('primaryColor', e.target.value)} /></label>
        <label className="text-sm" htmlFor="ai-slug">Endereço reservado do chat<Input id="ai-slug" className="mt-1" required minLength={3} maxLength={64} pattern="[a-z0-9]+(-[a-z0-9]+)*" value={editor.input.slug} onChange={(e) => change('slug', e.target.value)} placeholder="helena-empresa" aria-describedby="ai-slug-help" />
          <span id="ai-slug-help" className="mt-1 block text-xs text-muted-foreground">Letras minúsculas, números e hífens. Reservar não publica o chat.</span></label>
        <label className="text-sm" htmlFor="ai-pipeline">Pipeline de destino<select id="ai-pipeline" className={control} required value={editor.input.pipelineId} onChange={(e) => {
          const pipelineId = e.target.value; setEditor((current) => current ? { ...current, input: { ...current.input, pipelineId, initialStageId: workspace.pipelines.find((p) => p.id === pipelineId)?.stages[0]?.id || '', rotationId: null } } : current);
        }}><option value="">Selecione</option>{workspace.pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="text-sm" htmlFor="ai-stage">Etapa inicial<select id="ai-stage" className={control} required value={editor.input.initialStageId} onChange={(e) => change('initialStageId', e.target.value)}>
          <option value="">Selecione</option>{stages.map((stage) => <option key={stage.id} value={stage.id}>{stage.name}</option>)}</select></label>
        <label className="text-sm sm:col-span-2" htmlFor="ai-rotation">Rodízio dos novos leads<select id="ai-rotation" className={control}
          value={editor.input.rotationId || ''} onChange={(e) => change('rotationId', e.target.value || null)}>
          <option value="">Sem rodízio automático</option>
          {rotations.map((rotation) => <option key={rotation.id} value={rotation.id} disabled={!rotation.enabled}>
            {rotation.name}{rotation.enabled ? '' : ' — desativado'}
          </option>)}
        </select><span className="mt-1 block text-xs text-muted-foreground">Reutiliza o rodízio já configurado em um formulário do mesmo pipeline.</span></label>
        {!stages.length ? <p className="text-sm text-muted-foreground sm:col-span-2">Configure um pipeline com etapas ativas para salvar o atendente.</p> : null}
        <div className="flex gap-2 sm:col-span-2"><Button type="submit">{busy ? 'Salvando…' : 'Salvar rascunho'}</Button><Button type="button" variant="outline" onClick={() => setEditor(null)}>Cancelar</Button></div>
      </fieldset>
    </form> : null}
    {externalAgentId ? <ExternalSourcesEditor
      agent={workspace.agents.find((agent) => agent.id === externalAgentId)!}
      onClose={() => setExternalAgentId(null)}
    /> : null}
    {knowledgeAgentId ? <KnowledgeMasterEditor
      agent={workspace.agents.find((agent) => agent.id === knowledgeAgentId)!}
      onClose={() => setKnowledgeAgentId(null)}
      onSaved={(knowledge) => setWorkspace((current) => ({ ...current, agents: current.agents.map((agent) =>
        agent.id === knowledgeAgentId ? { ...agent, knowledge } : agent) }))}
    /> : null}
    {!workspace.agents.length ? <div className="rounded-lg border border-dashed p-8 text-center"><h2 className="font-medium">Seu primeiro atendente começa aqui</h2>
      <p className="mt-2 text-sm text-muted-foreground">Defina sua identidade e o destino dos futuros leads no Kanban.</p></div> :
      <ul className="grid gap-4 md:grid-cols-2">{workspace.agents.map((agent) => <li key={agent.id} className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full border-2 font-semibold" style={{ borderColor: agent.primaryColor }}>{agent.name.slice(0, 2).toUpperCase()}</div>
          <div className="min-w-0"><h2 className="truncate font-medium">{agent.name}</h2><span className="text-xs text-muted-foreground">Rascunho</span></div></div>
        {agent.description ? <p className="mt-3 break-words text-sm text-muted-foreground">{agent.description}</p> : null}
        <p className="mt-3 break-all text-xs text-muted-foreground">Endereço reservado: /chat/{agent.slug}</p>
        <p className="mt-2 text-xs text-muted-foreground">{agent.knowledge ? `Markdown Mestre: revisão ${agent.knowledge.revision}` : 'Markdown Mestre ainda não cadastrado'}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || !!editor || !!knowledgeAgentId || !!externalAgentId} onClick={() => editDraft(agent)}>Editar {agent.name}</Button>
          <Button variant="outline" disabled={busy || !!editor || !!knowledgeAgentId || !!externalAgentId} onClick={() => setKnowledgeAgentId(agent.id)}>
            <BookOpen className="mr-2 h-4 w-4" aria-hidden="true" />Markdown Mestre
          </Button>
          <Button variant="outline" disabled={busy || !!editor || !!knowledgeAgentId || !!externalAgentId}
            onClick={() => setExternalAgentId(agent.id)}>
            <Globe2 className="mr-2 h-4 w-4" aria-hidden="true" />Fontes externas
          </Button>
        </div>
      </li>)}</ul>}
  </section>;
}

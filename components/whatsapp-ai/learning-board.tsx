'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Suggestion = {
  id: string; kind: string; origin: string; topic: string | null; title: string; content: string;
  example: string | null; conversationCount: number;
};
type Sync = { updated?: Array<{ name: string; revision: number }>; skipped?: string[] };

const KIND: Record<string, string> = {
  phrase: 'Frase que funcionou', objection: 'Objeção bem contornada', triage: 'Pergunta de triagem',
  explanation: 'Explicação simples', closing: 'Fechamento / próximo passo', avoid: 'O que evitar', other: 'Outra boa prática',
};
const ORIGIN: Record<string, string> = {
  human_success: 'Atendimento da equipe que deu certo',
  human_failure: 'Atendimento da equipe que não avançou',
  ai_review: 'Supervisão da IA',
};

function syncMessage(data: Sync) {
  const names = (data.updated || []).map((agent) => agent.name);
  const done = names.length ? `Atualizado no Markdown Mestre de: ${names.join(', ')}. Processe a base de cada um no Flip AI.` : 'Os atendentes já estavam atualizados.';
  return data.skipped?.length ? `${done} Sem Markdown Mestre: ${data.skipped.join(', ')}.` : done;
}

/** Company learnings: approving or removing one updates every attendant of the company. */
export function LearningBoard({ initial, approved: initialApproved, lastRunAt, agents }: {
  initial: Suggestion[]; approved: Suggestion[]; lastRunAt: string | null; agents: string[];
}) {
  const [items, setItems] = useState(initial);
  const [approved, setApproved] = useState(initialApproved);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, { title: string; content: string; topic: string }>>({});

  async function reload() {
    const list = await fetch('/api/flip/learning', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
    if (list?.pending) setItems(list.pending);
    if (list?.approved) setApproved(list.approved);
  }

  async function analyze() {
    setBusy('analyze');
    try {
      const response = await fetch('/api/flip/learning', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      toast.info(data.message || 'Análise concluída.');
      await reload();
    } finally {
      setBusy(null);
    }
  }

  async function sync() {
    setBusy('sync');
    try {
      const response = await fetch('/api/flip/learning/sync', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível aplicar.');
      toast.success(syncMessage(data));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível aplicar.');
    } finally {
      setBusy(null);
    }
  }

  async function decide(item: Suggestion, action: 'approve' | 'dismiss' | 'remove') {
    if (action === 'remove' && !window.confirm(`Remover "${item.title}" dos aprendizados de todos os atendentes?`)) return;
    setBusy(item.id);
    try {
      const edit = editing[item.id];
      const response = await fetch(`/api/flip/learning/${encodeURIComponent(item.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(edit && action === 'approve' ? edit : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir.');
      toast.success(action === 'dismiss' ? 'Sugestão descartada.' : syncMessage(data));
      await reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="text-sm text-muted-foreground">
          <p>Última análise: {lastRunAt ? new Date(lastRunAt).toLocaleString('pt-BR') : 'nenhuma ainda'}.</p>
          <p>Os aprendizados aprovados valem para todos os atendentes da empresa: {agents.length ? agents.join(', ') : 'nenhum atendente criado'}.</p>
        </div>
        <span className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => void sync()} disabled={busy !== null}>{busy === 'sync' ? 'Aplicando...' : 'Aplicar aprendizados aos atendentes'}</Button>
          <Button type="button" onClick={() => void analyze()} disabled={busy !== null}>{busy === 'analyze' ? 'Analisando...' : 'Analisar agora'}</Button>
        </span>
      </div>

      <h2 className="font-semibold">Sugestões para aprovar ({items.length})</h2>
      {items.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma sugestão pendente.</div>}
      {items.map((item) => {
        const edit = editing[item.id];
        return (
          <article key={item.id} className={`space-y-2 rounded-xl border bg-white p-4 shadow-sm ${item.kind === 'avoid' ? 'border-amber-300' : ''}`}>
            <p className="text-xs font-medium uppercase text-brand-700">
              {KIND[item.kind] || item.kind} · {item.topic || 'Geral'} · {ORIGIN[item.origin] || item.origin}
              {item.origin !== 'ai_review' ? ` · vista em ${item.conversationCount} conversa(s)` : ''}
            </p>
            {edit ? (
              <>
                <input className="w-full rounded border p-2 text-sm font-semibold" maxLength={80} value={edit.title}
                  onChange={(event) => setEditing((current) => ({ ...current, [item.id]: { ...edit, title: event.target.value } }))} />
                <textarea className="w-full rounded border p-2 text-sm" rows={4} maxLength={600} value={edit.content}
                  onChange={(event) => setEditing((current) => ({ ...current, [item.id]: { ...edit, content: event.target.value } }))} />
                <label className="block text-xs text-muted-foreground">Tema (Geral ou o serviço, ex.: Salário-maternidade)
                  <input className="mt-1 w-full rounded border p-2 text-sm" maxLength={40} value={edit.topic}
                    onChange={(event) => setEditing((current) => ({ ...current, [item.id]: { ...edit, topic: event.target.value } }))} />
                </label>
              </>
            ) : (
              <>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm">{item.content}</p>
              </>
            )}
            {item.example && <p className="rounded bg-slate-50 p-2 text-xs text-muted-foreground">{item.origin === 'ai_review' ? 'O que aconteceu: ' : 'Exemplo: '}{item.example}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={busy !== null} onClick={() => void decide(item, 'approve')}>{edit ? 'Salvar e aprovar' : 'Aprovar'}</Button>
              {!edit && <Button type="button" size="sm" variant="outline" disabled={busy !== null}
                onClick={() => setEditing((current) => ({ ...current, [item.id]: { title: item.title, content: item.content, topic: item.topic || 'Geral' } }))}>Editar</Button>}
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void decide(item, 'dismiss')}>Descartar</Button>
            </div>
          </article>
        );
      })}

      <h2 className="pt-2 font-semibold">Aprendizados aprovados da empresa ({approved.length})</h2>
      {approved.length === 0 && <p className="text-sm text-muted-foreground">Nenhum aprendizado aprovado ainda.</p>}
      <ul className="divide-y rounded-xl border bg-white">
        {approved.map((item) => (
          <li key={item.id} className="flex flex-wrap items-start justify-between gap-2 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">{item.topic || 'Geral'} · {item.kind === 'avoid' ? 'Evite' : 'Faça'}</p>
              <p className="text-sm font-medium">{item.title}</p>
              <p className="text-sm text-muted-foreground">{item.content}</p>
            </div>
            <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void decide(item, 'remove')}>Remover</Button>
          </li>
        ))}
      </ul>
    </div>
  );
}

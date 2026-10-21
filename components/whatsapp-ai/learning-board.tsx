'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Suggestion = { id: string; kind: string; title: string; content: string; example: string | null; conversationCount: number };
const KIND: Record<string, string> = {
  phrase: 'Frase que funcionou', objection: 'Objeção bem contornada', triage: 'Pergunta de triagem',
  explanation: 'Explicação simples', closing: 'Fechamento / próximo passo', other: 'Outra boa prática',
};

/** Suggestions from the human attendance; approving adds them to the Markdown Mestre as a new revision. */
export function LearningBoard({ initial, lastRunAt, approvedCount }: { initial: Suggestion[]; lastRunAt: string | null; approvedCount: number }) {
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState<Record<string, { title: string; content: string }>>({});

  async function analyze() {
    setBusy('analyze');
    try {
      const response = await fetch('/api/flip/learning', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      toast.info(data.message || 'Análise concluída.');
      const list = await fetch('/api/flip/learning', { cache: 'no-store' }).then((r) => r.json()).catch(() => null);
      if (list?.pending) setItems(list.pending);
    } finally {
      setBusy(null);
    }
  }

  async function decide(item: Suggestion, action: 'approve' | 'dismiss') {
    setBusy(item.id);
    try {
      const edit = editing[item.id];
      const response = await fetch(`/api/flip/learning/${encodeURIComponent(item.id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...(edit ? { title: edit.title, content: edit.content } : {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir.');
      toast.success(action === 'approve'
        ? `Adicionado ao Markdown Mestre (revisão ${data.revision}). Lembre de processar a base no Flip AI.`
        : 'Sugestão descartada.');
      setItems((current) => current.filter((row) => row.id !== item.id));
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
          <p>Última análise: {lastRunAt ? new Date(lastRunAt).toLocaleString('pt-BR') : 'nenhuma ainda'} · {approvedCount} aprendizado(s) já aprovados.</p>
          <p>A análise lê, sem dados pessoais, as conversas da última semana em que a equipe atendeu e o lead avançou ou fechou.</p>
        </div>
        <Button type="button" onClick={() => void analyze()} disabled={busy !== null}>{busy === 'analyze' ? 'Analisando...' : 'Analisar agora'}</Button>
      </div>
      {items.length === 0 && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma sugestão pendente.</div>}
      {items.map((item) => {
        const edit = editing[item.id];
        return (
          <article key={item.id} className="space-y-2 rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs font-medium uppercase text-brand-700">{KIND[item.kind] || item.kind} · vista em {item.conversationCount} conversa(s)</p>
            {edit ? (
              <>
                <input className="w-full rounded border p-2 text-sm font-semibold" maxLength={80} value={edit.title}
                  onChange={(event) => setEditing((current) => ({ ...current, [item.id]: { ...edit, title: event.target.value } }))} />
                <textarea className="w-full rounded border p-2 text-sm" rows={4} maxLength={600} value={edit.content}
                  onChange={(event) => setEditing((current) => ({ ...current, [item.id]: { ...edit, content: event.target.value } }))} />
              </>
            ) : (
              <>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm">{item.content}</p>
              </>
            )}
            {item.example && <p className="rounded bg-slate-50 p-2 text-xs text-muted-foreground">Exemplo: {item.example}</p>}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" disabled={busy !== null} onClick={() => void decide(item, 'approve')}>{edit ? 'Salvar e aprovar' : 'Aprovar'}</Button>
              {!edit && <Button type="button" size="sm" variant="outline" disabled={busy !== null}
                onClick={() => setEditing((current) => ({ ...current, [item.id]: { title: item.title, content: item.content } }))}>Editar</Button>}
              <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void decide(item, 'dismiss')}>Descartar</Button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

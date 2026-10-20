'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

const EXAMPLES = [
  'Quantos leads fecharam este mês?',
  'De onde vieram os leads da semana passada?',
  'Qual atendente converte mais nos últimos 30 dias?',
  'Quantos leads tenho em cada etapa?',
];

type Answer = { question: string; answer: string; filters: Record<string, string> | null };

/** A question in Portuguese about the company's numbers, answered from the system's own data. */
export function AskFlip() {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/flip/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: clean }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível responder agora.');
      setAnswers((current) => [{ question: clean, answer: data.answer, filters: data.filters || null }, ...current].slice(0, 5));
      setQuestion('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível responder agora.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className="space-y-3 rounded-xl border bg-white p-4 shadow-sm">
      <div>
        <h2 className="font-semibold">💬 Pergunte ao Flip</h2>
        <p className="text-xs text-muted-foreground">Pergunte sobre leads, fechamentos, origem, atendentes, vendas e pendências. O Flip responde com os números do sistema.</p>
      </div>
      <form className="flex gap-2" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
        <input className="min-w-0 flex-1 rounded border p-2 text-sm" value={question} maxLength={300}
          placeholder="Ex.: quantos leads de BPC fecharam este mês?" onChange={(event) => setQuestion(event.target.value)} />
        <Button type="submit" disabled={busy || !question.trim()}>{busy ? 'Pensando...' : 'Perguntar'}</Button>
      </form>
      {answers.length === 0 && (
        <div className="flex flex-wrap gap-1.5">
          {EXAMPLES.map((example) => (
            <button key={example} type="button" className="rounded-full border px-2.5 py-1 text-xs hover:bg-muted" onClick={() => void ask(example)}>{example}</button>
          ))}
        </div>
      )}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {answers.map((item, index) => (
        <div key={`${item.question}-${index}`} className="rounded-lg bg-slate-50 p-3">
          <p className="text-xs font-medium text-muted-foreground">{item.question}</p>
          <p className="mt-1 whitespace-pre-line text-sm">{item.answer}</p>
          {item.filters && (
            <p className="mt-1 text-[11px] text-muted-foreground">
              Considerado: {Object.entries(item.filters).map(([key, value]) => `${key === 'period' ? 'período' : key}: ${value}`).join(' · ')}
            </p>
          )}
        </div>
      ))}
    </article>
  );
}

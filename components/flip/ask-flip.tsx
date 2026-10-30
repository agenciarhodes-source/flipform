'use client';

import { useState } from 'react';
import { ArrowUp, Loader2, Search, Sparkles } from 'lucide-react';

const EXAMPLES = [
  'Quantos leads tivemos este mês?',
  'Como está o time de atendimento?',
  'De onde vieram os leads da semana passada?',
  'Quantos leads fecharam nos últimos 30 dias?',
  'Quantos leads tenho em cada etapa?',
  'O que está pendente agora?',
];

type Answer = { question: string; answer: string; filters: Record<string, string> | null };

/**
 * The Flip search: a question in Portuguese about the company's numbers, answered from the
 * system's own data. Shown at the top of the Flip page, like a search bar.
 */
export function AskFlip() {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    const clean = text.trim();
    if (!clean || busy) return;
    setBusy(true);
    setPending(clean);
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
      setPending(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-indigo-600 to-blue-600 px-5 py-8 text-white shadow-lg sm:px-10 sm:py-10">
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-10 h-56 w-56 rounded-full bg-fuchsia-400/20 blur-2xl" />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium tracking-wide">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Flip
          </p>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">O que você quer saber da sua operação?</h1>
          <p className="mt-1 text-sm text-white/80">Leads, fechamentos, origem, equipe, vendas e pendências, com os números do próprio sistema.</p>

          <form className="mt-6" onSubmit={(event) => { event.preventDefault(); void ask(question); }}>
            <label htmlFor="flip-question" className="sr-only">Pergunte ao Flip</label>
            <div className="flex items-center gap-2 rounded-2xl bg-white p-2 pl-4 text-slate-900 shadow-xl ring-1 ring-black/5 focus-within:ring-2 focus-within:ring-white/80">
              <Search className="h-5 w-5 shrink-0 text-slate-400" aria-hidden="true" />
              <input id="flip-question" className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-slate-400"
                value={question} maxLength={300} autoComplete="off"
                placeholder="Pergunte ao Flip: quantos leads tivemos este mês?"
                onChange={(event) => setQuestion(event.target.value)} />
              <button type="submit" disabled={busy || !question.trim()} aria-label="Perguntar"
                className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white transition hover:bg-indigo-700 disabled:opacity-40">
                {busy ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ArrowUp className="h-5 w-5" aria-hidden="true" />}
              </button>
            </div>
          </form>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {EXAMPLES.map((example) => (
              <button key={example} type="button" disabled={busy} onClick={() => void ask(example)}
                className="rounded-full bg-white/15 px-3 py-1.5 text-xs font-medium text-white ring-1 ring-white/25 transition hover:bg-white/25 disabled:opacity-50">
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {(pending || answers.length > 0) && (
        <div className="space-y-3" aria-live="polite">
          {pending && (
            <div className="flex items-center gap-3 rounded-2xl border bg-white p-4 shadow-sm">
              <Loader2 className="h-4 w-4 animate-spin text-indigo-600" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">Consultando os números para “{pending}”…</p>
            </div>
          )}
          {answers.map((item, index) => (
            <article key={`${item.question}-${index}`} className={`rounded-2xl border bg-white p-5 shadow-sm ${index === 0 ? 'border-indigo-200 ring-1 ring-indigo-100' : ''}`}>
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-indigo-600">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> {item.question}
              </p>
              <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-slate-800">{item.answer}</p>
              {item.filters && (
                <p className="mt-3 flex flex-wrap gap-1.5">
                  {Object.entries(item.filters).map(([key, value]) => (
                    <span key={key} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                      {key === 'period' ? 'período' : key}: {value}
                    </span>
                  ))}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

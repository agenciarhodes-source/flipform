'use client';

import { useEffect, useState } from 'react';
import { BookOpen, CircleHelp, Loader2, Search, X } from 'lucide-react';
import { findSupportAnswers, type SupportResult } from '@/lib/suporte-atendimento/question-answer';

export function DuvidasPanel() {
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [question, setQuestion] = useState('');
  const [results, setResults] = useState<SupportResult[] | null>(null);
  const [asking, setAsking] = useState(false);
  const [answerMode, setAnswerMode] = useState<'manual' | 'jev'>('manual');

  useEffect(() => {
    if (!open || manual !== null) return;
    const controller = new AbortController();
    setLoading(true);
    fetch('/api/suporte-atendimento/knowledge', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('O manual não está disponível para este acesso.');
        const data = await response.json();
        if (typeof data.content !== 'string') throw new Error('Formato do manual inválido.');
        setManual(data.content);
      })
      .catch((reason) => {
        if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o manual.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [open, manual]);

  const ask = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!manual || question.trim().length < 3 || asking) return;
    setAsking(true);
    setError('');
    try {
      const response = await fetch('/api/suporte-atendimento/ask', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }), cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível consultar.');
      setResults(Array.isArray(data.results) ? data.results : []);
      setAnswerMode(data.mode === 'jev' ? 'jev' : 'manual');
    } catch (reason) {
      setResults(findSupportAnswers(question, manual));
      setAnswerMode('manual');
      setError(reason instanceof Error ? reason.message : 'Usando consulta local do manual.');
    } finally { setAsking(false); }
  };

  return (
    <>
      {!open && <button type="button" onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg hover:opacity-95 focus-visible:outline focus-visible:outline-2"
        aria-label="Abrir Dúvidas do Atendimento">
        <CircleHelp aria-hidden="true" className="h-5 w-5" /> Dúvidas
      </button>}
      {open && <div className="fixed inset-0 z-50 flex justify-end">
        <button type="button" className="absolute inset-0 bg-black/30 md:bg-black/20"
          aria-label="Fechar dúvidas" onClick={() => setOpen(false)} />
        <aside role="dialog" aria-modal="true" aria-label="Dúvidas — suporte de atendimento"
          className="relative flex h-full w-full max-w-[440px] flex-col border-l bg-background shadow-2xl">
          <header className="flex items-center justify-between gap-3 border-b px-5 py-4">
            <div className="flex items-center gap-2">
              <CircleHelp className="h-5 w-5 text-primary" aria-hidden="true" />
              <div><h2 className="font-semibold">Dúvidas</h2><p className="text-xs text-muted-foreground">Suporte interno ao atendimento</p></div>
            </div>
            <button type="button" className="rounded-lg p-2 hover:bg-muted" aria-label="Fechar painel" onClick={() => setOpen(false)}><X className="h-5 w-5"/></button>
          </header>
          <div className="flex-1 space-y-4 overflow-auto p-5 text-sm" aria-live="polite">
            <div className="rounded-lg border bg-muted/30 p-3 text-xs text-muted-foreground">
              As respostas abaixo citam trechos do manual interno, não uma conclusão jurídica.
              A consulta usa somente o manual da empresa. O JEV pode classificar a dúvida se a equipe responsável habilitar esse recurso após revisão de privacidade. Nunca inclua dados pessoais do cliente.
            </div>
            {loading && <p className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Carregando manual...</p>}
            {error && <p className="rounded-lg border border-destructive/30 p-3 text-destructive">{error}</p>}
            {!loading && !results && <p>Pergunte sobre critérios, documentos, abordagem, provas rurais, BPC, salário-maternidade, empréstimos e outros assuntos do manual.</p>}
            {results && results.length > 0 && <p className="text-xs text-muted-foreground">{answerMode === 'jev' ? 'Capítulo identificado pelo JEV; resposta extraída do manual.' : 'Consulta textual ao manual.'}</p>}
            {results?.length === 0 && <p className="rounded-lg border p-3">Não encontrei uma orientação suficientemente próxima. Consulte o supervisor ou advogado responsável antes de responder ao cliente.</p>}
            {results?.map((item) => <section key={item.index} className="space-y-2 rounded-lg border p-4">
              <h3 className="flex gap-2 font-semibold"><BookOpen className="mt-0.5 h-4 w-4 shrink-0" />{item.title}</h3>
              <p className="whitespace-pre-line text-muted-foreground">{item.excerpt}</p>
              <p className="text-xs text-muted-foreground">Fonte: Manual interno — {item.title}</p>
            </section>)}
          </div>
          <form onSubmit={ask} className="border-t p-4">
            <label htmlFor="support-question" className="mb-2 block text-xs font-medium">Qual é a dúvida?</label>
            <textarea id="support-question" value={question} onChange={(event) => setQuestion(event.target.value)}
              rows={3} maxLength={1000} placeholder="Ex.: precisa de carteira assinada para receber salário-maternidade?"
              className="w-full resize-none rounded-lg border bg-background p-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <button type="submit" disabled={!manual || asking || question.trim().length < 3} className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 font-semibold text-primary-foreground disabled:opacity-50">
              {asking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} {asking ? 'Consultando...' : 'Perguntar'}
            </button>
          </form>
        </aside>
      </div>}
    </>
  );
}

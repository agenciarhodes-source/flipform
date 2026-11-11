'use client';

import { CheckCircle2, CircleAlert, CircleDashed, MessageSquareQuote, Sparkles } from 'lucide-react';

type Story = {
  headline: string;
  documents: { caseName: string; received: string[]; missing: string[]; problems: string[] } | null;
  timeline: Array<{ at: string; text: string }>;
  lastCustomerMessage: { at: string; text: string } | null;
  nextStep: string;
};

function when(iso: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso)).replace(',', '');
}

const clean = (label: string) => label.replace(/^[•\s]+/, '');

/** "Resumo do cliente": who, documents, what happened, last message and the next step. */
export function LeadStoryCard({ story }: { story: Story | null | undefined }) {
  if (!story) return null;
  const docs = story.documents;
  const total = docs ? docs.received.length + docs.missing.length + docs.problems.length : 0;
  return (
    <section className="space-y-3 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-700" aria-hidden="true" />
        <h3 className="font-heading text-sm font-semibold">Resumo do cliente</h3>
      </div>
      <p className="text-sm">{story.headline}</p>

      {docs && (
        <div className="rounded-lg border bg-white p-3 text-sm">
          <div className="font-medium">Documentos ({docs.received.length} de {total})</div>
          <ul className="mt-1 space-y-0.5">
            {docs.received.map((item) => (
              <li key={`r-${item}`} className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" aria-hidden="true" />{clean(item)}</li>
            ))}
            {docs.problems.map((item) => (
              <li key={`p-${item}`} className="flex items-center gap-1.5 text-amber-700"><CircleAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{clean(item)} (pedir de novo)</li>
            ))}
            {docs.missing.map((item) => (
              <li key={`m-${item}`} className="flex items-center gap-1.5 text-muted-foreground"><CircleDashed className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />{clean(item)}</li>
            ))}
          </ul>
        </div>
      )}

      {story.timeline.length > 0 && (
        <div className="rounded-lg border bg-white p-3 text-sm">
          <div className="font-medium">O que aconteceu</div>
          <ol className="mt-1 space-y-0.5">
            {story.timeline.map((event, index) => (
              <li key={index} className="flex gap-2">
                <span className="w-24 shrink-0 tabular-nums text-muted-foreground">{when(event.at)}</span>
                <span>{event.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}

      {story.lastCustomerMessage && (
        <div className="flex gap-2 rounded-lg border bg-white p-3 text-sm">
          <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div>
            <div className="text-xs text-muted-foreground">Última mensagem do cliente · {when(story.lastCustomerMessage.at)}</div>
            <div>“{story.lastCustomerMessage.text}”</div>
          </div>
        </div>
      )}

      <div className="rounded-lg border border-brand-200 bg-white p-3 text-sm">
        <span className="font-medium">Próximo passo: </span>{story.nextStep}
      </div>
    </section>
  );
}

'use client';

import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';
import { REVIEW_ISSUES, type ReviewIssue } from '@/lib/whatsapp-ai/review-rules';

type Review = {
  id: string; conversationId: string; contact: string; score: number; issues: ReviewIssue[];
  summary: string; suggestion: string | null; createdAt: string;
};
type Week = { reviewed: number; average: number; topIssues: Array<{ issue: ReviewIssue; label: string; count: number }> } | null;

const SCORE_STYLE = ['', 'bg-red-600', 'bg-red-500', 'bg-amber-500', 'bg-emerald-500', 'bg-emerald-600'];

/** The reviews of the AI's conversations, worst first, with what to improve. */
export function SupervisionBoard({ initial, week, reviewedNow }: { initial: Review[]; week: Week; reviewedNow: number }) {
  const [reviews, setReviews] = useState(initial);
  const [issue, setIssue] = useState<ReviewIssue | 'all'>('all');
  const visible = issue === 'all' ? reviews : reviews.filter((review) => review.issues.includes(issue));

  async function resolve(id: string) {
    const response = await fetch(`/api/whatsapp-ai/reviews/${encodeURIComponent(id)}`, { method: 'POST' }).catch(() => null);
    if (!response?.ok) {
      toast.error('Não foi possível marcar como resolvido.');
      return;
    }
    setReviews((current) => current.filter((review) => review.id !== id));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950">
        {week
          ? <>Últimos 7 dias: <strong>{week.reviewed}</strong> conversas revisadas, nota média <strong>{String(week.average).replace('.', ',')}</strong>.
            {week.topIssues.length > 0 && <> Problemas mais comuns: {week.topIssues.map((item) => `${item.label} (${item.count})`).join(', ')}.</>}</>
          : 'Nenhuma conversa da IA revisada nos últimos 7 dias.'}
        {reviewedNow > 0 && <span className="block text-xs text-violet-800">{reviewedNow} conversa(s) revisada(s) agora.</span>}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant={issue === 'all' ? 'default' : 'outline'} onClick={() => setIssue('all')}>Todas ({reviews.length})</Button>
        {(Object.keys(REVIEW_ISSUES) as ReviewIssue[]).map((key) => {
          const count = reviews.filter((review) => review.issues.includes(key)).length;
          return count ? (
            <Button key={key} type="button" size="sm" variant={issue === key ? 'default' : 'outline'} onClick={() => setIssue(key)}>{REVIEW_ISSUES[key]} ({count})</Button>
          ) : null;
        })}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma conversa para revisar agora.</div>
      ) : (
        <ul className="space-y-2">
          {visible.map((review) => (
            <li key={review.id} className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold text-white ${SCORE_STYLE[review.score]}`}>{review.score}</span>
                <span className="font-medium">{review.contact}</span>
                <span className="text-xs text-muted-foreground">{new Date(review.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="ml-auto flex gap-2">
                  <Link href={`/inbox?conversationId=${encodeURIComponent(review.conversationId)}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Abrir conversa</Link>
                  <Button type="button" size="sm" variant="outline" onClick={() => void resolve(review.id)}>Marcar como resolvido</Button>
                </span>
              </div>
              {review.issues.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {review.issues.map((item) => <span key={item} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{REVIEW_ISSUES[item]}</span>)}
                </div>
              )}
              <p className="mt-2 text-sm">{review.summary}</p>
              {review.suggestion && <p className="mt-1 rounded bg-amber-50 p-2 text-sm text-amber-900">💡 {review.suggestion}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

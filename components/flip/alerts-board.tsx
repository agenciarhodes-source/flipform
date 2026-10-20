'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { FlipAlert, FlipAlertKind } from '@/lib/flip/alert-rules';
import { DailyBriefingCard } from './daily-briefing';
import { FlipSuggestionsPanel } from './suggestions-panel';
import { AskFlip } from './ask-flip';

type Board = { seesTeam: boolean; alerts: FlipAlert[]; total: number; generatedAt: string };

const KIND_LABELS: Record<FlipAlertKind, { icon: string; label: string; hint: string }> = {
  unanswered_conversation: { icon: '💬', label: 'Conversas sem resposta', hint: 'O cliente escreveu há mais de 30 minutos e ninguém respondeu.' },
  overdue_task: { icon: '⏰', label: 'Retornos atrasados', hint: 'Tarefas com a data vencida e não concluídas.' },
  hot_lead_without_task: { icon: '🔥', label: 'Leads quentes sem próximo passo', hint: 'Leads quentes sem nenhuma tarefa marcada.' },
  new_lead_without_contact: { icon: '📥', label: 'Leads novos sem contato', hint: 'Chegaram há mais de 2 horas e ninguém mandou mensagem.' },
  stage_suggestion: { icon: '✨', label: 'Sugestões de etapa da IA', hint: 'A IA sugere mover estes leads; abra o lead para aprovar ou recusar.' },
  ai_review_problem: { icon: '🤖', label: 'Conversas da IA com problema', hint: 'Conversas que o Flip avaliou com nota 1 ou 2. Veja em Supervisão da IA.' },
  stale_lead: { icon: '🧊', label: 'Leads parados', hint: 'Mais de 3 dias na mesma etapa.' },
  overloaded_attendant: { icon: '⚖️', label: 'Atendentes sobrecarregadas', hint: 'Bem acima da média de leads em aberto da equipe.' },
};

/** The Flip: what is falling behind, by kind, with a link to act on each item. */
export function FlipAlertsBoard({ initial }: { initial: Board }) {
  const [board, setBoard] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [person, setPerson] = useState<string>('all');
  const [openKind, setOpenKind] = useState<FlipAlertKind | null>(null);

  async function reload() {
    setLoading(true);
    try {
      const response = await fetch('/api/flip/alerts', { cache: 'no-store' });
      if (response.ok) setBoard(await response.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    const timer = window.setInterval(() => void reload(), 120_000);
    return () => window.clearInterval(timer);
  }, []);

  const people = useMemo(() => {
    const totals = new Map<string, { name: string; count: number }>();
    for (const alert of board.alerts) {
      const key = alert.ownerId || 'none';
      const current = totals.get(key) || { name: alert.ownerName || 'Sem responsável', count: 0 };
      current.count += 1;
      totals.set(key, current);
    }
    return [...totals.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [board.alerts]);

  const visible = person === 'all' ? board.alerts : board.alerts.filter((alert) => (alert.ownerId || 'none') === person);
  const groups = (Object.keys(KIND_LABELS) as FlipAlertKind[])
    .map((kind) => ({ kind, items: visible.filter((alert) => alert.kind === kind) }))
    .filter((group) => group.items.length > 0);

  return (
    <section className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold"><Sparkles className="h-6 w-6 text-brand-600" aria-hidden="true" /> Flip</h1>
          <p className="text-sm text-muted-foreground">
            {board.seesTeam ? 'O que está ficando para trás na equipe.' : 'O que está ficando para trás com você.'} Atualizado {new Date(board.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
          <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </header>

      <DailyBriefingCard />

      <FlipSuggestionsPanel onApplied={() => void reload()} />

      <AskFlip />

      {board.seesTeam && people.length > 0 && (
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por pessoa">
          <Button type="button" size="sm" variant={person === 'all' ? 'default' : 'outline'} onClick={() => setPerson('all')}>Todos ({board.total})</Button>
          {people.map(([key, value]) => (
            <Button key={key} type="button" size="sm" variant={person === key ? 'default' : 'outline'} onClick={() => setPerson(key)}>
              {value.name} ({value.count})
            </Button>
          ))}
        </div>
      )}

      {groups.length > 0 && (
        <div>
          <h2 className="mb-2 font-semibold">Pendências</h2>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {groups.map((group) => (
              <button key={group.kind} type="button" onClick={() => setOpenKind((current) => (current === group.kind ? null : group.kind))}
                className={`rounded-lg border bg-white p-3 text-left shadow-sm transition hover:bg-slate-50 ${openKind === group.kind ? 'border-brand-600 ring-1 ring-brand-600' : ''}`}>
                <p className="text-2xl font-semibold">{group.items.length}</p>
                <p className="text-xs text-muted-foreground">{KIND_LABELS[group.kind].icon} {KIND_LABELS[group.kind].label}</p>
              </button>
            ))}
          </div>
        </div>
      )}

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="text-lg font-medium">Tudo em dia 🎉</p>
          <p className="text-sm text-muted-foreground">Nenhuma pendência no momento.</p>
        </div>
      ) : groups.map((group) => (
        <article key={group.kind} className="rounded-xl border bg-white shadow-sm">
          <button type="button" className="flex w-full items-start gap-2 px-4 py-3 text-left" aria-expanded={openKind === group.kind}
            onClick={() => setOpenKind((current) => (current === group.kind ? null : group.kind))}>
            {openKind === group.kind ? <ChevronDown className="mt-0.5 h-4 w-4 shrink-0" /> : <ChevronRight className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>
              <span className="block font-semibold">{KIND_LABELS[group.kind].icon} {KIND_LABELS[group.kind].label} ({group.items.length})</span>
              <span className="block text-xs text-muted-foreground">{KIND_LABELS[group.kind].hint}</span>
            </span>
          </button>
          {openKind === group.kind && <ul className="divide-y border-t">
            {group.items.map((alert) => (
              <li key={alert.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{alert.title}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {alert.detail}{board.seesTeam && alert.ownerName && alert.kind !== 'overloaded_attendant' ? ` · ${alert.ownerName}` : ''}
                  </p>
                </div>
                <Link href={alert.href} className="shrink-0 text-sm font-medium text-brand-700 underline">Abrir</Link>
              </li>
            ))}
          </ul>}
        </article>
      ))}
    </section>
  );
}

/** The number next to "Flip" in the side menu. */
export function FlipNavBadge() {
  const [total, setTotal] = useState(0);
  useEffect(() => {
    let alive = true;
    const load = () => fetch('/api/flip/alerts', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (alive && data) setTotal(Number(data.total) || 0); })
      .catch(() => undefined);
    void load();
    const timer = window.setInterval(load, 300_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, []);
  if (!total) return null;
  return (
    <span className="ml-auto min-w-[20px] rounded-full bg-amber-500 px-1.5 text-center text-[10px] font-semibold leading-5 text-white">
      {total > 99 ? '99+' : total}
    </span>
  );
}

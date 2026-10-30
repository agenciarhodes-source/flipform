'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, RefreshCw } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
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
  ai_review_problem: { icon: '🤖', label: 'Conversas da IA com problema', hint: 'Nota 1 ou 2, ou a IA inventou informação ou devia ter passado para uma pessoa. Veja em Supervisão da IA.' },
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

  const updatedAt = new Date(board.generatedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  return (
    <section className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
      <AskFlip />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Pendências</h2>
              <p className="text-sm text-muted-foreground">
                {board.seesTeam ? 'O que está ficando para trás na equipe.' : 'O que está ficando para trás com você.'} Atualizado às {updatedAt}.
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={loading}>
              <RefreshCw className={`mr-1.5 h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </header>

          {board.seesTeam && people.length > 0 && (
            <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por pessoa">
              <Button type="button" size="sm" className="rounded-full" variant={person === 'all' ? 'default' : 'outline'} onClick={() => setPerson('all')}>Todos ({board.total})</Button>
              {people.map(([key, value]) => (
                <Button key={key} type="button" size="sm" className="rounded-full" variant={person === key ? 'default' : 'outline'} onClick={() => setPerson(key)}>
                  {value.name} ({value.count})
                </Button>
              ))}
            </div>
          )}

          {groups.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {groups.map((group) => (
                <button key={group.kind} type="button" onClick={() => setOpenKind((current) => (current === group.kind ? null : group.kind))}
                  className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${openKind === group.kind ? 'border-indigo-500 ring-2 ring-indigo-100' : ''}`}>
                  <span className="text-xl" aria-hidden="true">{KIND_LABELS[group.kind].icon}</span>
                  <p className="mt-1 text-3xl font-semibold tracking-tight">{group.items.length}</p>
                  <p className="text-xs leading-snug text-muted-foreground">{KIND_LABELS[group.kind].label}</p>
                </button>
              ))}
            </div>
          )}

          {groups.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-white p-10 text-center">
              <p className="text-lg font-medium">Tudo em dia 🎉</p>
              <p className="text-sm text-muted-foreground">Nenhuma pendência no momento.</p>
            </div>
          ) : groups.map((group) => (
            <article key={group.kind} className="overflow-hidden rounded-2xl border bg-white shadow-sm">
              <button type="button" className="flex w-full items-start gap-2 px-4 py-3 text-left hover:bg-slate-50" aria-expanded={openKind === group.kind}
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
                    <Link href={alert.href} className={buttonVariants({ variant: 'outline', size: 'sm', className: 'shrink-0' })}>Abrir</Link>
                  </li>
                ))}
              </ul>}
            </article>
          ))}
        </div>

        <aside className="space-y-4">
          {board.seesTeam && (
            <Link href="/reports/diagnosis" className="group block overflow-hidden rounded-2xl bg-gradient-to-br from-slate-950 to-indigo-800 p-5 text-white shadow-sm transition hover:shadow-md">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-200">Diagnóstico de atendimento</p>
              <p className="mt-1 font-semibold">Como a equipe está atendendo?</p>
              <p className="mt-1 text-sm text-indigo-100">A IA lê as conversas da equipe e escreve o que melhorar. Dá para baixar em PDF.</p>
              <p className="mt-3 text-sm font-medium text-white group-hover:underline">Abrir diagnóstico →</p>
            </Link>
          )}
          <DailyBriefingCard />
          <FlipSuggestionsPanel onApplied={() => void reload()} />
        </aside>
      </div>
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

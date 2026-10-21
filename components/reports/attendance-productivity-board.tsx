'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { formatDuration } from '@/lib/reports/attendance-productivity-rules';

type Row = {
  userId: string;
  name: string;
  conversations: number;
  messages: number;
  responses: number;
  medianResponseMs: number | null;
  firstResponseMedianMs: number | null;
  within15MinPct: number | null;
  waitingNow: number;
  leadsReceived: number;
  leadsAdvanced: number;
  sales: number;
  lost: number;
  conversionPct: number | null;
};
type Review = {
  createdAt: string;
  days: number;
  summary: string;
  attendants: Array<{ userId: string; name: string; score: number; strengths: string[]; improvements: string[]; example: string | null }>;
};
type Report = { days: number; truncated: boolean; rows: Row[]; review: Review | null; canReview: boolean };

const PERIODS = [7, 30, 90];

function best<T>(rows: T[], value: (row: T) => number | null, lower = false) {
  const scored = rows.filter((row) => value(row) !== null);
  if (!scored.length) return null;
  return scored.reduce((top, row) => {
    const a = value(row) as number;
    const b = value(top) as number;
    return (lower ? a < b : a > b) ? row : top;
  });
}

function scoreClass(score: number) {
  if (score >= 8) return 'bg-emerald-100 text-emerald-800';
  if (score >= 5) return 'bg-amber-100 text-amber-800';
  return 'bg-red-100 text-red-800';
}

/** Productivity of the human attendance: speed, volume, results and the AI evaluation of the approach. */
export function AttendanceProductivityBoard() {
  const [days, setDays] = useState(30);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async (period: number) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/reports/attendance-productivity?days=${period}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) throw new Error(data?.error || 'Não foi possível carregar o relatório.');
      setReport(data as Report);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível carregar o relatório.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(days); }, [days, load]);

  async function generateReview() {
    setReviewing(true);
    try {
      const response = await fetch('/api/reports/attendance-productivity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível gerar a análise.');
      setReport((current) => (current ? { ...current, review: data.review } : current));
      toast.success('Análise da abordagem pronta.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar a análise.');
    } finally {
      setReviewing(false);
    }
  }

  const rows = report?.rows || [];
  const fastest = best(rows.filter((row) => row.responses >= 3), (row) => row.medianResponseMs, true);
  const converts = best(rows.filter((row) => row.leadsReceived >= 3), (row) => row.conversionPct);
  const needsHelp = best(rows, (row) => (row.waitingNow > 0 ? row.waitingNow : null));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
        {PERIODS.map((period) => (
          <Button key={period} type="button" size="sm" className="h-7 rounded-full px-3" variant={days === period ? 'default' : 'outline'}
            onClick={() => setDays(period)}>Últimos {period} dias</Button>
        ))}
        {loading ? <span className="text-xs text-muted-foreground">Carregando...</span> : null}
      </div>

      {rows.length > 1 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Responde mais rápido</p>
            <p className="font-semibold">{fastest ? fastest.name : '—'}</p>
            <p className="text-xs text-muted-foreground">{fastest ? `${formatDuration(fastest.medianResponseMs)} por resposta (mediana)` : 'Poucas respostas no período'}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Converte mais</p>
            <p className="font-semibold">{converts ? converts.name : '—'}</p>
            <p className="text-xs text-muted-foreground">{converts ? `${converts.conversionPct}% dos leads recebidos viraram venda` : 'Poucos leads no período'}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">Precisa de apoio agora</p>
            <p className="font-semibold">{needsHelp ? needsHelp.name : 'Ninguém'}</p>
            <p className="text-xs text-muted-foreground">{needsHelp ? `${needsHelp.waitingNow} cliente(s) esperando resposta há mais de 30 min` : 'Nenhum cliente esperando'}</p>
          </div>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted text-xs">
            <tr>
              <th className="p-2 text-left">Atendente</th>
              <th className="p-2 text-right" title="Conversas de WhatsApp em que a pessoa respondeu no período">Conversas</th>
              <th className="p-2 text-right">Mensagens</th>
              <th className="p-2 text-right" title="Tempo até a primeira resposta da conversa (mediana)">1ª resposta</th>
              <th className="p-2 text-right" title="Tempo entre a mensagem do cliente e a resposta (mediana)">Tempo de resposta</th>
              <th className="p-2 text-right" title="Respostas enviadas em até 15 minutos">Até 15 min</th>
              <th className="p-2 text-right" title="Clientes das conversas da pessoa esperando resposta há mais de 30 minutos">Esperando agora</th>
              <th className="p-2 text-right" title="Leads atribuídos à pessoa que entraram no período">Leads</th>
              <th className="p-2 text-right" title="Mudanças de etapa feitas pela pessoa">Avançou</th>
              <th className="p-2 text-right" title="Leads que chegaram na etapa final no período">Vendas</th>
              <th className="p-2 text-right">Perdidos</th>
              <th className="p-2 text-right" title="Vendas ÷ leads recebidos no período">Conversão</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-t">
                <td className="p-2 font-medium">{row.name}</td>
                <td className="p-2 text-right">{row.conversations}</td>
                <td className="p-2 text-right">{row.messages}</td>
                <td className="p-2 text-right">{formatDuration(row.firstResponseMedianMs)}</td>
                <td className="p-2 text-right">{formatDuration(row.medianResponseMs)}</td>
                <td className="p-2 text-right">{row.within15MinPct === null ? '—' : `${row.within15MinPct}%`}</td>
                <td className={`p-2 text-right ${row.waitingNow ? 'font-semibold text-red-600' : ''}`}>{row.waitingNow}</td>
                <td className="p-2 text-right">{row.leadsReceived}</td>
                <td className="p-2 text-right">{row.leadsAdvanced}</td>
                <td className="p-2 text-right">{row.sales}</td>
                <td className="p-2 text-right">{row.lost}</td>
                <td className="p-2 text-right">{row.conversionPct === null ? '—' : `${row.conversionPct}%`}</td>
              </tr>
            ))}
            {!loading && rows.length === 0 ? (
              <tr><td className="p-4 text-muted-foreground" colSpan={12}>Nenhum atendimento da equipe no período.</td></tr>
            ) : null}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Tempos contados do momento em que o cliente escreveu até a resposta da pessoa, inclusive fora do expediente; por isso usamos a mediana.
        Respostas da IA e as enviadas pelo celular encerram a espera, mas não contam para ninguém.
        {report?.truncated ? ' Período com muitas mensagens: os números consideram as mais recentes.' : ''}
      </p>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">Análise da abordagem (IA)</h2>
            <p className="text-sm text-muted-foreground">
              A IA lê algumas conversas recentes de cada pessoa (sem dados dos clientes) e avalia acolhimento, triagem, clareza,
              rapidez, objeções e condução ao próximo passo. Usa créditos do Flip AI.
            </p>
          </div>
          {report?.canReview ? (
            <Button type="button" size="sm" disabled={reviewing || loading} onClick={() => void generateReview()}>
              {reviewing ? 'Analisando...' : `Gerar análise dos últimos ${days} dias`}
            </Button>
          ) : null}
        </div>
        {report?.review ? (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Gerada em {new Date(report.review.createdAt).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              {' '}· últimos {report.review.days} dias
            </p>
            {report.review.summary ? <p className="text-sm">{report.review.summary}</p> : null}
            <div className="grid gap-3 md:grid-cols-2">
              {report.review.attendants.map((entry) => (
                <div key={entry.userId} className="space-y-2 rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-medium">{entry.name}</p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${scoreClass(entry.score)}`}>Nota {entry.score}/10</span>
                  </div>
                  {entry.strengths.length ? (
                    <div>
                      <p className="text-xs font-semibold text-emerald-700">Pontos fortes</p>
                      <ul className="list-disc pl-5 text-sm">{entry.strengths.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  ) : null}
                  {entry.improvements.length ? (
                    <div>
                      <p className="text-xs font-semibold text-amber-700">O que melhorar</p>
                      <ul className="list-disc pl-5 text-sm">{entry.improvements.map((item) => <li key={item}>{item}</li>)}</ul>
                    </div>
                  ) : null}
                  {entry.example ? <p className="rounded bg-muted p-2 text-xs italic">{entry.example}</p> : null}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhuma análise gerada ainda.</p>
        )}
      </section>
    </div>
  );
}

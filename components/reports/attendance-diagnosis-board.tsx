'use client';

import { useEffect, useState } from 'react';
import { Download, Loader2, MessagesSquare, Sparkles, Timer, Trophy, UserRoundCheck, Users } from 'lucide-react';
import { formatDuration } from '@/lib/reports/attendance-productivity-rules';
import { DIAGNOSIS_PERIODS, type StoredDiagnosis } from '@/lib/reports/attendance-diagnosis-rules';

/** The diagnosis split into paragraphs (blank line between them). */
export function diagnosisParagraphs(text: string) {
  return text.split(/\n\s*\n/).map((part) => part.replace(/\n/g, ' ').trim()).filter(Boolean);
}

export function diagnosisKpis(diagnosis: StoredDiagnosis) {
  const team = diagnosis.team;
  return [
    { icon: MessagesSquare, label: 'Conversas atendidas', value: new Intl.NumberFormat('pt-BR').format(team.conversations) },
    { icon: Timer, label: 'Tempo típico de resposta', value: formatDuration(team.typicalResponseMs) },
    { icon: UserRoundCheck, label: 'Respondidas em até 15 min', value: team.within15MinPct === null ? '—' : `${team.within15MinPct}%` },
    { icon: Users, label: 'Esperando resposta agora', value: new Intl.NumberFormat('pt-BR').format(team.waitingNow) },
    { icon: Trophy, label: 'Fechados no período', value: new Intl.NumberFormat('pt-BR').format(team.sales) },
  ];
}

/** "Diagnóstico de atendimento": one written diagnosis of the team, with its numbers and a PDF. */
export function AttendanceDiagnosisBoard() {
  const [diagnosis, setDiagnosis] = useState<StoredDiagnosis | null>(null);
  const [canGenerate, setCanGenerate] = useState(false);
  const [days, setDays] = useState<number>(30);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/reports/attendance-diagnosis', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!alive || !data) return;
        setDiagnosis(data.diagnosis || null);
        setCanGenerate(Boolean(data.canGenerate));
        if (data.diagnosis?.days) setDays(data.diagnosis.days);
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  async function generate() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/reports/attendance-diagnosis', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ days }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível gerar o diagnóstico agora.');
      setDiagnosis(data.diagnosis || null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível gerar o diagnóstico agora.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-indigo-950 to-indigo-700 p-6 text-white shadow-lg sm:p-8">
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-indigo-400/20 blur-3xl" />
        <div className="relative flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium tracking-wide">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Flip · Diagnóstico de atendimento
            </p>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{diagnosis?.title || 'Como a sua equipe está atendendo'}</h1>
            <p className="mt-2 text-sm text-indigo-100">
              {diagnosis?.overall || 'A IA lê as conversas atendidas pela equipe no WhatsApp e no Instagram e escreve um diagnóstico: o que funciona, o que pesa contra o resultado e o que ajustar.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canGenerate && (
              <div className="flex rounded-xl bg-white/10 p-1" role="group" aria-label="Período">
                {DIAGNOSIS_PERIODS.map((option) => (
                  <button key={option} type="button" onClick={() => setDays(option)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${days === option ? 'bg-white text-indigo-900' : 'text-white/80 hover:bg-white/10'}`}>
                    {option} dias
                  </button>
                ))}
              </div>
            )}
            {canGenerate && (
              <button type="button" onClick={() => void generate()} disabled={busy}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-indigo-900 shadow transition hover:bg-indigo-50 disabled:opacity-60">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
                {busy ? 'Analisando conversas…' : diagnosis ? 'Gerar novo diagnóstico' : 'Gerar diagnóstico'}
              </button>
            )}
            {diagnosis && (
              <a href="/report/attendance-diagnosis" target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-sm font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/20">
                <Download className="h-4 w-4" aria-hidden="true" /> Baixar PDF
              </a>
            )}
          </div>
        </div>
      </div>

      {error && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {canGenerate && <p className="text-xs text-muted-foreground">Cada diagnóstico consome créditos do Flip AI e pode ser gerado uma vez por hora. Nenhum dado de cliente é mostrado no texto.</p>}

      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border bg-white p-12 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando o último diagnóstico…
        </div>
      ) : !diagnosis ? (
        <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
          <p className="text-lg font-medium">Ainda não há diagnóstico</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {canGenerate ? 'Escolha o período e clique em "Gerar diagnóstico".' : 'Peça ao dono ou a um administrador da empresa para gerar o primeiro diagnóstico.'}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {diagnosisKpis(diagnosis).map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-2xl border bg-white p-4 shadow-sm">
                <Icon className="h-5 w-5 text-indigo-600" aria-hidden="true" />
                <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
                <p className="text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </div>

          <article className="rounded-3xl border bg-white p-6 shadow-sm sm:p-10">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-indigo-600">Diagnóstico · últimos {diagnosis.days} dias</p>
            <div className="mt-4 max-w-3xl space-y-4 text-[15px] leading-7 text-slate-800">
              {diagnosisParagraphs(diagnosis.text).map((paragraph, index) => (
                <p key={index} className={index === 0 ? 'text-base font-medium text-slate-900' : ''}>{paragraph}</p>
              ))}
            </div>
            <p className="mt-8 border-t pt-4 text-xs text-muted-foreground">
              Gerado em {new Date(diagnosis.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} pelo Flip, a partir de {diagnosis.team.attendants} {diagnosis.team.attendants === 1 ? 'pessoa' : 'pessoas'} da equipe. O tempo de resposta é medido no WhatsApp e não conta a IA.
            </p>
          </article>
        </>
      )}
    </div>
  );
}

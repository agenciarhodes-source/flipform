import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AlertTriangle, ArrowLeft, AudioLines, Bot, CircleDollarSign } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { FlipAiError } from '@/lib/flip-ai/access';
import {
  FLIP_AI_USAGE_PERIODS,
  getFlipAiUsageDashboard,
  parseFlipAiUsagePeriod,
} from '@/lib/flip-ai/usage';

export const dynamic = 'force-dynamic';

const number = new Intl.NumberFormat('pt-BR');
const dateTime = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Sao_Paulo',
});

const STATUS_LABELS: Record<string, string> = {
  confirmed: 'Confirmado',
  processing: 'Em processamento',
  ambiguous: 'Resultado incerto',
  failed: 'Falhou',
};

function statusClass(status: string) {
  if (status === 'confirmed') return 'bg-emerald-50 text-emerald-700';
  if (status === 'ambiguous') return 'bg-amber-50 text-amber-800';
  if (status === 'failed') return 'bg-red-50 text-red-700';
  return 'bg-slate-100 text-slate-700';
}

export default async function FlipAiUsagePage({
  searchParams,
}: {
  searchParams?: { days?: string | string[] };
}) {
  const session = await getSession();
  if (!session) redirect('/login');
  const periodDays = parseFlipAiUsagePeriod(searchParams?.days);

  try {
    const usage = await getFlipAiUsageDashboard(session, periodDays);
    return <section className="mx-auto max-w-6xl space-y-6 p-4 lg:p-6">
      <header className="space-y-3">
        <Link href="/flip-ai" className="inline-flex items-center gap-2 text-sm text-brand-600 hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />Voltar aos atendentes
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-sm text-brand-600">
              <CircleDollarSign className="h-5 w-5" aria-hidden="true" /> Premium
            </div>
            <h1 className="text-2xl font-semibold">Consumo do Flip AI</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Operações técnicas confirmadas da sua empresa, sem misturar dados de outros tenants.
            </p>
          </div>
          <nav className="flex rounded-lg border bg-card p-1" aria-label="Período do consumo">
            {FLIP_AI_USAGE_PERIODS.map((days) => <Link key={days} href={`/flip-ai/usage?days=${days}`}
              aria-current={days === usage.periodDays ? 'page' : undefined}
              className={days === usage.periodDays
                ? 'rounded-md bg-brand-600 px-3 py-2 text-sm font-medium text-white'
                : 'rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted'}>
              {days} dias
            </Link>)}
          </nav>
        </div>
      </header>

      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950">
        <div className="flex gap-3"><AudioLines className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <div><p className="font-medium">Leitura operacional, ainda sem débito financeiro</p>
            <p className="mt-1">Somente eventos confirmados entram nos totais. “Sessão de voz emitida” registra a credencial Realtime criada; ainda não representa os tokens finais de áudio. A carteira futura não utilizará esse número como cobrança.</p></div>
        </div>
      </div>

      {(usage.totals.ambiguousOperations > 0 || usage.totals.processingOperations > 0) &&
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <div className="flex gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            <p><strong>{number.format(usage.totals.ambiguousOperations)}</strong> resultado(s) incerto(s) e <strong>{number.format(usage.totals.processingOperations)}</strong> em processamento permanecem fora dos totais confirmados.</p>
          </div>
        </div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Operações confirmadas', usage.totals.confirmedOperations],
          ['Tokens de entrada', usage.totals.inputTokens],
          ['Tokens de saída', usage.totals.outputTokens],
          ['Sessões de voz emitidas', usage.totals.realtimeSessions],
        ].map(([label, value]) => <div key={String(label)} className="rounded-lg border bg-card p-5">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-semibold">{number.format(Number(value))}</p>
        </div>)}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b p-4"><h2 className="font-semibold">Por tipo de operação</h2></div>
          {!usage.operations.length ? <p className="p-5 text-sm text-muted-foreground">Nenhuma operação no período.</p> :
            <div className="overflow-x-auto"><table className="w-full text-left text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
                <th className="px-4 py-3 font-medium">Operação</th><th className="px-4 py-3 font-medium">Confirmadas</th>
                <th className="px-4 py-3 font-medium">Entrada</th><th className="px-4 py-3 font-medium">Saída</th>
              </tr></thead>
              <tbody>{usage.operations.map((operation) => <tr key={operation.operation} className="border-t">
                <td className="px-4 py-3"><p className="font-medium">{operation.label}</p>
                  {operation.ambiguousEvents || operation.failedEvents ? <p className="mt-1 text-xs text-amber-700">{operation.ambiguousEvents} incerto(s) · {operation.failedEvents} falha(s)</p> : null}</td>
                <td className="px-4 py-3">{number.format(operation.confirmedEvents)}</td>
                <td className="px-4 py-3">{number.format(operation.inputTokens)}</td>
                <td className="px-4 py-3">{number.format(operation.outputTokens)}</td>
              </tr>)}</tbody>
            </table></div>}
        </section>

        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b p-4"><h2 className="font-semibold">Por atendente</h2></div>
          {!usage.agents.length ? <p className="p-5 text-sm text-muted-foreground">Nenhum consumo confirmado no período.</p> :
            <div className="divide-y">{usage.agents.map((agent) => <div key={agent.agentId || 'unassigned'} className="flex items-center justify-between gap-4 p-4">
              <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted"><Bot className="h-4 w-4" aria-hidden="true" /></span>
                <div className="min-w-0"><p className="truncate font-medium">{agent.agentName}</p><p className="text-xs text-muted-foreground">{number.format(agent.confirmedOperations)} operação(ões)</p></div></div>
              <div className="text-right text-xs text-muted-foreground"><p>{number.format(agent.inputTokens)} entrada</p><p>{number.format(agent.outputTokens)} saída</p></div>
            </div>)}</div>}
        </section>
      </div>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b p-4"><h2 className="font-semibold">Atividade recente</h2>
          <p className="mt-1 text-xs text-muted-foreground">Sem prompts, mensagens, request keys ou metadados sensíveis.</p></div>
        {!usage.recent.length ? <p className="p-5 text-sm text-muted-foreground">Nenhum evento no período.</p> :
          <div className="overflow-x-auto"><table className="w-full text-left text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>
              <th className="px-4 py-3 font-medium">Data</th><th className="px-4 py-3 font-medium">Atendente</th>
              <th className="px-4 py-3 font-medium">Operação</th><th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Tokens</th>
            </tr></thead>
            <tbody>{usage.recent.map((event) => <tr key={event.id} className="border-t">
              <td className="whitespace-nowrap px-4 py-3">{dateTime.format(new Date(event.createdAt))}</td>
              <td className="px-4 py-3">{event.agentName}</td><td className="px-4 py-3">{event.operationLabel}</td>
              <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${statusClass(event.status)}`}>{STATUS_LABELS[event.status] || 'Outro'}</span></td>
              <td className="whitespace-nowrap px-4 py-3">{number.format(event.inputTokens)} / {number.format(event.outputTokens)}</td>
            </tr>)}</tbody>
          </table></div>}
      </section>
    </section>;
  } catch (error) {
    if (!(error instanceof FlipAiError)) throw error;
    return <section className="mx-auto max-w-2xl space-y-4 p-6">
      <CircleDollarSign className="h-8 w-8 text-brand-600" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Consumo do Flip AI</h1><p>{error.message}</p>
      <Link className="inline-block text-brand-600 underline" href="/flip-ai">Voltar aos atendentes</Link>
    </section>;
  }
}

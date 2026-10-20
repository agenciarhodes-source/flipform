import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { operationCosts } from '@/lib/costs/operation-costs';
import { brl, WHATSAPP_PRICES_SNAPSHOT } from '@/lib/costs/pricing';

export const dynamic = 'force-dynamic';

const CATEGORY_LABELS: Record<string, string> = {
  marketing: 'Marketing', utility: 'Utilidade', authentication: 'Autenticação', service: 'Atendimento',
};

function monthOptions(count = 12) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 15));
    const value = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return { value, label: date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }) };
  });
}

/** How much the operation costs: AI and WhatsApp, per month, per result and per day. */
export default async function CostsPage({ searchParams }: { searchParams: { month?: string } }) {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.tenantId || !can(session.role, 'FLIP_AI_MANAGE')) redirect('/dashboard');
  const months = monthOptions();
  const month = searchParams.month && months.some((option) => option.value === searchParams.month) ? searchParams.month : months[0].value;
  const costs = await operationCosts(session.tenantId, month);
  const change = costs.previousTotal > 0 ? ((costs.total - costs.previousTotal) / costs.previousTotal) * 100 : null;
  const maxDay = Math.max(0.01, ...costs.days.map((day) => day.ai + day.whatsapp));

  return (
    <section className="mx-auto max-w-5xl space-y-5 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link href="/whatsapp-ai" className="text-sm text-brand-700 underline">← Atendimento WhatsApp</Link>
          <h1 className="text-2xl font-semibold">Custos da operação</h1>
          <p className="text-sm text-muted-foreground">IA e WhatsApp, em reais. Estimativa para acompanhar; a fatura oficial é a da Meta e a da carteira de créditos.</p>
        </div>
        <form className="flex items-center gap-2" method="get">
          <select name="month" defaultValue={month} className="rounded border bg-white p-2 text-sm">
            {months.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <button type="submit" className="rounded border px-3 py-2 text-sm">Ver</button>
        </form>
      </header>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-muted-foreground">Total do mês</p>
          <p className="text-2xl font-semibold">{brl(costs.total)}</p>
          <p className="text-xs text-muted-foreground">
            {change === null ? 'Sem gasto no mês anterior' : `${change >= 0 ? '+' : ''}${change.toFixed(0)}% em relação ao mês anterior (${brl(costs.previousTotal)})`}
          </p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-muted-foreground">IA</p>
          <p className="text-2xl font-semibold">{brl(costs.ai.total)}</p>
          <p className="text-xs text-muted-foreground">WhatsApp {brl(costs.ai.whatsappChannel)} · chat do site {brl(costs.ai.siteChannel)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <p className="text-xs uppercase text-muted-foreground">WhatsApp (Meta)</p>
          <p className="text-2xl font-semibold">{brl(costs.whatsapp.total)}</p>
          <p className="text-xs text-muted-foreground">{costs.whatsapp.free} mensagens grátis (dentro da janela)</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { label: 'Por conversa atendida pela IA', value: costs.results.perConversation, count: `${costs.results.conversations} conversas` },
          { label: 'Por lead qualificado', value: costs.results.perQualifiedLead, count: `${costs.results.qualifiedLeads} leads criados pela IA` },
          { label: 'Por cliente fechado', value: costs.results.perClosedClient, count: `${costs.results.closedClients} fechamentos` },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border bg-white p-4 shadow-sm">
            <p className="text-xs uppercase text-muted-foreground">{item.label}</p>
            <p className="text-xl font-semibold">{item.value === null ? '—' : brl(item.value)}</p>
            <p className="text-xs text-muted-foreground">{item.count}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold">IA por tipo de uso</h2>
          {costs.ai.byOperation.length === 0 ? <p className="text-sm text-muted-foreground">Sem uso de IA no mês.</p> : (
            <ul className="space-y-1 text-sm">
              {costs.ai.byOperation.map((item) => (
                <li key={item.label} className="flex justify-between gap-2"><span>{item.label} ({item.events})</span><span className="font-medium">{brl(item.brl)}</span></li>
              ))}
            </ul>
          )}
        </div>
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <h2 className="mb-2 font-semibold">WhatsApp por categoria</h2>
          {costs.whatsapp.byCategory.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma mensagem cobrada no mês.</p> : (
            <ul className="space-y-1 text-sm">
              {costs.whatsapp.byCategory.map((item) => (
                <li key={item.category} className="flex justify-between gap-2"><span>{CATEGORY_LABELS[item.category] || item.category} ({item.count})</span><span className="font-medium">{brl(item.brl)}</span></li>
              ))}
            </ul>
          )}
          {costs.whatsapp.unknown > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">{costs.whatsapp.unknown} mensagens enviadas antes do painel não têm a informação de cobrança da Meta.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-semibold">Gasto por dia</h2>
        {costs.days.length === 0 ? <p className="text-sm text-muted-foreground">Sem gastos no mês.</p> : (
          <ul className="space-y-1">
            {costs.days.map((day) => (
              <li key={day.day} className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 text-muted-foreground">{day.day.slice(8, 10)}/{day.day.slice(5, 7)}</span>
                <span className="flex h-3 flex-1 overflow-hidden rounded bg-slate-100">
                  <span className="bg-violet-500" style={{ width: `${(day.ai / maxDay) * 100}%` }} title={`IA ${brl(day.ai)}`} />
                  <span className="bg-emerald-500" style={{ width: `${(day.whatsapp / maxDay) * 100}%` }} title={`WhatsApp ${brl(day.whatsapp)}`} />
                </span>
                <span className="w-20 shrink-0 text-right">{brl(day.ai + day.whatsapp)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          <span className="mr-1 inline-block h-2 w-2 rounded bg-violet-500" />IA <span className="ml-3 mr-1 inline-block h-2 w-2 rounded bg-emerald-500" />WhatsApp
        </p>
      </div>

      <p className="text-xs text-muted-foreground">
        Cotação usada: R$ {costs.rate.toFixed(2).replace('.', ',')} por dólar. Preços do WhatsApp no Brasil de {WHATSAPP_PRICES_SNAPSHOT.split('-').reverse().join('/')}: Marketing US$ 0,0625 e Utilidade US$ 0,0068 por mensagem cobrada.
      </p>
    </section>
  );
}

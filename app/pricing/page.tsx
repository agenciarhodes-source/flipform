import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { isSellablePlan, planFeatures, planIncludesAi, planIncludesMessaging } from '@/lib/billing/subscription-rules';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';
const checkoutHref = (slug: string) => (APP_URL ? `${APP_URL}/checkout/${slug}` : `/checkout/${slug}`);

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Planos FlipForm',
  description: 'Compare os planos do FlipForm para captura de leads, formulários inteligentes, CRM visual, automação comercial e atendente de IA.',
};

function toBrl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const yesNo = (value: boolean) => (value ? 'Sim' : 'Não');
const limit = (value: number) => (value > 0 ? value.toLocaleString('pt-BR') : 'Ilimitado');

/** Prices and limits come from the plans table: the same values the checkout charges. */
export default async function PricingPage() {
  const rows = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { price: 'asc' },
    select: {
      slug: true, name: true, description: true, price: true, isActive: true,
      maxUsers: true, maxForms: true, maxPipelines: true, maxLeadsPerMonth: true,
      canUseReports: true, canExportCsv: true, canUseMetaPixel: true, canUseWebhooks: true, canUseCustomBranding: true, canUseTasks: true,
    },
  });
  const plans = rows.filter(isSellablePlan);
  const rowsOf: Array<[string, (plan: (typeof plans)[number]) => string]> = [
    ['Usuários', (plan) => limit(plan.maxUsers)],
    ['Formulários', (plan) => limit(plan.maxForms)],
    ['Pipelines', (plan) => limit(plan.maxPipelines)],
    ['Leads/mês', (plan) => limit(plan.maxLeadsPerMonth)],
    ['Atendimento WhatsApp e Instagram (manual)', (plan) => yesNo(planIncludesMessaging(plan.slug))],
    ['IA no WhatsApp, Instagram e chat do site', (plan) => yesNo(planIncludesAi(plan.slug))],
    ['Relatórios', (plan) => yesNo(plan.canUseReports)],
    ['Exportação CSV', (plan) => yesNo(plan.canExportCsv)],
    ['Pixel / API de Conversões Meta', (plan) => yesNo(plan.canUseMetaPixel)],
    ['Webhooks', (plan) => yesNo(plan.canUseWebhooks)],
    ['Marca própria', (plan) => yesNo(plan.canUseCustomBranding)],
    ['Tarefas', (plan) => yesNo(plan.canUseTasks)],
  ];
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto max-w-6xl space-y-8 px-4 py-12">
        <h1 className="text-3xl font-bold">Planos FlipForm</h1>
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {plans.map((plan) => (
            <a key={plan.slug} href={checkoutHref(plan.slug)}
              className={`rounded-xl p-4 ${plan.slug === 'growth' ? 'border-2 border-slate-900' : planIncludesAi(plan.slug) ? 'border-2 border-violet-600' : 'border'}`}>
              {plan.slug === 'growth' ? <p className="text-xs font-semibold">Mais recomendado</p> : null}
              {planIncludesAi(plan.slug) ? <p className="text-xs font-semibold text-violet-700">Inclui o atendente de IA</p> : null}
              <h2 className="font-semibold">{plan.name}</h2>
              <p>{toBrl(Number(plan.price))}/mês</p>
              <p className="text-slate-600">{planFeatures(plan).join(' · ')}</p>
              {plan.description ? <p className="mt-1 text-xs text-slate-500">{plan.description}</p> : null}
            </a>
          ))}
          <a className="rounded-xl border p-4" href="mailto:atendimento@flipform.com.br">
            <h2 className="font-semibold">Enterprise</h2><p>Sob consulta</p><p className="text-slate-600">Limites customizados · SLA dedicado</p>
          </a>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="p-2 text-left">Recurso</th>
                {plans.map((plan) => <th key={plan.slug} className="p-2">{plan.name}</th>)}
                <th className="p-2">Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {rowsOf.map(([label, value]) => (
                <tr key={label} className="border-t">
                  <td className="p-2">{label}</td>
                  {plans.map((plan) => <td key={plan.slug} className="p-2 text-center">{value(plan)}</td>)}
                  <td className="p-2 text-center">Custom</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="text-sm"><Link href="/" className="underline">Voltar para a landing</Link></div>
      </div>
    </main>
  );
}

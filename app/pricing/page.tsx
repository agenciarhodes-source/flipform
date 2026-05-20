import Link from 'next/link';
import type { Metadata } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';
const checkoutHref = (slug: string) => (APP_URL ? `${APP_URL}/checkout/${slug}` : `/checkout/${slug}`);

export const metadata: Metadata = {
  title: 'Planos FlipForm — Starter, Growth, Pro e Enterprise',
  description: 'Compare os planos do FlipForm para captura de leads, formulários inteligentes, CRM visual e automação comercial.',
};

export default function PricingPage() {
  return <main className="min-h-screen bg-white text-slate-900"><div className="max-w-6xl mx-auto px-4 py-12 space-y-8"><h1 className="text-3xl font-bold">Planos FlipForm</h1>
    <div className="grid md:grid-cols-4 gap-4 text-sm">
      <a className="border rounded-xl p-4" href={checkoutHref('starter')}><h2 className="font-semibold">Starter</h2><p>R$ 97/mês</p><p>3 usuários · 5 formulários · 2 pipelines · 2.500 leads/mês</p></a>
      <a className="border-2 border-slate-900 rounded-xl p-4" href={checkoutHref('growth')}><p className="text-xs font-semibold">Mais recomendado</p><h2 className="font-semibold">Growth</h2><p>R$ 157/mês</p><p>7 usuários · 15 formulários · 5 pipelines · 10.000 leads/mês</p></a>
      <a className="border rounded-xl p-4" href={checkoutHref('pro')}><h2 className="font-semibold">Pro</h2><p>R$ 397/mês</p><p>20 usuários · 60 formulários · 25 pipelines · 75.000 leads/mês</p></a>
      <a className="border rounded-xl p-4" href="mailto:atendimento@flipform.com.br"><h2 className="font-semibold">Enterprise</h2><p>Sob consulta</p><p>Limites customizados · SLA dedicado</p></a>
    </div>
    <div className="overflow-x-auto"><table className="w-full text-sm border"><thead><tr className="bg-slate-50"><th className="p-2 text-left">Recurso</th><th className="p-2">Starter</th><th className="p-2">Growth</th><th className="p-2">Pro</th><th className="p-2">Enterprise</th></tr></thead><tbody>
      <tr><td className="p-2">Usuários</td><td className="p-2 text-center">3</td><td className="p-2 text-center">7</td><td className="p-2 text-center">20</td><td className="p-2 text-center">Custom</td></tr>
      <tr><td className="p-2">Formulários</td><td className="p-2 text-center">5</td><td className="p-2 text-center">15</td><td className="p-2 text-center">60</td><td className="p-2 text-center">Custom</td></tr>
      <tr><td className="p-2">Pipelines</td><td className="p-2 text-center">2</td><td className="p-2 text-center">5</td><td className="p-2 text-center">25</td><td className="p-2 text-center">Custom</td></tr>
      <tr><td className="p-2">Leads/mês</td><td className="p-2 text-center">2.500</td><td className="p-2 text-center">10.000</td><td className="p-2 text-center">75.000</td><td className="p-2 text-center">Custom</td></tr>
      <tr><td className="p-2">Exportação CSV</td><td className="p-2 text-center">Sim</td><td className="p-2 text-center">Sim</td><td className="p-2 text-center">Sim</td><td className="p-2 text-center">Sim</td></tr>
      <tr><td className="p-2">Relatórios</td><td className="p-2 text-center">Não</td><td className="p-2 text-center">Sim</td><td className="p-2 text-center">Sim</td><td className="p-2 text-center">Sim</td></tr>
      <tr><td className="p-2">Branding / Pixel / Webhooks / Tarefas</td><td className="p-2 text-center">Parcial</td><td className="p-2 text-center">Sim</td><td className="p-2 text-center">Sim</td><td className="p-2 text-center">Sim</td></tr>
    </tbody></table></div>
    <div className="text-sm"><Link href="/" className="underline">Voltar para a landing</Link></div>
  </div></main>;
}

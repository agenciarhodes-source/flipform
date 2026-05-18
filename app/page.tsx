import Link from 'next/link';
import type { Metadata } from 'next';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || '';
const appHref = (path: string) => (APP_URL ? `${APP_URL}${path}` : path);
const checkoutHref = (slug: string) => appHref(`/checkout/${slug}`);

export const metadata: Metadata = {
  title: 'FlipForm — CRM de leads, formulários inteligentes e funil comercial',
  description: 'Capture leads com formulários inteligentes, organize oportunidades em um CRM visual e acompanhe vendas em um funil comercial simples.',
};

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-white text-slate-900">
      <header className="border-b bg-white/90 sticky top-0 backdrop-blur z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="font-bold text-xl">FlipForm</div>
          <nav className="hidden md:flex gap-6 text-sm">
            <a href="#produto">Produto</a><a href="#como-funciona">Como funciona</a><Link href="/pricing">Planos</Link><a href="#faq">FAQ</a>
          </nav>
          <div className="flex gap-2">
            <a className="px-3 py-2 border rounded-lg text-sm" href={appHref('/login')}>Acessar plataforma</a>
            <Link className="px-3 py-2 bg-slate-900 text-white rounded-lg text-sm" href="/pricing">Ver planos</Link>
          </div>
        </div>
      </header>

      <section className="max-w-6xl mx-auto px-4 py-16 grid md:grid-cols-2 gap-8 items-center" id="produto">
        <div>
          <h1 className="text-4xl font-bold mb-4">Transforme formulários em funis comerciais completos.</h1>
          <p className="text-slate-600 mb-6">Capture leads com formulários inteligentes, organize oportunidades em um CRM visual e acompanhe cada etapa do relacionamento até a venda.</p>
          <div className="flex gap-3"><Link href="/pricing" className="px-4 py-2 bg-slate-900 text-white rounded-lg">Ver planos</Link><a href={appHref('/login')} className="px-4 py-2 border rounded-lg">Acessar plataforma</a></div>
        </div>
        <div className="rounded-2xl border p-6 bg-slate-50">
          <p className="font-semibold mb-3">Visual do fluxo</p>
          <ul className="space-y-2 text-sm text-slate-700"><li>✅ Formulário inteligente</li><li>✅ Lead capturado</li><li>✅ Pipeline/Kanban</li><li>✅ CRM com histórico</li></ul>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-4 py-12"><h2 className="text-2xl font-bold mb-3">O problema</h2><p className="text-slate-600">Leads chegam por formulários, WhatsApp, campanhas e indicações, mas se perdem quando não existe processo comercial.</p><div className="mt-5"><Link href="/pricing" className="underline">Organizar meus leads</Link></div></section>
      <section className="max-w-6xl mx-auto px-4 py-12"><h2 className="text-2xl font-bold mb-3">A solução FlipForm</h2><p className="text-slate-600">Conecte captação, qualificação, pipeline e acompanhamento em uma única operação.</p><div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3 mt-4 text-sm"><div className="border rounded-xl p-3">Formulários inteligentes</div><div className="border rounded-xl p-3">CRM visual</div><div className="border rounded-xl p-3">Funil comercial</div><div className="border rounded-xl p-3">Tarefas</div><div className="border rounded-xl p-3">Histórico</div><div className="border rounded-xl p-3">Visão de oportunidades</div></div><div className="mt-5"><Link href="/pricing" className="underline">Conhecer os planos</Link></div></section>
      <section id="como-funciona" className="max-w-6xl mx-auto px-4 py-12"><h2 className="text-2xl font-bold mb-4">Como funciona</h2><div className="grid md:grid-cols-5 gap-3 text-sm"><div className="border rounded-xl p-3">1. Crie formulários inteligentes.</div><div className="border rounded-xl p-3">2. Capture e qualifique leads.</div><div className="border rounded-xl p-3">3. Organize no funil.</div><div className="border rounded-xl p-3">4. Acompanhe tarefas e histórico.</div><div className="border rounded-xl p-3">5. Converta com previsibilidade.</div></div><div className="mt-5"><Link href="/pricing" className="underline">Começar com um plano</Link></div></section>
      <section className="max-w-6xl mx-auto px-4 py-12"><h2 className="text-2xl font-bold mb-4">Benefícios</h2><ul className="grid md:grid-cols-2 gap-2 text-slate-700"><li>• Menos lead perdido</li><li>• Mais velocidade no atendimento</li><li>• Funil visual</li><li>• Gestão por dados</li><li>• Padronização comercial</li><li>• Integração com campanhas</li><li>• Operação simples para times pequenos</li></ul><div className="mt-5"><Link href="/pricing" className="underline">Ver comparação de planos</Link></div></section>
      <section className="max-w-6xl mx-auto px-4 py-12"><h2 className="text-2xl font-bold mb-4">Casos de uso</h2><p className="text-slate-600">Clínicas, escolas/cursos, imobiliárias, serviços locais, agências, consultorias, franquias e varejo especializado.</p><div className="mt-5"><Link href="/pricing" className="underline">Escolher meu plano</Link></div></section>
      <section className="max-w-6xl mx-auto px-4 py-12"><h2 className="text-2xl font-bold mb-4">Planos resumidos</h2><div className="grid md:grid-cols-4 gap-3 text-sm"><a className="border rounded-xl p-4" href={checkoutHref('starter')}>Starter — R$ 97/mês</a><a className="border rounded-xl p-4" href={checkoutHref('growth')}>Growth — R$ 157/mês</a><a className="border rounded-xl p-4" href={checkoutHref('pro')}>Pro — R$ 397/mês</a><a className="border rounded-xl p-4" href="mailto:atendimento@flipform.com.br">Enterprise — Sob consulta</a></div><div className="mt-5"><Link href="/pricing" className="underline">Comparar todos os planos</Link></div></section>
      <section id="faq" className="max-w-6xl mx-auto px-4 py-12"><h2 className="text-2xl font-bold mb-4">FAQ</h2><div className="space-y-3 text-sm"><p><strong>O FlipForm é só um criador de formulários?</strong> Não, ele conecta captação + CRM + funil.</p><p><strong>Posso usar como CRM?</strong> Sim.</p><p><strong>O que acontece depois do pagamento?</strong> Após a confirmação do pagamento, você receberá no e-mail cadastrado as instruções de acesso ao FlipForm. Por segurança, a definição ou troca de senha deve ser feita no primeiro acesso.</p><p><strong>Preciso de cartão para começar?</strong> Depende do meio de pagamento no checkout.</p><p><strong>O pagamento é recorrente?</strong> Sim, mensal.</p><p><strong>Posso trocar de plano depois?</strong> Sim, em fluxo comercial apropriado.</p><p><strong>O plano Enterprise é para quem?</strong> Operações com necessidades customizadas.</p><p><strong>Meus dados ficam separados?</strong> Sim, por tenant.</p><p><strong>Posso cancelar depois?</strong> Sim, conforme política comercial.</p></div><div className="mt-5"><Link href="/pricing" className="underline">Escolher plano</Link></div></section>

      <footer className="border-t mt-10"><div className="max-w-6xl mx-auto px-4 py-8 text-sm text-slate-600"><p className="font-semibold text-slate-800">FlipForm</p><p>CRM de leads com formulários inteligentes e funil comercial.</p><div className="mt-3 flex flex-wrap gap-4"><Link href="/pricing">Planos</Link><a href={appHref('/login')}>Acessar plataforma</a><a href="mailto:atendimento@flipform.com.br">Fale conosco</a><a href="mailto:atendimento@flipform.com.br">atendimento@flipform.com.br</a></div></div></footer>
    </main>
  );
}

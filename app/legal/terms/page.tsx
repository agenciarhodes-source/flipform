import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Termos de Uso — FlipForm',
  description: 'Termos de uso da plataforma FlipForm.',
};

export default function TermsPage() {
  return <main className="min-h-screen bg-background"><div className="max-w-3xl mx-auto px-6 py-10 space-y-6"><header><h1 className="text-3xl font-bold">Termos de Uso — FlipForm</h1><p className="text-sm text-muted-foreground mt-2">Documento operacional inicial, sujeito a revisão jurídica.</p></header><p>Estes Termos de Uso regulam o acesso e uso da plataforma FlipForm, uma solução de formulários inteligentes, CRM de leads e funil comercial.</p><p>Ao utilizar a plataforma, o cliente declara estar de acordo com estes termos e se responsabiliza pelas informações cadastradas, pelos dados de seus usuários e pela utilização adequada dos recursos disponíveis.</p><p>A FlipForm poderá evoluir funcionalidades, ajustar limites de planos, corrigir falhas e realizar melhorias técnicas para manter a estabilidade e segurança do serviço.</p><p>O uso indevido da plataforma, incluindo tentativa de acesso não autorizado, abuso de recursos, envio de dados ilícitos ou violação de direitos de terceiros, poderá resultar em suspensão ou encerramento do acesso.</p><p>Os planos, preços, limites e condições comerciais poderão variar conforme contratação vigente.</p><p>Em caso de dúvidas, entre em contato pelo e-mail atendimento@flipform.com.br.</p><footer className="pt-6 border-t text-sm"><div className="flex gap-4"><Link href="/legal/privacy" className="underline">Política de Privacidade</Link><Link href="/legal/cancellation" className="underline">Política de Cancelamento</Link><Link href="/legal/support" className="underline">Suporte</Link></div></footer></div></main>;
}

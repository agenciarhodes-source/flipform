import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Cancelamento — FlipForm',
  description: 'Condições de cancelamento dos planos FlipForm.',
};

export default function CancellationPage() {
  return <main className="min-h-screen bg-background"><div className="max-w-3xl mx-auto px-6 py-10 space-y-6"><header><h1 className="text-3xl font-bold">Política de Cancelamento — FlipForm</h1><p className="text-sm text-muted-foreground mt-2">Documento operacional inicial, sujeito a revisão jurídica.</p></header><p>Os planos da FlipForm são cobrados de forma recorrente, conforme o plano contratado.</p><p>O cliente pode solicitar cancelamento pela área de billing da plataforma ou pelo contato atendimento@flipform.com.br.</p><p>Após o cancelamento, o acesso à plataforma poderá ser mantido até o fim do ciclo já pago ou encerrado conforme a condição comercial aplicável ao plano.</p><p>A inadimplência poderá resultar em restrição, suspensão ou bloqueio de acesso.</p><p>O cancelamento não implica exclusão automática dos dados. Solicitações de exportação ou exclusão de dados devem seguir o fluxo próprio da plataforma ou ser enviadas ao suporte.</p><p>Eventuais reembolsos, quando aplicáveis, serão avaliados conforme a forma de contratação, período de uso e condições comerciais vigentes.</p><footer className="pt-6 border-t text-sm"><div className="flex gap-4"><Link href="/legal/terms" className="underline">Termos de Uso</Link><Link href="/legal/privacy" className="underline">Política de Privacidade</Link><Link href="/legal/support" className="underline">Suporte</Link></div></footer></div></main>;
}

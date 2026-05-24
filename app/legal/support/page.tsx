import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Suporte — FlipForm',
  description: 'Canais de suporte e contato da FlipForm.',
};

export default function SupportPage() {
  return <main className="min-h-screen bg-background"><div className="max-w-3xl mx-auto px-6 py-10 space-y-6"><header><h1 className="text-3xl font-bold">Suporte — FlipForm</h1><p className="text-sm text-muted-foreground mt-2">Documento operacional inicial, sujeito a revisão jurídica.</p></header><p>Para suporte, dúvidas comerciais, billing, acesso, cancelamento ou solicitações relacionadas a dados, entre em contato pelo e-mail:</p><p className="font-medium">atendimento@flipform.com.br</p><p>Ao abrir uma solicitação, informe o e-mail de acesso, nome da empresa/tenant e uma descrição objetiva do problema.</p><footer className="pt-6 border-t text-sm"><div className="flex gap-4"><Link href="/legal/terms" className="underline">Termos de Uso</Link><Link href="/legal/privacy" className="underline">Política de Privacidade</Link><Link href="/legal/cancellation" className="underline">Política de Cancelamento</Link></div></footer></div></main>;
}

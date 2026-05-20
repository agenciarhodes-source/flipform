import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidade — FlipForm',
  description: 'Política de privacidade e tratamento de dados da plataforma FlipForm.',
};

export default function PrivacyPage() {
  return <main className="min-h-screen bg-background"><div className="max-w-3xl mx-auto px-6 py-10 space-y-6"><header><h1 className="text-3xl font-bold">Política de Privacidade — FlipForm</h1><p className="text-sm text-muted-foreground mt-2">Documento operacional inicial, sujeito a revisão jurídica.</p></header><p>A Política de Privacidade da FlipForm descreve como dados pessoais podem ser tratados durante o uso da plataforma.</p><p>A FlipForm pode tratar dados de cadastro, dados de acesso, dados operacionais do tenant, formulários, leads, respostas, pipelines, tarefas, cobranças e registros técnicos necessários para operação, segurança e melhoria da plataforma.</p><p>Os dados são utilizados para fornecer o serviço contratado, permitir autenticação, organizar leads, processar cobranças, oferecer suporte, prevenir abuso e cumprir obrigações legais.</p><p>A FlipForm adota medidas técnicas e organizacionais razoáveis para proteger os dados armazenados, mas o cliente também é responsável por configurar acessos internos, permissões e uso adequado da plataforma.</p><p>Dados de leads cadastrados pelos clientes são tratados no contexto da operação do respectivo tenant. O cliente é responsável pela base legal, finalidade e comunicação com seus próprios leads.</p><p>Solicitações relacionadas a dados pessoais podem ser enviadas para atendimento@flipform.com.br.</p><footer className="pt-6 border-t text-sm"><div className="flex gap-4"><Link href="/legal/terms" className="underline">Termos de Uso</Link><Link href="/legal/cancellation" className="underline">Política de Cancelamento</Link><Link href="/legal/support" className="underline">Suporte</Link></div></footer></div></main>;
}

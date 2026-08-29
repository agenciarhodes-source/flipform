import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Exclusão de Dados — FlipForm',
  description: 'Instruções para solicitar exclusão de dados pessoais tratados pela plataforma FlipForm.',
};

export default function DataDeletionPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-3xl px-6 py-12 sm:py-16">
        <header className="mb-10 border-b border-slate-200 pb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">FlipForm</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Exclusão de Dados</h1>
          <p className="mt-4 text-slate-600">
            Esta página explica como solicitar a exclusão de dados pessoais relacionados ao uso da FlipForm e de integrações autorizadas, inclusive Meta e WhatsApp Business.
          </p>
          <p className="mt-3 text-sm text-slate-500">Última atualização: 29 de agosto de 2026.</p>
        </header>

        <div className="space-y-8 text-[15px] leading-7 text-slate-700">
          <section>
            <h2 className="mb-3 text-xl font-semibold text-slate-950">Como solicitar</h2>
            <p>
              Envie a solicitação para <a href="mailto:atendimento@flipform.com.br" className="underline font-medium">atendimento@flipform.com.br</a> com o assunto <strong>“Exclusão de dados”</strong>.
            </p>
            <p className="mt-3">
              Para localizar a conta ou os registros corretos com segurança, informe o e-mail utilizado na FlipForm, o nome da empresa/tenant e, quando aplicável, o telefone ou outro identificador relacionado ao dado que deseja excluir.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-slate-950">Dados de usuários da FlipForm</h2>
            <p>
              Usuários podem solicitar a exclusão de dados associados à própria conta. A FlipForm verificará a identidade do solicitante antes de executar alterações irreversíveis e informará quando houver dados que precisem ser mantidos por obrigação legal, segurança, prevenção a fraude ou exercício regular de direitos.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-slate-950">Dados de leads e contatos de clientes</h2>
            <p>
              Quando os dados foram coletados por um cliente da FlipForm por meio de formulários, campanhas ou atendimento, esse cliente atua, em regra, como controlador dos dados. Nesses casos, a solicitação pode ser encaminhada ao cliente responsável ou processada pela FlipForm mediante instrução válida desse controlador.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-slate-950">Integrações Meta e WhatsApp</h2>
            <p>
              Se a solicitação estiver relacionada a uma integração Meta ou WhatsApp Business conectada à FlipForm, poderemos remover os dados e vínculos armazenados pela FlipForm conforme aplicável. A exclusão de informações mantidas diretamente pela Meta, WhatsApp ou por outra empresa pode exigir uma solicitação separada ao respectivo provedor ou ao administrador da conta empresarial.
            </p>
          </section>

          <section>
            <h2 className="mb-3 text-xl font-semibold text-slate-950">Prazo e confirmação</h2>
            <p>
              A solicitação será analisada e respondida em prazo compatível com a legislação aplicável. Quando a exclusão for concluída, enviaremos uma confirmação ao canal informado pelo solicitante, salvo quando houver impedimento legal ou técnico devidamente justificado.
            </p>
          </section>
        </div>

        <footer className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-600">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/legal/privacy" className="underline">Política de Privacidade</Link>
            <Link href="/legal/terms" className="underline">Termos de Uso</Link>
            <Link href="/legal/support" className="underline">Suporte</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

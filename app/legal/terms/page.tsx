import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Termos de Uso — FlipForm',
  description: 'Termos de uso da plataforma FlipForm.',
};

const sections = [
  {
    title: '1. Objeto e aceitação',
    content: (
      <>
        <p>
          Estes Termos de Uso regulam o acesso e uso da plataforma FlipForm, uma solução de formulários inteligentes, CRM de leads, funil comercial e atendimento em canais como WhatsApp, Instagram Direct e chat do site. A operação da plataforma está vinculada ao CNPJ 44.125.687/0001-67.
        </p>
        <p>
          Ao utilizar a plataforma, o cliente declara estar de acordo com estes termos e com a <Link href="/legal/privacy" className="underline font-medium">Política de Privacidade</Link>, e se responsabiliza pelas informações cadastradas, pelos dados de seus usuários e pela utilização adequada dos recursos disponíveis.
        </p>
      </>
    ),
  },
  {
    title: '2. Contas e acessos',
    content: (
      <>
        <p>
          O cliente é responsável por cadastrar seus usuários, definir as permissões de cada um e remover os acessos de quem deixar a equipe. Cada usuário deve manter sua senha em sigilo e não compartilhar o acesso.
        </p>
        <p>
          Atividades realizadas com as credenciais de um usuário são consideradas de responsabilidade do cliente. Em caso de suspeita de acesso indevido, o cliente deve trocar a senha e avisar a FlipForm imediatamente.
        </p>
      </>
    ),
  },
  {
    title: '3. Planos e pagamento',
    content: (
      <>
        <p>
          Os planos, preços, limites e condições comerciais poderão variar conforme a contratação vigente. Alguns recursos, como os canais de atendimento e a inteligência artificial, estão disponíveis apenas em determinados planos.
        </p>
        <p>
          As regras de cancelamento estão descritas na <Link href="/legal/cancellation" className="underline font-medium">Política de Cancelamento</Link>.
        </p>
      </>
    ),
  },
  {
    title: '4. Responsabilidades do cliente sobre os dados',
    content: (
      <>
        <p>
          Em relação aos dados de leads e contatos que coleta e atende pela plataforma, o cliente é o controlador e a FlipForm atua como operadora, seguindo as instruções do cliente. Cabe ao cliente definir a finalidade e a base legal do tratamento e informar seus contatos, por meio de seus próprios avisos de privacidade.
        </p>
        <p>
          O cliente se compromete a não utilizar a plataforma para enviar mensagens não solicitadas em massa, coletar dados sem base legal ou tratar informações de forma contrária à LGPD e às políticas dos canais utilizados.
        </p>
      </>
    ),
  },
  {
    title: '5. Integrações com serviços de terceiros',
    content: (
      <>
        <p>
          O cliente pode conectar à FlipForm serviços de terceiros, como WhatsApp Business, Instagram, Facebook, Meta Ads e Google Ads. Essas conexões dependem de autorização do próprio cliente e estão sujeitas também aos termos e políticas desses serviços.
        </p>
        <p>
          O funcionamento das integrações depende da disponibilidade e das regras de cada serviço, que podem mudar sem aviso da FlipForm. O cliente pode desconectar uma integração a qualquer momento.
        </p>
      </>
    ),
  },
  {
    title: '6. Recursos de inteligência artificial',
    content: (
      <>
        <p>
          Os recursos de inteligência artificial, como o assistente de atendimento, a transcrição de áudios e os resumos para a equipe, são opcionais e só funcionam quando ativados pelo cliente. Para funcionar, utilizam provedores externos de inteligência artificial, conforme descrito na Política de Privacidade.
        </p>
        <p>
          Respostas geradas por inteligência artificial podem conter erros. O cliente é responsável por configurar as instruções do assistente, acompanhar as conversas, assumir o atendimento quando necessário e informar seus contatos, quando aplicável, que o atendimento pode ser feito com apoio de inteligência artificial.
        </p>
      </>
    ),
  },
  {
    title: '7. Disponibilidade e evolução da plataforma',
    content: (
      <p>
        A FlipForm poderá evoluir funcionalidades, ajustar limites de planos, corrigir falhas e realizar melhorias técnicas para manter a estabilidade e segurança do serviço.
      </p>
    ),
  },
  {
    title: '8. Uso indevido e suspensão',
    content: (
      <p>
        O uso indevido da plataforma, incluindo tentativa de acesso não autorizado, abuso de recursos, envio de dados ilícitos ou violação de direitos de terceiros, poderá resultar em suspensão ou encerramento do acesso.
      </p>
    ),
  },
  {
    title: '9. Encerramento e dados',
    content: (
      <p>
        Após o encerramento do contrato, os dados são mantidos e excluídos conforme a <Link href="/legal/privacy" className="underline font-medium">Política de Privacidade</Link> e as instruções da página de <Link href="/legal/data-deletion" className="underline font-medium">Exclusão de Dados</Link>, respeitadas as obrigações legais de guarda.
      </p>
    ),
  },
  {
    title: '10. Alterações destes termos',
    content: (
      <p>
        Estes termos podem ser atualizados para refletir mudanças legais, técnicas ou comerciais. A versão vigente permanecerá disponível nesta página, com indicação da data de atualização.
      </p>
    ),
  },
  {
    title: '11. Contato',
    content: (
      <p>
        Em caso de dúvidas, entre em contato pelo e-mail <a href="mailto:atendimento@flipform.com.br" className="underline font-medium">atendimento@flipform.com.br</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <header className="mb-10 border-b border-slate-200 pb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">FlipForm</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Termos de Uso</h1>
          <p className="mt-4 max-w-2xl text-slate-600">
            Estes termos explicam as regras de uso da plataforma FlipForm, as responsabilidades do cliente e o funcionamento das integrações e dos recursos de inteligência artificial.
          </p>
          <p className="mt-3 text-sm text-slate-500">Última atualização: 1º de novembro de 2026.</p>
        </header>

        <div className="space-y-9 text-[15px] leading-7 text-slate-700">
          {sections.map((section) => (
            <section key={section.title}>
              <h2 className="mb-3 text-xl font-semibold text-slate-950">{section.title}</h2>
              <div className="space-y-3">{section.content}</div>
            </section>
          ))}
        </div>

        <footer className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-600">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <Link href="/legal/privacy" className="underline">Política de Privacidade</Link>
            <Link href="/legal/data-deletion" className="underline">Exclusão de Dados</Link>
            <Link href="/legal/cancellation" className="underline">Política de Cancelamento</Link>
            <Link href="/legal/support" className="underline">Suporte</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

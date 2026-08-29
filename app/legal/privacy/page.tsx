import Link from 'next/link';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Política de Privacidade — FlipForm',
  description: 'Política de privacidade, proteção de dados e tratamento de informações da plataforma FlipForm.',
};

const sections = [
  {
    title: '1. Quem somos',
    content: (
      <>
        <p>
          A FlipForm é uma plataforma SaaS para criação de formulários, captação e gestão de leads, organização de atendimento e integrações com serviços de terceiros. A operação da plataforma está vinculada ao CNPJ 44.125.687/0001-67.
        </p>
        <p>
          Para os dados de cadastro, acesso, suporte, faturamento, segurança e administração da própria plataforma, a FlipForm atua como controladora. Em relação aos dados de leads e contatos inseridos ou coletados por clientes dentro de seus próprios ambientes (tenants), a FlipForm atua, em regra, como operadora, seguindo as instruções e finalidades definidas pelo respectivo cliente.
        </p>
      </>
    ),
  },
  {
    title: '2. Dados que podem ser tratados',
    content: (
      <>
        <p>Podemos tratar, conforme a funcionalidade utilizada:</p>
        <ul className="list-disc pl-6 space-y-2">
          <li>dados de cadastro e identificação de usuários, como nome, e-mail, telefone, empresa e função;</li>
          <li>dados de autenticação, sessão, permissões e registros de acesso;</li>
          <li>dados de formulários, respostas, leads, contatos, pipelines, tarefas e histórico de atendimento;</li>
          <li>dados técnicos, como endereço IP, navegador, dispositivo, data e horário de acesso e logs de segurança;</li>
          <li>dados necessários para cobrança, assinatura e suporte ao cliente;</li>
          <li>identificadores e metadados de integrações autorizadas, inclusive ativos Meta, WhatsApp Business, contas de anúncios, Pixels/Datasets e demais recursos conectados pelo cliente.</li>
        </ul>
      </>
    ),
  },
  {
    title: '3. Finalidades do tratamento',
    content: (
      <ul className="list-disc pl-6 space-y-2">
        <li>fornecer, manter e melhorar os serviços contratados;</li>
        <li>autenticar usuários e controlar permissões de acesso;</li>
        <li>receber, organizar, qualificar e disponibilizar leads e atendimentos ao cliente responsável;</li>
        <li>operar integrações solicitadas pelo cliente, inclusive com Meta e WhatsApp Business Platform;</li>
        <li>processar cobranças, prestar suporte e enviar comunicações operacionais;</li>
        <li>prevenir fraude, abuso, acesso indevido e incidentes de segurança;</li>
        <li>cumprir obrigações legais, regulatórias e determinações de autoridades competentes.</li>
      </ul>
    ),
  },
  {
    title: '4. Bases legais',
    content: (
      <p>
        O tratamento poderá ocorrer, conforme o caso, para execução de contrato ou procedimentos preliminares, cumprimento de obrigação legal ou regulatória, exercício regular de direitos, legítimo interesse e consentimento, quando este for exigido pela legislação aplicável, especialmente a Lei nº 13.709/2018 (LGPD).
      </p>
    ),
  },
  {
    title: '5. Dados de leads e responsabilidade dos clientes',
    content: (
      <>
        <p>
          Cada cliente é responsável por definir a finalidade, a base legal e os avisos de privacidade aplicáveis aos dados pessoais que coleta por seus formulários, páginas, campanhas e canais de atendimento.
        </p>
        <p>
          A FlipForm fornece a infraestrutura tecnológica para o tratamento desses dados no ambiente do cliente e não autoriza o uso da plataforma para coleta ou tratamento ilícito de informações.
        </p>
      </>
    ),
  },
  {
    title: '6. Integrações com Meta e WhatsApp',
    content: (
      <>
        <p>
          Quando um cliente conecta recursos da Meta ou do WhatsApp Business à FlipForm, a integração ocorre mediante autorização do próprio cliente e de acordo com as permissões disponibilizadas pela Meta.
        </p>
        <p>
          A FlipForm pode processar identificadores técnicos, dados de contas empresariais, números de telefone comerciais, eventos, mensagens e metadados necessários para executar as funcionalidades solicitadas. O tratamento desses dados também está sujeito aos termos e políticas da Meta e do WhatsApp aplicáveis ao cliente e à respectiva conta empresarial.
        </p>
        <p>
          Credenciais e segredos de integração são armazenados e processados exclusivamente no backend quando tecnicamente necessário, com controles destinados a impedir sua exposição a outros clientes da plataforma.
        </p>
      </>
    ),
  },
  {
    title: '7. Compartilhamento de dados',
    content: (
      <>
        <p>
          Podemos compartilhar dados estritamente necessários com fornecedores de infraestrutura, hospedagem, banco de dados, mensageria, autenticação, pagamentos, monitoramento e suporte, sempre para viabilizar a operação da plataforma.
        </p>
        <p>
          Também poderão ocorrer compartilhamentos com a Meta e outros provedores quando o cliente habilitar uma integração, ou com autoridades públicas quando houver obrigação legal ou ordem válida.
        </p>
        <p>A FlipForm não vende dados pessoais.</p>
      </>
    ),
  },
  {
    title: '8. Transferências internacionais',
    content: (
      <p>
        Alguns fornecedores e integrações podem processar dados fora do Brasil. Nesses casos, buscamos utilizar provedores que adotem mecanismos de segurança e proteção compatíveis com a legislação aplicável e com a natureza dos dados tratados.
      </p>
    ),
  },
  {
    title: '9. Retenção e exclusão',
    content: (
      <>
        <p>
          Os dados são mantidos pelo período necessário à prestação dos serviços, ao cumprimento de obrigações legais, ao exercício regular de direitos e às finalidades informadas nesta política.
        </p>
        <p>
          Solicitações de exclusão são avaliadas considerando o papel da FlipForm no tratamento e eventuais obrigações de retenção. Instruções específicas estão disponíveis na página de <Link href="/legal/data-deletion" className="underline font-medium">Exclusão de Dados</Link>.
        </p>
      </>
    ),
  },
  {
    title: '10. Segurança',
    content: (
      <p>
        A FlipForm adota medidas técnicas e organizacionais destinadas a proteger dados contra acesso não autorizado, perda, alteração, divulgação ou destruição indevida. Entre essas medidas estão segregação por tenant, controle de acesso, registros de auditoria, proteção de credenciais e práticas de segurança na infraestrutura. Nenhum sistema, entretanto, é totalmente imune a riscos.
      </p>
    ),
  },
  {
    title: '11. Direitos dos titulares',
    content: (
      <>
        <p>
          Nos termos da LGPD, o titular pode solicitar, conforme aplicável, confirmação da existência de tratamento, acesso, correção, anonimização, bloqueio, eliminação, portabilidade, informação sobre compartilhamentos, revogação do consentimento e revisão de decisões quando cabível.
        </p>
        <p>
          Quando a solicitação estiver relacionada a dados coletados por um cliente da FlipForm, o titular poderá ser orientado a contatar diretamente esse cliente, que atua como controlador daqueles dados.
        </p>
      </>
    ),
  },
  {
    title: '12. Cookies, métricas e tecnologias semelhantes',
    content: (
      <p>
        A plataforma pode utilizar cookies e tecnologias semelhantes necessários para autenticação, segurança, preferências, funcionamento técnico, medição e, quando habilitado pelo cliente ou pela FlipForm de forma legítima, recursos de análise e publicidade. O uso de integrações como Meta Pixel, Conversions API ou ferramentas equivalentes depende da configuração e do contexto aplicável.
      </p>
    ),
  },
  {
    title: '13. Crianças e adolescentes',
    content: (
      <p>
        A FlipForm não é destinada diretamente a crianças. Clientes que utilizem a plataforma para tratar dados de crianças ou adolescentes são responsáveis por observar as exigências legais específicas aplicáveis a esse tratamento.
      </p>
    ),
  },
  {
    title: '14. Alterações desta política',
    content: (
      <p>
        Esta política pode ser atualizada para refletir mudanças legais, técnicas ou operacionais. A versão vigente permanecerá disponível nesta página, com indicação da data de atualização.
      </p>
    ),
  },
  {
    title: '15. Contato',
    content: (
      <p>
        Dúvidas, solicitações sobre privacidade ou exercício de direitos podem ser encaminhados para <a href="mailto:atendimento@flipform.com.br" className="underline font-medium">atendimento@flipform.com.br</a>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-4xl px-6 py-12 sm:py-16">
        <header className="mb-10 border-b border-slate-200 pb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-600">FlipForm</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Política de Privacidade</h1>
          <p className="mt-4 max-w-2xl text-slate-600">
            Esta política explica como a FlipForm trata dados pessoais em sua plataforma, inclusive em integrações autorizadas com Meta e WhatsApp Business.
          </p>
          <p className="mt-3 text-sm text-slate-500">Última atualização: 29 de agosto de 2026.</p>
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
            <Link href="/legal/terms" className="underline">Termos de Uso</Link>
            <Link href="/legal/data-deletion" className="underline">Exclusão de Dados</Link>
            <Link href="/legal/cancellation" className="underline">Política de Cancelamento</Link>
            <Link href="/legal/support" className="underline">Suporte</Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

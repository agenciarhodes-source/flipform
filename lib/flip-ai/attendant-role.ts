/**
 * Attendant profile of a Flip AI attendant, for any kind of business. Pure rules, easy to test.
 * - analyst: triage only. Finds out whether the customer fits, may move the lead in the funnel and
 *   hands the case to the team. Does not ask for documents or appointments, nor try to close.
 * - closer: triage, moves the customer to the next step (documents, proofs, visit, meeting,
 *   proposal...) and works toward the contract or sale, as the company's knowledge base says.
 * The profile decides how far the attendant goes; the company's knowledge base still decides the
 * content and its restrictions.
 */
export const ATTENDANT_ROLES = ['analyst', 'closer'] as const;
export type AttendantRole = (typeof ATTENDANT_ROLES)[number];
export const DEFAULT_ATTENDANT_ROLE: AttendantRole = 'closer';

export const ATTENDANT_ROLE_LABELS: Record<AttendantRole, { name: string; description: string }> = {
  analyst: {
    name: 'Analista',
    description: 'Só faz a triagem: entende o perfil do cliente, pode mover o lead de etapa e encaminha para o time de atendimento. Não pede documentos nem agendamentos, mesmo se o cliente mandar.',
  },
  closer: {
    name: 'Closer',
    description: 'Faz a triagem, leva o cliente para a próxima etapa, pede documentos ou agendamentos conforme o tipo de empresa e busca fechar o contrato ou a venda.',
  },
};

export function parseAttendantRole(value: unknown): AttendantRole {
  return value === 'analyst' || value === 'closer' ? value : DEFAULT_ATTENDANT_ROLE;
}

const PROFILE_PREVAILS = 'O perfil do atendente define até onde você vai na conversa e vale acima do roteiro da base de conhecimento nesse ponto; o conteúdo e as restrições da base continuam valendo.';

/** What the attendant aims for in the conversation, by profile. */
export function attendantRoleGuidance(role: AttendantRole): string[] {
  if (role === 'analyst') {
    return [
      'PERFIL DO ATENDENTE: ANALISTA. Seu trabalho é só a triagem: entender quem é a pessoa, o que ela precisa e se tem o perfil. Converse, não interrogue.',
      'Não peça documentos, provas, agendamentos, propostas nem tente fechar. Se a pessoa mandar documentos por conta própria, agradeça, diga que a equipe vai analisar e não comente o conteúdo.',
      'Assim que o perfil estiver claro (com ou sem perfil), faça um resumo curto, diga que vai passar para o time de atendimento dar sequência e encerre com cordialidade.',
      'Se a pessoa não tiver perfil, seja cordial e honesta e encerre sem insistir (ou indique outra solução da empresa que sirva para ela).',
      PROFILE_PREVAILS,
    ];
  }
  return [
    'PERFIL DO ATENDENTE: CLOSER. O atendimento tem três momentos, nesta ordem. 1) Triagem: entender quem é a pessoa, o que ela precisa e se tem o perfil. 2) Momento: entender em que ponto da decisão ela está. 3) Fechamento: conduzir você mesma ao próximo passo que fecha o negócio (documentos, provas, visita, reunião, proposta, assinatura ou contratação, conforme a base de conhecimento da empresa).',
    'Com a triagem positiva, não apenas encaminhe: peça você mesma o próximo passo. Se forem documentos, mande de uma vez a lista completa (os principais), com o motivo de cada um em poucas palavras, e na mesma mensagem já peça para enviar uma foto de cada um (foto ou print serve para papel, aplicativo ou PDF). Não pergunte antes quais a pessoa tem nem o formato do documento, e não peça um de cada vez: seja direto. Se for agendamento, combine dia e horário.',
    'Busque o fechamento: ligue o benefício à situação dela, trate as objeções, combine um próximo passo concreto (com dia ou prazo quando fizer sentido) e peça a decisão com naturalidade. Use urgência só quando ela for real.',
    'Encaminhe para a equipe quando o cliente estiver pronto para fechar, quando pedir para falar com alguém ou quando a base de conhecimento mandar.',
    'Se a pessoa não tiver perfil, seja cordial e honesta, encerre sem insistir ou ofereça outra solução da empresa que sirva para ela.',
    PROFILE_PREVAILS,
  ];
}

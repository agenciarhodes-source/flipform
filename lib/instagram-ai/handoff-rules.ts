/**
 * When the Instagram attendant must hand the conversation to a person: a complaint about a case or
 * service already hired, someone asking for a specific lawyer or person, a threat to sue, or a
 * person insisting on something the attendant cannot solve. The attendant writes [CHAMAR_EQUIPE]
 * in the reply; the system then pauses the AI in the conversation and creates an urgent task for
 * the team. Pure rules, easy to test.
 */

export const INSTAGRAM_CALL_TEAM = '[CHAMAR_EQUIPE]';

/** The pause reason of a hand-off: it does not come back by itself; a person hands it back. */
export const INSTAGRAM_HANDOFF_PAUSE_REASON = 'ai_handoff';

export function instagramWantsTeam(reply: string | null | undefined) {
  return (reply || '').replace(/\s+/g, '').toUpperCase().includes(INSTAGRAM_CALL_TEAM);
}

/** The reply without the marker. */
export function withoutTeamMarker(reply: string) {
  return reply.replace(/\[\s*CHAMAR[_\s]EQUIPE\s*\]/gi, '').replace(/[ \t]+\n/g, '\n').trim();
}

/** What is sent when the attendant only wrote the marker. */
export const INSTAGRAM_HANDOFF_REPLY = 'Entendo. O nosso time já está cuidando disso e te responde por aqui.';

export const INSTAGRAM_HANDOFF_INSTRUCTION = [
  `CHAMAR A EQUIPE: escreva ${INSTAGRAM_CALL_TEAM} no fim da resposta quando a pessoa: reclamar de um serviço que já contratou`,
  'ou de um caso em andamento; cobrar retorno da empresa ou da equipe; pedir para falar com uma pessoa específica (por exemplo,',
  'o profissional que cuida do caso dela);',
  'ameaçar processar ou denunciar; ou insistir em algo que você não consegue resolver. Nesses casos, responda em uma ou duas',
  'frases acolhedoras dizendo que o nosso time já está cuidando disso e responde por aqui. Não peça dados de novo, não',
  'prometa prazo e não mande para outro canal. Nunca diga "vou encaminhar", "vou chamar um atendente" ou "uma pessoa vai',
  `continuar". Nunca diga que o nosso time está cuidando sem escrever ${INSTAGRAM_CALL_TEAM}: só assim o time é avisado de verdade.`,
].join(' ');

/** Who gets the task: the conversation's attendant; otherwise the managers; otherwise the owners. */
export function handoffRecipients(input: {
  conversationAssignee: string | null;
  members: Array<{ userId: string; role: string; active: boolean }>;
}) {
  const active = input.members.filter((member) => member.active);
  if (input.conversationAssignee && active.some((member) => member.userId === input.conversationAssignee)) {
    return [input.conversationAssignee];
  }
  const managers = active.filter((member) => member.role === 'manager').map((member) => member.userId);
  if (managers.length) return managers;
  return active.filter((member) => member.role === 'owner').map((member) => member.userId);
}

/** The task the team sees. No CPF or other document numbers in it: they stay in the conversation. */
export function handoffTask(input: { contactLabel: string; lastMessages: string[]; conversationId: string; appUrl: string }) {
  const quotes = input.lastMessages
    .map((text) => text.replace(/\s+/g, ' ').replace(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g, '[documento]').trim())
    .filter(Boolean)
    .slice(-4)
    .map((text) => `• ${text.slice(0, 200)}`);
  return {
    title: `Instagram: ${input.contactLabel} precisa de atendimento da equipe`.slice(0, 190),
    description: [
      'A IA do Instagram passou esta conversa para a equipe e parou de responder nela.',
      quotes.length ? `Últimas mensagens:\n${quotes.join('\n')}` : '',
      `Abrir a conversa: ${input.appUrl.replace(/\/$/, '')}/inbox?conversationId=${encodeURIComponent(input.conversationId)}`,
      'Depois de responder, se quiser que a IA volte, use "Devolver para a IA" na conversa.',
    ].filter(Boolean).join('\n\n'),
  };
}

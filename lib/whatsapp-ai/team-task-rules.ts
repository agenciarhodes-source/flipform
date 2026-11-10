/**
 * A task for the team, created by the WhatsApp attendant without stopping the conversation: for
 * example, the customer could not get into gov.br and sent the access, so a person logs in and
 * downloads the INSS extract. The attendant writes [TAREFA_EQUIPE: what to do] at the end of its
 * reply; the customer never sees it, and the system creates an urgent task (1 hour) for the lead's
 * attendant. Pure rules, easy to test.
 */

const MARKER = /\[\s*TAREFA[_\s]EQUIPE([_\s]URGENTE)?\s*:\s*([^\]]{0,400})\]/gi;
/** The customer is stuck (a document, gov.br, does not know how): a person helps within minutes. */
const STUCK = /dificuldade|n[aã]o consegu|n[aã]o sabe|travad|gov\.?br|n[aã]o tem (o |a )?(documento|rg|cpf|extrato)/i;
export const URGENT_TASK_DUE_MINUTES = 5;

export const TEAM_TASK_INSTRUCTION = [
  'TAREFA PARA A EQUIPE: quando algo precisar ser feito por uma pessoa da equipe (por exemplo, o cliente não consegue',
  'entrar no gov.br e mandou o acesso para a equipe entrar por ele, pediu para falar com um atendente, já é cliente e quer',
  'saber do processo, ou a base de conhecimento manda chamar a equipe), escreva no FIM da resposta, numa linha separada:',
  '[TAREFA_EQUIPE: o que a equipe deve fazer, em uma frase]. O cliente não vê essa linha. Nunca coloque senha, CPF ou',
  'outros números de documento nela. Quando o cliente estiver TRAVADO (não consegue um documento, não consegue o gov.br, não',
  'sabe fazer), use [TAREFA_EQUIPE_URGENTE: ...]: uma pessoa ajuda em poucos minutos. Nunca diga ao cliente que',
  '"encaminhou para um atendente": diga que o nosso time vai ajudar e continue a conversa normalmente.',
].join(' ');

/** The reply without the marker, and what the team must do (null when there is no task). */
export function extractTeamTask(reply: string): { reply: string; task: string | null; urgent: boolean } {
  let task: string | null = null;
  let urgent = false;
  const cleaned = reply.replace(MARKER, (_match, flag: string | undefined, what: string) => {
    const text = sanitizeTeamTask(what);
    if (text && !task) {
      task = text;
      urgent = Boolean(flag) || STUCK.test(text);
    }
    return '';
  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { reply: cleaned, task, urgent };
}

/** Keeps the task short and free of passwords and document numbers. */
export function sanitizeTeamTask(value: string) {
  return value
    .replace(/(senha|password)\s*[:=]?\s*\S+/gi, '$1 (na conversa)')
    .replace(/\d[\d.\-/\s]{3,}\d/g, '[número]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 300);
}

/** The urgent task: what to do, and the link to the conversation (where the customer's data is). */
export function teamTaskContent(input: { customerName: string; what: string; conversationId: string; leadId: string | null; appUrl: string; urgent?: boolean }) {
  const base = input.appUrl.replace(/\/$/, '');
  return {
    title: `${input.urgent ? 'URGENTE · ' : ''}WhatsApp: ${input.customerName} — ${input.what}`.slice(0, 190),
    description: [
      `Pedido da IA do WhatsApp: ${input.what}`,
      input.urgent
        ? `O cliente está com dificuldade e precisa de ajuda agora. Assuma a conversa e ajude em até ${URGENT_TASK_DUE_MINUTES} minutos (o que ele mandou, inclusive acessos, está na conversa).`
        : 'O que o cliente mandou (inclusive acessos e senhas) está na conversa: abra pelo link abaixo. Faça em até 1 hora.',
      `Conversa: ${base}/inbox?conversationId=${encodeURIComponent(input.conversationId)}`,
      input.leadId ? `Lead: ${base}/leads?leadId=${encodeURIComponent(input.leadId)}` : '',
      'A IA continua o atendimento normalmente. Depois de fazer, conclua esta tarefa.',
    ].filter(Boolean).join('\n\n'),
  };
}

/** The same request again soon after (the customer repeats, the AI repeats) does not make a second task. */
export function teamTaskKey(what: string) {
  return what.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

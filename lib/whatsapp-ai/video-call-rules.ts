/**
 * Video call on WhatsApp: a customer who asks for one (or accepts the one offered) is for a person
 * of the team. The AI sends nothing: it creates an URGENT task with an on-screen reminder for the
 * lead's attendant (or the next one of the queue) and stops answering in the conversation.
 * Pure rules, easy to test.
 */

const MARKER = /\[\s*CHAMADA[_\s]V[IÍ]DEO\s*\]/gi;

/** The customer's own words asking for a video call. */
const ASKS = new RegExp([
  'chamada\\s+de\\s+v[ií]deo',
  'v[ií]deo\\s*-?\\s*chamada',
  'liga[çc][ãa]o\\s+de\\s+v[ií]deo',
  'liga(r|e|)\\s+(pra mim\\s+|para mim\\s+|me\\s+)?(por|em|no|com)\\s+v[ií]deo',
  'me\\s+liga(r|)\\s+(por|em|no)\\s+v[ií]deo',
  'chamar?\\s+(por|no|em)\\s+v[ií]deo',
  'falar\\s+(por|em|via)\\s+v[ií]deo',
].join('|'), 'i');

export const VIDEO_CALL_INSTRUCTION = [
  'CHAMADA DE VÍDEO: se o cliente aceitar uma chamada de vídeo (ou pedir uma), quem faz é a nossa equipe. Não escreva nada',
  'para o cliente: responda somente [CHAMADA_VIDEO]. Nunca diga que vai chamar ou transferir para alguém.',
].join(' ');

/** "Não quero chamada de vídeo", "sem vídeo": a refusal is not a request. */
const REFUSES = /(^|[^a-zà-ú])(n[ãa]o|nem|sem)\s[^.!?\n]{0,25}v[ií]deo/i;

export function customerAsksVideoCall(text: string | null | undefined) {
  const value = String(text || '');
  return ASKS.test(value) && !REFUSES.test(value);
}

/** The reply without the marker, and whether the AI handed the conversation over for a video call. */
export function extractVideoCall(reply: string): { reply: string; requested: boolean } {
  let requested = false;
  const cleaned = reply.replace(MARKER, () => {
    requested = true;
    return '';
  }).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { reply: cleaned, requested };
}

/** The urgent task of the attendant: call now, with the links to the conversation and the lead. */
export function videoCallTask(input: { customerName: string; conversationId: string; leadId: string | null; appUrl: string }) {
  const base = input.appUrl.replace(/\/$/, '');
  return {
    title: `URGENTE · Chamada de vídeo: ${input.customerName}`.slice(0, 190),
    description: [
      'O cliente pediu uma chamada de vídeo no WhatsApp. Ligue por vídeo agora, pelo WhatsApp da empresa.',
      'A IA não respondeu nada ao cliente e parou de responder nesta conversa: ela é sua.',
      `Conversa: ${base}/inbox?conversationId=${encodeURIComponent(input.conversationId)}`,
      input.leadId ? `Lead: ${base}/leads?leadId=${encodeURIComponent(input.leadId)}` : '',
      'Depois da chamada, conclua esta tarefa. Para a IA voltar a responder, devolva a conversa para a IA no Inbox.',
    ].filter(Boolean).join('\n\n'),
  };
}

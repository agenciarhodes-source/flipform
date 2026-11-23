/**
 * Video call on WhatsApp: a customer who asks for one (or accepts the one offered) is handed to the
 * lead's attendant at once. The AI confirms in one short message and stops answering in the
 * conversation; the attendant gets an URGENT task with an on-screen reminder to call now.
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
  'CHAMADA DE VÍDEO: se o cliente pedir uma chamada de vídeo (ou aceitar a chamada de vídeo que você ofereceu), quem faz é a',
  'nossa atendente. Responda numa mensagem curta confirmando que a atendente vai chamar por vídeo neste WhatsApp em instantes',
  '(por exemplo: "Perfeito! Nossa atendente vai te chamar por vídeo aqui neste WhatsApp em instantes."), sem fazer novas',
  'perguntas e sem marcar horário, e escreva no FIM, numa linha separada: [CHAMADA_VIDEO]. O cliente não vê essa linha.',
  'Depois disso a atendente assume a conversa.',
].join(' ');

/** What the customer sees when the AI hands the conversation over without a reply of its own. */
export const VIDEO_CALL_REPLY = 'Perfeito! Nossa atendente vai te chamar por vídeo aqui neste WhatsApp em instantes.';

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
      'A IA confirmou que a atendente vai chamar em instantes e parou de responder nesta conversa: ela é sua.',
      `Conversa: ${base}/inbox?conversationId=${encodeURIComponent(input.conversationId)}`,
      input.leadId ? `Lead: ${base}/leads?leadId=${encodeURIComponent(input.leadId)}` : '',
      'Depois da chamada, conclua esta tarefa. Para a IA voltar a responder, devolva a conversa para a IA no Inbox.',
    ].filter(Boolean).join('\n\n'),
  };
}

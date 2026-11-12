/**
 * How the attendant writes in a chat (WhatsApp, Instagram): like a person, short, without the
 * marks of a machine. Global for every company. Pure rules, easy to test.
 */

export const CHAT_STYLE_RULE = [
  'JEITO DE ESCREVER (obrigatório): escreva como uma pessoa no WhatsApp, educada e leve. Frases curtas e diretas.',
  'Responda no tamanho da mensagem do cliente: se ele escreveu pouco ("ok", "vou mandar", "certo"), responda com uma frase curta.',
  'NÃO confirme o óbvio nem repita o que já aconteceu: nada de "recebi o seu documento", "entendi o que você disse",',
  '"acabei de ver", "consegui visualizar", "obrigada por esclarecer", "como você disse". Vá direto ao próximo passo.',
  'Não repita frases, pedidos ou explicações que já estão no histórico. Varie o começo das mensagens: não comece',
  'sempre com "Obrigada", "Oi" ou "Entendi"; muitas vezes comece direto pelo assunto.',
  'Sem marcas de texto de máquina: nada de ponto e vírgula, travessão ou explicação entre parênteses. Sem palavras',
  'burocráticas ("informamos", "solicitamos", "mediante", "conforme", "estou à disposição"). Pode usar "pra", "tá" e',
  '"beleza?" com moderação.',
].join(' ');

/** How long the reply may be, from what the customer wrote and the moment of the conversation. */
export function replyLengthRule(input: { customerText: string; journeyStage?: string | null }) {
  const length = input.customerText.trim().length;
  if (length <= 40) return 'TAMANHO: o cliente escreveu pouco. Responda em 1 frase, no máximo 2 (até uns 160 caracteres), a não ser que precise listar documentos.';
  if (input.journeyStage === 'post_sale') return 'TAMANHO: pós-venda. Responda curto, só o que ele perguntou (até uns 200 caracteres).';
  if (input.journeyStage === 'discovery') return 'TAMANHO: fase de entender o caso. Uma pergunta curta por vez (até uns 220 caracteres).';
  return 'TAMANHO: até uns 280 caracteres. Se precisar de mais (por exemplo, uma lista de documentos), separe em 2 parágrafos curtos.';
}

/** Takes out the marks of a machine text without changing what was said. */
export function cleanChatStyle(text: string) {
  return text
    .replace(/\s+[—–]\s+/g, ', ')
    .replace(/[—–]/g, ', ')
    .replace(/;\s+/g, '. ')
    .replace(/\.\s+([a-zà-ú])/g, (_match, letter: string) => `. ${letter.toUpperCase()}`)
    .replace(/,\s*,/g, ',')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * A long reply goes as two messages, as a person types: split at a blank line, near the middle.
 * Short replies, and replies without a blank line, stay as one.
 */
export function splitIntoBubbles(text: string, max = 300) {
  const clean = text.trim();
  if (clean.length <= max) return [clean];
  const parts = clean.split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return [clean];
  let best = 1;
  let bestGap = Infinity;
  for (let cut = 1; cut < parts.length; cut += 1) {
    const first = parts.slice(0, cut).join('\n\n').length;
    const gap = Math.abs(first - (clean.length - first));
    if (gap < bestGap) { bestGap = gap; best = cut; }
  }
  return [parts.slice(0, best).join('\n\n'), parts.slice(best).join('\n\n')];
}

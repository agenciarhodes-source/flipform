/**
 * Pure rules of the Flip AI on the Instagram Direct (no database, no network). Global for every
 * company: what is specific to a business (what to answer, which WhatsApp for each subject) is in
 * the Master Markdown of the attendant chosen for the account.
 */

/** Seconds the AI waits for the person to finish writing before answering. */
export const INSTAGRAM_AI_QUIET_SECONDS = 8;
/** Meta's standard messaging window: an answer goes out up to 24 hours after the person's last message. */
export const INSTAGRAM_AI_WINDOW_HOURS = 23;
/** The Instagram Direct accepts up to 1000 characters per text message. */
export const INSTAGRAM_TEXT_LIMIT = 1000;

/** "@Maria.Silva " -> "maria.silva"; null when it cannot be an Instagram username. */
export function normalizeInstagramUsername(value: string | null | undefined): string | null {
  const name = (value || '').trim().replace(/^@+/, '').toLowerCase();
  // Instagram usernames: letters, numbers, dot and underscore, up to 30 characters.
  if (!/^[a-z0-9._]{1,30}$/.test(name)) return null;
  return name;
}

/**
 * Whether the AI may answer this person: everyone once the account is released, otherwise only
 * the test usernames.
 */
export function instagramAiMayAnswer(input: {
  enabled: boolean;
  agentId: string | null;
  liveEnabled: boolean;
  testUsernames: string[];
  senderUsername: string | null | undefined;
}): { answer: true } | { answer: false; reason: 'disabled' | 'no_agent' | 'not_a_test_profile' } {
  if (!input.enabled) return { answer: false, reason: 'disabled' };
  if (!input.agentId) return { answer: false, reason: 'no_agent' };
  if (input.liveEnabled) return { answer: true };
  const sender = normalizeInstagramUsername(input.senderUsername);
  if (sender && input.testUsernames.map(normalizeInstagramUsername).includes(sender)) return { answer: true };
  return { answer: false, reason: 'not_a_test_profile' };
}

/** What the AI reads when the person sent something other than text. */
export const INSTAGRAM_MEDIA_NOTES: Record<string, string> = {
  image: '[A pessoa enviou uma imagem pelo Direct.]',
  video: '[A pessoa enviou um vídeo pelo Direct.]',
  audio: '[A pessoa enviou um áudio pelo Direct, que você não consegue ouvir. Peça, com gentileza, que escreva a mensagem.]',
  document: '[A pessoa enviou um arquivo pelo Direct.]',
  sticker: '[A pessoa enviou uma figurinha.]',
  unknown: '[A pessoa enviou algo que não é texto (por exemplo, uma publicação, um story ou uma reação).]',
};

/** The Direct shows plain text: no Markdown, and at most 1000 characters (cut at the end of a sentence). */
export function toInstagramText(value: string) {
  const plain = value
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|\s)\*(\S[^*\n]*?)\*(?=\s|$|[.,!?;:])/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (plain.length <= INSTAGRAM_TEXT_LIMIT) return plain;
  const cut = plain.slice(0, INSTAGRAM_TEXT_LIMIT);
  const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '), cut.lastIndexOf('\n'));
  return (end > INSTAGRAM_TEXT_LIMIT * 0.5 ? cut.slice(0, end + 1) : cut.slice(0, INSTAGRAM_TEXT_LIMIT - 1)).trim();
}

/** Instructions of the Instagram channel, added after the attendant's own (its Markdown comes first). */
export function instagramInstructions(input: {
  companyName: string;
  introduction: string;
  firstReply: boolean;
  /** The person's first name when it is clearly a name (Instagram profile). */
  firstName: string | null;
}) {
  return [
    `CANAL INSTAGRAM DIRECT: você está respondendo pelo Direct do Instagram de ${input.companyName}.`,
    'SEU OBJETIVO AQUI: entender o que a pessoa busca e responder com base na base de conhecimento. Se a base de conhecimento'
      + ' indicar um canal para o assunto (por exemplo, o link do WhatsApp do setor certo), envie esse link com uma frase curta'
      + ' explicando que lá a equipe continua o atendimento. Nunca invente links, telefones ou endereços.',
    'Se ainda não estiver claro o que a pessoa quer, faça uma pergunta curta para entender, uma de cada vez.',
    'Escreva como numa conversa de Direct: mensagens curtas e naturais, de uma a três frases, sem títulos, sem listas longas e'
      + ' sem asteriscos ou outra formatação (o Direct mostra só texto simples).',
    'Não peça telefone, CPF, documentos, endereço ou outros dados pessoais pelo Direct, a não ser que a base de conhecimento'
      + ' mande. Nunca peça senhas.',
    `APRESENTAÇÃO: você não usa nome próprio; você é a ${input.introduction}.`,
    input.firstReply
      ? `Esta é a sua primeira resposta nesta conversa: apresente-se apenas como ${input.introduction}, em poucas palavras.`
      : 'Não se apresente de novo.',
    'Nunca diga que é uma pessoa. Se perguntarem se é um robô, diga com naturalidade que é uma assistente automática.',
    'Se a pessoa pedir para falar com alguém da equipe, diga que vai avisar a equipe ou, se a base de conhecimento indicar um'
      + ' canal para isso, envie o link.',
    input.firstName
      ? `NOME: o perfil da pessoa indica o nome "${input.firstName}". Pode usá-lo, com moderação (no máximo uma vez a cada 3 ou 4 mensagens). Não pergunte o nome.`
      : 'NOME: você não sabe o nome da pessoa e não precisa perguntar. Não use nenhum nome.',
    'NUNCA diga que a pessoa não tem direito, não se enquadra ou que não há o que fazer. Se parecer que não há caminho, diga que'
      + ' a equipe pode analisar com calma e, se houver, indique o canal da base de conhecimento.',
    'Não cite fontes nem coloque links de sites que não estejam na base de conhecimento.',
  ].join('\n');
}

/**
 * When the attendant's reply is delivered as audio instead of chat bubbles.
 *
 * Deterministic: a reply goes out as audio when the person asked to be answered by voice
 * (a fact kept in the conversation memory) or when the explanation is too long to read
 * comfortably in two bubbles. Receiving a voice message does not, by itself, cause an audio reply.
 */

/** Longer than two full bubbles: the explanation is better heard than read. */
export const FLIP_AI_AUDIO_REPLY_MIN_CHARACTERS = 420;
/** Upper bound of what is turned into speech in one reply. */
export const FLIP_AI_AUDIO_REPLY_MAX_CHARACTERS = 1_600;
/** Memory fact the attendant records when the person asks for audio or cannot read. */
export const FLIP_AI_AUDIO_PREFERENCE_KEY = 'prefere_audio';

type MemoryFact = { key: string; value: string | null };
type MemoryFactPatch = { action: 'upsert' | 'remove'; key: string; value: string | null };

function affirmative(value: string | null) {
  return /^\s*(sim|s|true|yes|1)\b/i.test(value || '');
}

/** The preference after this turn: what was stored, changed by what the attendant just recorded. */
export function prefersAudioReplies(stored: MemoryFact[] = [], patch: MemoryFactPatch[] = []) {
  let preference = stored.some((fact) => fact.key === FLIP_AI_AUDIO_PREFERENCE_KEY && affirmative(fact.value));
  for (const change of patch) {
    if (change.key !== FLIP_AI_AUDIO_PREFERENCE_KEY) continue;
    preference = change.action === 'upsert' && affirmative(change.value);
  }
  return preference;
}

export function shouldReplyWithAudio(input: {
  reply: string;
  storedFacts?: MemoryFact[];
  patchFacts?: MemoryFactPatch[];
}) {
  if (!input.reply.trim()) return false;
  if (prefersAudioReplies(input.storedFacts, input.patchFacts)) return true;
  return input.reply.trim().length > FLIP_AI_AUDIO_REPLY_MIN_CHARACTERS;
}

export function audioReplyInstructions() {
  return [
    'RESPOSTA EM ÁUDIO: você não responde em áudio só porque a pessoa mandou um áudio. O áudio serve para explicações que não cabem em duas mensagens curtas, como o passo a passo de um processo ou uma comparação detalhada.',
    'Nesses casos, em vez de dividir em mensagens, escreva a explicação completa em um único texto corrido, entre 450 e 900 caracteres, com frases simples e naturais de quem está falando, sem listas, títulos ou símbolos. Esse texto será entregue à pessoa como um áudio. Para respostas simples, continue usando mensagens curtas.',
    `Se a pessoa pedir para ser atendida por áudio, ou disser que não sabe ou não consegue ler, registre em memoryPatch o fato ${FLIP_AI_AUDIO_PREFERENCE_KEY} com valor sim. Enquanto esse fato existir, todas as suas respostas serão entregues em áudio: escreva como fala, de forma curta e clara. Se ela pedir para voltar a receber texto, remova esse fato.`,
  ];
}

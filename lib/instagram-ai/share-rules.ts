/**
 * Things a person shares on the Instagram Direct instead of writing: a Reels, a post or a story
 * mention. Meta sends them as attachments with their own types. Pure rules, used by the webhook,
 * the inbox and the AI attendant.
 */

export type InstagramShareKind = 'reel' | 'post' | 'story_mention';

const SHARE_KINDS: Record<string, InstagramShareKind> = {
  ig_reel: 'reel',
  reel: 'reel',
  share: 'post',
  ig_post: 'post',
  story_mention: 'story_mention',
};

const SHARE_LABELS: Record<InstagramShareKind, string> = {
  reel: 'Compartilhou um Reels',
  post: 'Compartilhou uma publicação',
  story_mention: 'Mencionou a empresa num story',
};

/** The kind of share of a Meta attachment type, or null when it is not a share. */
export function instagramShareKind(providerType: unknown): InstagramShareKind | null {
  return typeof providerType === 'string' ? SHARE_KINDS[providerType] || null : null;
}

/** The caption Meta sends with a shared Reels or post, cleaned and kept short. */
export function instagramShareTitle(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 200) : null;
}

/** What the inbox shows for a share: "Compartilhou um Reels: <legenda>". */
export function instagramShareLabel(kind: InstagramShareKind, title?: string | null) {
  const label = SHARE_LABELS[kind];
  return title ? `${label}: “${title}”` : label;
}

/** What the AI attendant reads: what was shared, and that it cannot watch it. */
export function instagramShareNote(kind: InstagramShareKind, title?: string | null) {
  const caption = title ? ` A legenda é: "${title}".` : '';
  if (kind === 'story_mention') {
    return '[A pessoa mencionou a empresa num story do Instagram. Você não consegue ver o story. Agradeça a menção e pergunte, com gentileza, como pode ajudar.]';
  }
  const what = kind === 'reel' ? 'um Reels (vídeo)' : 'uma publicação';
  return `[A pessoa compartilhou ${what} pelo Direct.${caption} Você não consegue assistir nem ver a imagem. Não finja que viu: use a legenda, se houver, e pergunte, com gentileza, o que ela gostaria de saber sobre isso.]`;
}

/**
 * Messages Instagram sends without text and without any content a system can see. In practice this is
 * a person tagging the company in a story (private profile or close friends), or something like it.
 */
export function instagramIsHiddenContent(message: { type: string; text: string | null; metadata: unknown }) {
  if (message.text?.trim()) return false;
  const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
    ? message.metadata as Record<string, unknown> : {};
  const types = Array.isArray(metadata.attachmentTypes) ? metadata.attachmentTypes : [];
  return message.type === 'unknown' && (metadata.providerType === 'unknown' || metadata.providerType === undefined) && types.length === 0;
}

/** A tag in a story, or a message Instagram does not show: answered only with a thank-you. */
export function instagramIsThankOnly(message: { type: string; text: string | null; metadata: unknown }) {
  if (message.text?.trim()) return false;
  const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
    ? message.metadata as Record<string, unknown> : {};
  return instagramShareKind(metadata.providerType) === 'story_mention' || instagramIsHiddenContent(message);
}

/** The fixed thank-you for a tag: short, warm and with no question. */
export const INSTAGRAM_TAG_THANKS = 'Obrigada por marcar a gente! 💙';

/** What the inbox shows for the other things Instagram sends without text. */
export function instagramOtherLabel(message: { type: string; text: string | null; metadata: unknown }): string | null {
  const metadata = message.metadata && typeof message.metadata === 'object' && !Array.isArray(message.metadata)
    ? message.metadata as Record<string, unknown> : {};
  if (metadata.providerType === 'ephemeral') return 'Foto ou vídeo de visualização única (só abre no app do Instagram).';
  if (metadata.providerType === 'template') return 'Compartilhou um cartão ou publicação de loja (veja no Instagram).';
  if (instagramIsHiddenContent(message)) return 'Marcação ou mensagem que o Instagram não mostra para sistemas (por exemplo, marcação num story). Veja no Instagram.';
  return null;
}

/** What the AI reads for the other things Instagram sends without text. */
export function instagramOtherNote(providerType: unknown): string | null {
  if (providerType === 'ephemeral') return '[A pessoa enviou uma foto ou vídeo de visualização única, que você não consegue ver. Se for sobre o atendimento, peça, com gentileza, que envie de novo como foto comum ou conte por escrito.]';
  if (providerType === 'template') return '[A pessoa compartilhou um cartão ou uma publicação de loja, que você não consegue ver. Pergunte, com gentileza, o que ela gostaria de saber.]';
  return null;
}

/** What the AI writes, alone, when the message is not about the company: nothing is sent. */
export const INSTAGRAM_NO_REPLY = '[SEM_RESPOSTA]';

export function instagramWantsNoReply(reply: string | null | undefined) {
  return (reply || '').replace(/\s+/g, '').toUpperCase().includes('[SEM_RESPOSTA]');
}

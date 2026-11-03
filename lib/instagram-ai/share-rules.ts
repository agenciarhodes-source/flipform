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

/**
 * Photos sent on the Instagram Direct. Meta gives a temporary address of the photo on its own
 * servers; only those addresses are kept and read, never any other site.
 */

const INSTAGRAM_MEDIA_HOSTS = ['fbcdn.net', 'fbsbx.com', 'cdninstagram.com'];

/** The photo's address when it is an https address on Meta's servers, otherwise null. */
export function instagramMediaUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 4_000) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  const allowed = INSTAGRAM_MEDIA_HOSTS.some((domain) => host === domain || host.endsWith(`.${domain}`));
  return allowed ? url.toString() : null;
}

/** What the attendant reads about a photo, from the short description (or the plain notice). */
export function instagramImageNote(description: string | null | undefined) {
  const text = (description || '').replace(/\s+/g, ' ').trim().slice(0, 400);
  return text
    ? `[A pessoa enviou uma imagem pelo Direct. O que aparece nela: ${text}]`
    : '[A pessoa enviou uma imagem pelo Direct, mas não foi possível ver o conteúdo. Peça, com gentileza, que conte por escrito o que a imagem mostra.]';
}

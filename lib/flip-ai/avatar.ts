export const FLIP_AI_AVATAR_MAX_BYTES = 120 * 1024;
export const FLIP_AI_AGENT_BODY_MAX_BYTES = 180 * 1024;

export const FLIP_AI_AVATAR_ACCEPTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export function isSupportedFlipAiAvatarMimeType(
  value: string,
): value is (typeof FLIP_AI_AVATAR_ACCEPTED_MIME_TYPES)[number] {
  return FLIP_AI_AVATAR_ACCEPTED_MIME_TYPES.includes(
    value as (typeof FLIP_AI_AVATAR_ACCEPTED_MIME_TYPES)[number],
  );
}

export function getFlipAiAvatarDataUrlSize(value: string): number | null {
  const match = DATA_URL_RE.exec(value);
  if (!match) return null;
  const payload = match[2];
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export function isValidFlipAiAvatar(value: string): boolean {
  if (!value) return true;
  const size = getFlipAiAvatarDataUrlSize(value);
  return size !== null && size <= FLIP_AI_AVATAR_MAX_BYTES;
}


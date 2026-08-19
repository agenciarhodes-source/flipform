export const FORM_LOGO_MAX_BYTES = 150 * 1024;

export const FORM_LOGO_ACCEPTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export function isSupportedFormLogoMimeType(value: string): value is (typeof FORM_LOGO_ACCEPTED_MIME_TYPES)[number] {
  return FORM_LOGO_ACCEPTED_MIME_TYPES.includes(value as (typeof FORM_LOGO_ACCEPTED_MIME_TYPES)[number]);
}

export function getFormLogoDataUrlSize(value: string): number | null {
  const match = DATA_URL_RE.exec(value);
  if (!match) return null;

  const payload = match[2];
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export function isValidFormLogoValue(value: string): boolean {
  if (!value.startsWith('data:')) return true;
  const size = getFormLogoDataUrlSize(value);
  return size !== null && size <= FORM_LOGO_MAX_BYTES;
}

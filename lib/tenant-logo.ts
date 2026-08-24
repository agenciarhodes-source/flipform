export const TENANT_LOGO_MAX_BYTES = 120 * 1024;

export const TENANT_LOGO_ACCEPTED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
] as const;

const DATA_URL_RE = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/;

export function isSupportedTenantLogoMimeType(value: string): value is (typeof TENANT_LOGO_ACCEPTED_MIME_TYPES)[number] {
  return TENANT_LOGO_ACCEPTED_MIME_TYPES.includes(value as (typeof TENANT_LOGO_ACCEPTED_MIME_TYPES)[number]);
}

export function getTenantLogoDataUrlSize(value: string): number | null {
  const match = DATA_URL_RE.exec(value);
  if (!match) return null;

  const payload = match[2];
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((payload.length * 3) / 4) - padding);
}

export function isValidTenantLogoValue(value: string): boolean {
  if (!value) return true;

  if (value.startsWith('data:')) {
    const size = getTenantLogoDataUrlSize(value);
    return size !== null && size <= TENANT_LOGO_MAX_BYTES;
  }

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export const ATTRIBUTION_LIMITS = {
  utm: 255,
  clickId: 1024,
  url: 2048,
  serverValue: 1024,
} as const;

export type PublicAttribution = {
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  fbclid: string | null;
  gclid: string | null;
  landingPage: string | null;
  referrer: string | null;
};

export function normalizeAttributionString(value: string | null | undefined, maxLength: number): string | null {
  const normalized = value?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

/** Captures only browser-owned acquisition context, including the actual custom-domain URL. */
export function buildPublicAttribution(locationHref: string, referrer: string): PublicAttribution {
  let params = new URLSearchParams();
  try {
    params = new URL(locationHref).searchParams;
  } catch {
    // A malformed URL must never prevent a form submission.
  }
  const utm = (name: string) => normalizeAttributionString(params.get(name), ATTRIBUTION_LIMITS.utm);
  return {
    utmSource: utm('utm_source'),
    utmMedium: utm('utm_medium'),
    utmCampaign: utm('utm_campaign'),
    utmContent: utm('utm_content'),
    utmTerm: utm('utm_term'),
    fbclid: normalizeAttributionString(params.get('fbclid'), ATTRIBUTION_LIMITS.clickId),
    gclid: normalizeAttributionString(params.get('gclid'), ATTRIBUTION_LIMITS.clickId),
    landingPage: normalizeAttributionString(locationHref, ATTRIBUTION_LIMITS.url),
    referrer: normalizeAttributionString(referrer, ATTRIBUTION_LIMITS.url),
  };
}

export function parseAttributionCookies(cookieHeader: string | null): { fbc: string | null; fbp: string | null } {
  const cookies = new Map<string, string>();
  for (const part of (cookieHeader || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const name = part.slice(0, separator).trim();
    const rawValue = part.slice(separator + 1);
    try {
      cookies.set(name, decodeURIComponent(rawValue));
    } catch {
      cookies.set(name, rawValue);
    }
  }
  return {
    fbc: normalizeAttributionString(cookies.get('_fbc'), ATTRIBUTION_LIMITS.serverValue),
    fbp: normalizeAttributionString(cookies.get('_fbp'), ATTRIBUTION_LIMITS.serverValue),
  };
}

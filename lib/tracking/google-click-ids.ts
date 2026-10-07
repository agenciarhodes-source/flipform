export const GOOGLE_CLICK_ID_MAX_LENGTH = 1024;

export const googleClickIdKinds = ['gclid', 'gbraid', 'wbraid'] as const;
export type GoogleClickIdKind = (typeof googleClickIdKinds)[number];

export type GoogleClickIds = {
  gclid: string | null;
  gbraid: string | null;
  wbraid: string | null;
};

/** Click IDs are opaque: they are stored exactly as received or not stored at all. */
export function normalizeGoogleClickId(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  if (!normalized || normalized.length > GOOGLE_CLICK_ID_MAX_LENGTH) return null;
  return /^[A-Za-z0-9._~-]+$/.test(normalized) ? normalized : null;
}

export function parseGoogleClickIds(locationHref: string): GoogleClickIds {
  let params = new URLSearchParams();
  try {
    params = new URL(locationHref).searchParams;
  } catch {
    // A malformed URL must never prevent a form submission.
  }
  return {
    gclid: normalizeGoogleClickId(params.get('gclid')),
    gbraid: normalizeGoogleClickId(params.get('gbraid')),
    wbraid: normalizeGoogleClickId(params.get('wbraid')),
  };
}

/**
 * First-touch preservation: a stored click ID is never erased or replaced by a
 * later stage move, edit or resubmission. Only missing values are filled.
 */
export function mergeGoogleClickIds(
  stored: Partial<GoogleClickIds> | null | undefined,
  incoming: Partial<GoogleClickIds> | null | undefined,
): GoogleClickIds {
  const pick = (kind: GoogleClickIdKind) =>
    normalizeGoogleClickId(stored?.[kind]) ?? normalizeGoogleClickId(incoming?.[kind]);
  return { gclid: pick('gclid'), gbraid: pick('gbraid'), wbraid: pick('wbraid') };
}

/**
 * Google accepts a single click identifier per conversion. `gclid` wins; the
 * iOS identifiers are used only when no `gclid` was captured.
 */
export function selectGoogleClickIdentifier(
  ids: Partial<GoogleClickIds> | null | undefined,
): { kind: GoogleClickIdKind; value: string } | null {
  for (const kind of googleClickIdKinds) {
    const value = normalizeGoogleClickId(ids?.[kind]);
    if (value) return { kind, value };
  }
  return null;
}

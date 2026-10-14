import { EXTERNAL_LEAD_SOURCES } from '../leads';

/**
 * Where a lead created by the attendant came from, read from the campaign tags of the page the
 * chat was opened on. The tags decide; a click identifier only fills in when there are no tags.
 * Without any of them the lead keeps the attendant itself as its origin.
 */

export const FLIP_AI_DEFAULT_LEAD_SOURCE = 'flip_ai';

export type FlipAiLeadSourceInput = {
  utmSource?: string | null;
  utmMedium?: string | null;
  fbclid?: string | null;
  fbc?: string | null;
  gclid?: string | null;
} | null | undefined;

const KNOWN_SOURCES = new Set<string>(EXTERNAL_LEAD_SOURCES.map((source) => source.value));

function tag(value: string | null | undefined) {
  return String(value || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

export function resolveFlipAiLeadSource(attribution: FlipAiLeadSourceInput): string {
  const source = tag(attribution?.utmSource);
  const medium = tag(attribution?.utmMedium);
  // A paid medium, or a source that already says "ads", marks a campaign rather than organic reach.
  const paid = /(^|_)(cpc|ppc|cpm|cpa|paid|pago|ads?|anuncios?|trafego_pago)(_|$)/.test(medium)
    || /ads?$|adwords/.test(source);

  if (source) {
    if (/^(meta|facebook|fb|instagram|ig)(_|$)|^(metaads|facebookads|instagramads)$/.test(source)) {
      if (paid || source.startsWith('meta')) return 'meta_ads';
      return /^(instagram|ig)/.test(source) ? 'instagram' : 'facebook';
    }
    if (/^(google|adwords|googleads|youtube)(_|$)|^googleads$/.test(source)) {
      return paid || Boolean(attribution?.gclid) ? 'google_ads' : 'google';
    }
    if (/^tiktok/.test(source)) return paid ? 'tiktok_ads' : 'tiktok';
    if (KNOWN_SOURCES.has(source)) return source;
    return FLIP_AI_DEFAULT_LEAD_SOURCE;
  }

  // No campaign tags. A Google click identifier only exists on ads; Meta adds its identifier to
  // organic links too, so it only says the person came from Facebook or Instagram.
  if (attribution?.gclid) return 'google_ads';
  if (attribution?.fbclid || attribution?.fbc) return 'facebook';
  return FLIP_AI_DEFAULT_LEAD_SOURCE;
}

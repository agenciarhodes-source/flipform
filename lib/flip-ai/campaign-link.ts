import { formatLeadSource } from '../leads';
import { resolveFlipAiLeadSource } from './lead-source';

/**
 * Builds the tagged link of an attendant's chat for a campaign, in the standard the lead origin
 * reads. Each ad platform also gets the exact text for its own parameter field.
 */

export const CAMPAIGN_LINK_PLATFORMS = [
  { value: 'meta_ads', label: 'Meta Ads (Facebook e Instagram)', source: 'meta_ads', medium: 'cpc' },
  { value: 'google_ads', label: 'Google Ads', source: 'google_ads', medium: 'cpc' },
  { value: 'tiktok_ads', label: 'TikTok Ads', source: 'tiktok', medium: 'paid' },
  { value: 'instagram', label: 'Instagram orgânico (bio, stories)', source: 'instagram', medium: 'social' },
  { value: 'facebook', label: 'Facebook orgânico', source: 'facebook', medium: 'social' },
  { value: 'site', label: 'Site', source: 'site', medium: 'referral' },
] as const;

export type CampaignLinkPlatform = (typeof CAMPAIGN_LINK_PLATFORMS)[number]['value'];

/** Lowercase, no accents, words joined by "_": the form every report groups the same way. */
export function campaignTag(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 80);
}

export type CampaignLink = {
  /** The whole link, ready to paste anywhere. */
  fullUrl: string;
  /** For ad platforms: the plain chat address goes in the link field and this text in the parameter field. */
  platformField: { label: string; value: string } | null;
  baseUrl: string;
  /** The origin a lead from this link will show. */
  expectedOrigin: string;
};

export function buildCampaignLink(input: {
  baseUrl: string;
  platform: CampaignLinkPlatform;
  campaign: string;
  content?: string;
}): CampaignLink {
  const platform = CAMPAIGN_LINK_PLATFORMS.find((item) => item.value === input.platform) || CAMPAIGN_LINK_PLATFORMS[0];
  const campaign = campaignTag(input.campaign);
  const content = campaignTag(input.content || '');
  const params = new URLSearchParams({ utm_source: platform.source, utm_medium: platform.medium });
  if (campaign) params.set('utm_campaign', campaign);
  if (content) params.set('utm_content', content);
  const baseUrl = input.baseUrl.replace(/[?#].*$/, '');

  let platformField: CampaignLink['platformField'] = null;
  if (platform.value === 'meta_ads') {
    // Meta fills the double-brace fields with the names of the campaign, ad set and ad.
    platformField = {
      label: 'Parâmetros de URL (no anúncio da Meta)',
      value: [
        `utm_source=${platform.source}`,
        `utm_medium=${platform.medium}`,
        `utm_campaign=${campaign || '{{campaign.name}}'}`,
        `utm_content=${content || '{{ad.name}}'}`,
        'utm_term={{adset.name}}',
      ].join('&'),
    };
  } else if (platform.value === 'google_ads' || platform.value === 'tiktok_ads') {
    platformField = {
      label: platform.value === 'google_ads' ? 'Sufixo do URL final (na campanha do Google Ads)' : 'Parâmetros de URL (no anúncio do TikTok)',
      value: params.toString(),
    };
  }

  return {
    fullUrl: `${baseUrl}?${params.toString()}`,
    platformField,
    baseUrl,
    expectedOrigin: formatLeadSource(resolveFlipAiLeadSource({ utmSource: platform.source, utmMedium: platform.medium })),
  };
}

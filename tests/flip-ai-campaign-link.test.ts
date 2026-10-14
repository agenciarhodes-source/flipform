import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCampaignLink, campaignTag } from '../lib/flip-ai/campaign-link';
import { resolveFlipAiLeadSource } from '../lib/flip-ai/lead-source';

const baseUrl = 'https://app.flipform.com.br/chat/maternidade';

test('o nome da campanha vira uma etiqueta padronizada', () => {
  assert.equal(campaignTag('Maternidade Rural - Outubro'), 'maternidade_rural_outubro');
  assert.equal(campaignTag('  Pensão por Morte!! '), 'pensao_por_morte');
});

test('cada plataforma recebe o texto do seu campo e a origem esperada', () => {
  const meta = buildCampaignLink({ baseUrl, platform: 'meta_ads', campaign: '' });
  assert.equal(meta.expectedOrigin, 'Meta Ads');
  assert.equal(meta.platformField?.value,
    'utm_source=meta_ads&utm_medium=cpc&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}');
  assert.equal(meta.fullUrl, `${baseUrl}?utm_source=meta_ads&utm_medium=cpc`);

  const google = buildCampaignLink({ baseUrl: `${baseUrl}?x=1`, platform: 'google_ads', campaign: 'Maternidade Rural' });
  assert.equal(google.baseUrl, baseUrl);
  assert.equal(google.platformField?.value, 'utm_source=google_ads&utm_medium=cpc&utm_campaign=maternidade_rural');
  assert.equal(google.expectedOrigin, 'Google Ads');

  const bio = buildCampaignLink({ baseUrl, platform: 'instagram', campaign: 'bio' });
  assert.equal(bio.platformField, null);
  assert.equal(bio.expectedOrigin, 'Instagram');
});

test('todo link gerado é lido com a origem que o gerador promete', () => {
  for (const platform of ['meta_ads', 'google_ads', 'tiktok_ads', 'instagram', 'facebook', 'site'] as const) {
    const link = buildCampaignLink({ baseUrl, platform, campaign: 'teste' });
    const params = new URL(link.fullUrl).searchParams;
    const source = resolveFlipAiLeadSource({ utmSource: params.get('utm_source'), utmMedium: params.get('utm_medium') });
    assert.notEqual(source, 'flip_ai', platform);
  }
});

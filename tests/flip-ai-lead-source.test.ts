import assert from 'node:assert/strict';
import test from 'node:test';

import { resolveFlipAiLeadSource } from '../lib/flip-ai/lead-source';

test('a origem do lead vem das tags da campanha', () => {
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'MetaAds' }), 'meta_ads');
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'meta_ads', utmMedium: 'cpc' }), 'meta_ads');
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'facebook', utmMedium: 'paid' }), 'meta_ads');
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'ig', utmMedium: 'Anúncio' }), 'meta_ads');
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'instagram', utmMedium: 'bio' }), 'instagram');
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'facebook', utmMedium: 'social' }), 'facebook');
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'google', utmMedium: 'cpc' }), 'google_ads');
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'google_ads' }), 'google_ads');
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'google', gclid: 'abc' }), 'google_ads');
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'google', utmMedium: 'organic' }), 'google');
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'tiktok', utmMedium: 'paid' }), 'tiktok_ads');
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'tiktok' }), 'tiktok');
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'site' }), 'site');
});

test('sem tags, o identificador de clique ajuda e o restante fica com o atendente de IA', () => {
  assert.equal(resolveFlipAiLeadSource({ gclid: 'abc' }), 'google_ads');
  // Meta adds its identifier to organic links too, so it never proves an ad on its own.
  assert.equal(resolveFlipAiLeadSource({ fbclid: 'abc' }), 'facebook');
  assert.equal(resolveFlipAiLeadSource({ fbc: 'fb.1.2.abc' }), 'facebook');
  assert.equal(resolveFlipAiLeadSource(null), 'flip_ai');
  assert.equal(resolveFlipAiLeadSource({}), 'flip_ai');
  // A tag nobody recognises is not turned into an invented origin.
  assert.equal(resolveFlipAiLeadSource({ utmSource: 'newsletter-outubro' }), 'flip_ai');
});

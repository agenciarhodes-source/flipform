import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import {
  mergeGoogleClickIds,
  normalizeGoogleClickId,
  parseGoogleClickIds,
  selectGoogleClickIdentifier,
} from '../lib/tracking/google-click-ids';
import {
  GOOGLE_CONVERSION_MAX_ATTEMPTS,
  buildGoogleConversionIdempotencyKey,
  canTransitionGoogleConversionEvent,
  googleConversionEventStates,
  googleFunnelMappingSchema,
  isTerminalGoogleConversionEventState,
  normalizeGoogleAdsCustomerId,
  parseGoogleConversionActionResource,
  planGoogleConversionRetry,
  resolveGoogleConversionValue,
  toSafeGoogleConversionErrorCode,
} from '../lib/tracking/google-funnel';

const validMapping = {
  pipelineId: 'pipeline-1',
  stageId: 'stage-1',
  conversionActionResource: 'customers/1234567890/conversionActions/987654321',
  conversionCategory: 'qualified_lead',
};

test('captura gclid, gbraid e wbraid sem alterar o valor recebido', () => {
  const ids = parseGoogleClickIds('https://form.example.com/f/x?gclid=Cj0KCQ_abc-123&gbraid=0AAAAA_b&wbraid=1BBBB-c&utm_source=google');
  assert.deepEqual(ids, { gclid: 'Cj0KCQ_abc-123', gbraid: '0AAAAA_b', wbraid: '1BBBB-c' });
  assert.deepEqual(parseGoogleClickIds('url inválida'), { gclid: null, gbraid: null, wbraid: null });
  assert.equal(normalizeGoogleClickId('  abc  '), 'abc');
  assert.equal(normalizeGoogleClickId('abc def'), null);
  assert.equal(normalizeGoogleClickId('abc;drop'), null);
  assert.equal(normalizeGoogleClickId('a'.repeat(1025)), null);
  assert.equal(normalizeGoogleClickId(''), null);
});

test('preserva a atribuição já armazenada e só preenche o que falta', () => {
  const merged = mergeGoogleClickIds({ gclid: 'original', gbraid: null }, { gclid: 'novo', gbraid: 'g-1', wbraid: 'w-1' });
  assert.deepEqual(merged, { gclid: 'original', gbraid: 'g-1', wbraid: 'w-1' });
  assert.deepEqual(mergeGoogleClickIds({ gclid: 'original' }, null), { gclid: 'original', gbraid: null, wbraid: null });
  assert.deepEqual(mergeGoogleClickIds(null, null), { gclid: null, gbraid: null, wbraid: null });
});

test('seleciona um único identificador de clique por conversão', () => {
  assert.deepEqual(selectGoogleClickIdentifier({ gclid: 'g', gbraid: 'gb', wbraid: 'wb' }), { kind: 'gclid', value: 'g' });
  assert.deepEqual(selectGoogleClickIdentifier({ gclid: null, gbraid: 'gb', wbraid: 'wb' }), { kind: 'gbraid', value: 'gb' });
  assert.deepEqual(selectGoogleClickIdentifier({ wbraid: 'wb' }), { kind: 'wbraid', value: 'wb' });
  assert.equal(selectGoogleClickIdentifier({}), null);
  assert.equal(selectGoogleClickIdentifier(null), null);
});

test('valida a ação de conversão real da conta do cliente', () => {
  assert.deepEqual(parseGoogleConversionActionResource(' customers/1234567890/conversionActions/55 '), {
    customerId: '1234567890',
    conversionActionId: '55',
  });
  assert.equal(parseGoogleConversionActionResource('AW-123456789/abcDEF'), null);
  assert.equal(parseGoogleConversionActionResource('customers/abc/conversionActions/1'), null);
  assert.equal(parseGoogleConversionActionResource(null), null);
  assert.equal(normalizeGoogleAdsCustomerId('123-456-7890'), '1234567890');
  assert.equal(normalizeGoogleAdsCustomerId('12345'), null);
});

test('mapeamento nasce desativado, secundário e sem valor', () => {
  const parsed = googleFunnelMappingSchema.parse(validMapping);
  assert.equal(parsed.enabled, false);
  assert.equal(parsed.optimizationRole, 'secondary');
  assert.equal(parsed.valueMode, 'none');
  assert.equal(parsed.currency, 'BRL');
});

test('valor e moeda são validados no servidor', () => {
  const fixed = googleFunnelMappingSchema.parse({ ...validMapping, valueMode: 'fixed', conversionValue: 100.5, currency: 'usd' });
  assert.equal(fixed.conversionValue, 100.5);
  assert.equal(fixed.currency, 'USD');

  const invalid = [
    { ...validMapping, valueMode: 'fixed' },
    { ...validMapping, valueMode: 'fixed', conversionValue: 0 },
    { ...validMapping, valueMode: 'fixed', conversionValue: -1 },
    { ...validMapping, valueMode: 'fixed', conversionValue: 10.123 },
    { ...validMapping, valueMode: 'fixed', conversionValue: 100_000_000 },
    { ...validMapping, valueMode: 'none', conversionValue: 10 },
    { ...validMapping, valueMode: 'purchase', conversionValue: 10 },
    { ...validMapping, currency: 'REAL' },
    { ...validMapping, conversionCategory: 'purchase' },
    { ...validMapping, optimizationRole: 'main' },
    { ...validMapping, conversionActionResource: 'AW-123/label' },
    { ...validMapping, tenantId: 'outro-tenant' },
  ];
  for (const input of invalid) {
    assert.equal(googleFunnelMappingSchema.safeParse(input).success, false, JSON.stringify(input));
  }
});

test('resolve o valor da conversão sem inventar receita', () => {
  assert.deepEqual(resolveGoogleConversionValue({ valueMode: 'none' }), { status: 'no_value' });
  assert.deepEqual(
    resolveGoogleConversionValue({ valueMode: 'fixed', conversionValue: 100, currency: 'BRL' }),
    { status: 'resolved', value: 100, currency: 'BRL' },
  );
  assert.deepEqual(resolveGoogleConversionValue({ valueMode: 'fixed', conversionValue: null }), { status: 'no_value' });
  assert.deepEqual(resolveGoogleConversionValue({ valueMode: 'purchase', conversionValue: 999 }), { status: 'awaiting_purchase' });
  assert.deepEqual(resolveGoogleConversionValue({ valueMode: 'purchase' }, { amountCents: 0 }), { status: 'awaiting_purchase' });
  assert.deepEqual(
    resolveGoogleConversionValue({ valueMode: 'purchase', currency: 'BRL' }, { amountCents: 500000, currency: null }),
    { status: 'resolved', value: 5000, currency: 'BRL' },
  );
});

test('chave idempotente é determinística e isolada por tenant, lead, etapa, ação e transição', () => {
  const base = {
    tenantId: 'tenant-a',
    leadId: 'lead-1',
    stageId: 'stage-1',
    conversionActionResource: 'customers/1234567890/conversionActions/55',
    transitionId: 'history-1',
  };
  const key = buildGoogleConversionIdempotencyKey(base);
  assert.match(key, /^gads:[0-9a-f]{64}$/);
  assert.equal(buildGoogleConversionIdempotencyKey({ ...base }), key);
  for (const field of Object.keys(base) as Array<keyof typeof base>) {
    assert.notEqual(buildGoogleConversionIdempotencyKey({ ...base, [field]: `${base[field]}-x` }), key, field);
    assert.throws(() => buildGoogleConversionIdempotencyKey({ ...base, [field]: ' ' }), field);
  }
  // Concatenation must not let two different tuples collide.
  assert.notEqual(
    buildGoogleConversionIdempotencyKey({ ...base, tenantId: 'a', leadId: 'bc' }),
    buildGoogleConversionIdempotencyKey({ ...base, tenantId: 'ab', leadId: 'c' }),
  );
});

test('ciclo de vida do evento não reenvia conversões finalizadas', () => {
  assert.deepEqual([...googleConversionEventStates], ['PENDING', 'SENT', 'ACCEPTED', 'REJECTED', 'RETRY', 'FAILED']);
  assert.equal(canTransitionGoogleConversionEvent('PENDING', 'SENT'), true);
  assert.equal(canTransitionGoogleConversionEvent('SENT', 'ACCEPTED'), true);
  assert.equal(canTransitionGoogleConversionEvent('SENT', 'REJECTED'), true);
  assert.equal(canTransitionGoogleConversionEvent('SENT', 'RETRY'), true);
  assert.equal(canTransitionGoogleConversionEvent('RETRY', 'SENT'), true);
  assert.equal(canTransitionGoogleConversionEvent('FAILED', 'RETRY'), true);
  assert.equal(canTransitionGoogleConversionEvent('FAILED', 'SENT'), false);
  assert.equal(canTransitionGoogleConversionEvent('PENDING', 'ACCEPTED'), false);
  for (const state of googleConversionEventStates) {
    assert.equal(canTransitionGoogleConversionEvent('ACCEPTED', state), false);
    assert.equal(canTransitionGoogleConversionEvent('REJECTED', state), false);
  }
  assert.equal(isTerminalGoogleConversionEventState('ACCEPTED'), true);
  assert.equal(isTerminalGoogleConversionEventState('REJECTED'), true);
  assert.equal(isTerminalGoogleConversionEventState('FAILED'), false);
});

test('retry tem backoff limitado e termina em FAILED', () => {
  assert.deepEqual(planGoogleConversionRetry(1), { state: 'RETRY', delayMs: 60_000 });
  assert.deepEqual(planGoogleConversionRetry(2), { state: 'RETRY', delayMs: 240_000 });
  assert.deepEqual(planGoogleConversionRetry(5), { state: 'RETRY', delayMs: 15_360_000 });
  assert.deepEqual(planGoogleConversionRetry(GOOGLE_CONVERSION_MAX_ATTEMPTS), { state: 'FAILED' });
  assert.deepEqual(planGoogleConversionRetry(99), { state: 'FAILED' });
  assert.deepEqual(planGoogleConversionRetry(0), { state: 'RETRY', delayMs: 60_000 });
});

test('auditoria guarda apenas um código seguro de erro', () => {
  assert.equal(toSafeGoogleConversionErrorCode('click_not_found'), 'CLICK_NOT_FOUND');
  assert.equal(toSafeGoogleConversionErrorCode('Bearer ya29.secret-token'), 'UNKNOWN');
  assert.equal(toSafeGoogleConversionErrorCode('lead maria@example.com rejected'), 'UNKNOWN');
  assert.equal(toSafeGoogleConversionErrorCode({ message: 'x' }), 'UNKNOWN');
  assert.equal(toSafeGoogleConversionErrorCode('A'.repeat(65)), 'UNKNOWN');
});

test('fundação do Google Funnel não acessa rede, banco, Meta nem leads', () => {
  for (const file of ['lib/tracking/google-funnel.ts', 'lib/tracking/google-click-ids.ts']) {
    const source = readFileSync(file, 'utf8');
    for (const forbidden of ['fetch(', 'prisma', 'meta-capi', 'sendMetaCapiEvent', 'process.env']) {
      assert.equal(source.includes(forbidden), false, `${file} não deve conter ${forbidden}`);
    }
  }
});

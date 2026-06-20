import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCustomData, kanbanEventSchema } from '../lib/tracking';
import { formatMetaCapiError } from '../lib/tracking/meta-capi';

test('impede salvar Meta Purchase sem value', () => {
  const parsed = kanbanEventSchema.safeParse({
    pipelineId: 'pipe_1',
    stageId: 'stage_1',
    provider: 'meta',
    eventName: 'Purchase',
    currency: 'BRL',
    enabled: true,
  });

  assert.equal(parsed.success, false);
  assert.equal(parsed.error.errors[0]?.message, 'Informe um valor de conversão para eventos Purchase.');
});

test('permite Meta Purchase com value maior que zero', () => {
  const parsed = kanbanEventSchema.safeParse({
    pipelineId: 'pipe_1',
    stageId: 'stage_1',
    provider: 'meta',
    eventName: 'Purchase',
    conversionValue: 1,
    currency: 'BRL',
    enabled: true,
  });

  assert.equal(parsed.success, true);
  assert.equal(parsed.data.conversionValue, 1);
});

test('custom_data de Purchase inclui value e currency com fallback BRL', () => {
  const customData = buildCustomData({ provider: 'meta', eventName: 'Purchase', conversionValue: 1 }, 'kanban');

  assert.deepEqual(customData, {
    content_name: 'Purchase',
    content_category: 'kanban',
    currency: 'BRL',
    value: 1,
  });
});

test('Meta Lead continua funcionando sem value', () => {
  const parsed = kanbanEventSchema.safeParse({
    pipelineId: 'pipe_1',
    stageId: 'stage_1',
    provider: 'meta',
    eventName: 'Lead',
    currency: 'BRL',
    enabled: true,
  });
  const customData = buildCustomData({ provider: 'meta', eventName: 'Lead' }, 'public_form');

  assert.equal(parsed.success, true);
  assert.equal('value' in customData, false);
  assert.equal(customData.currency, 'BRL');
});

test('erro da Meta é formatado com detalhes sem token', () => {
  const reason = formatMetaCapiError({
    error: {
      message: 'Invalid parameter',
      type: 'OAuthException',
      code: 100,
      error_subcode: 2804019,
      error_user_title: 'Parâmetro inválido',
      error_user_msg: 'Informe value para Purchase',
      fbtrace_id: 'abc123',
    },
  }, 'Meta CAPI HTTP 400');

  assert.equal(reason, 'Meta CAPI: Invalid parameter | code: 100 | subcode: 2804019 | type: OAuthException | title: Parâmetro inválido | msg: Informe value para Purchase | fbtrace_id: abc123');
  assert.equal(reason.includes('access_token'), false);
});

import { getFinalTrackingLogs } from '../lib/tracking/logs';

test('UI usa apenas status final por eventId e preserva motivo do failed', () => {
  const logs = getFinalTrackingLogs([
    { id: 'pending', eventId: 'evt_1', status: 'pending', reason: null, createdAt: '2026-06-20T10:00:00.000Z' },
    { id: 'failed', eventId: 'evt_1', status: 'failed', reason: 'Meta CAPI: Invalid parameter | code: 100', createdAt: '2026-06-20T10:00:01.000Z' },
  ]);

  assert.equal(logs.length, 1);
  assert.equal(logs[0].status, 'failed');
  assert.equal(logs[0].reason, 'Meta CAPI: Invalid parameter | code: 100');
});

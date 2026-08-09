import assert from 'node:assert/strict';
import test from 'node:test';

import { buildCustomData, kanbanEventSchema, resolveTrackingEventId } from '../lib/tracking';
import { fireMetaLeadPixel } from '../lib/tracking/meta-pixel-client';
import { buildUserData, formatMetaCapiError, hashMetaValue, normalizeMetaCity, normalizeMetaEmail, normalizeMetaPhone } from '../lib/tracking/meta-capi';
import { buildMetaExternalId, getMetaLeadUserData, splitLeadName } from '../lib/tracking/meta-lead-user-data';

test('normaliza e separa os identificadores hashed da Meta deterministicamente', () => {
  assert.equal(normalizeMetaEmail('  MARIA@Example.COM '), 'maria@example.com');
  assert.equal(normalizeMetaEmail('invalido'), '');
  assert.equal(normalizeMetaPhone('+55 (86) 99999-1234'), '5586999991234');
  assert.equal(normalizeMetaCity(' São Luís '), 'saoluis');
  assert.deepEqual(splitLeadName('Diego'), { firstName: 'Diego', lastName: null });
  assert.deepEqual(splitLeadName(' Maria Clara de Sousa '), { firstName: 'Maria', lastName: 'Clara de Sousa' });
  assert.deepEqual(splitLeadName('  '), { firstName: null, lastName: null });

  const externalId = buildMetaExternalId('tenant-a', 'lead-1');
  const data = buildUserData({
    email: '  MARIA@Example.COM ', phone: '+55 (86) 99999-1234', firstName: 'Maria',
    lastName: 'Clara Sousa', city: 'São Luís', state: 'PI', externalId,
  });
  assert.deepEqual(data.em, [hashMetaValue('maria@example.com')]);
  assert.deepEqual(data.ph, [hashMetaValue('5586999991234')]);
  assert.deepEqual(data.fn, [hashMetaValue('maria')]);
  assert.deepEqual(data.ln, [hashMetaValue('clara sousa')]);
  assert.deepEqual(data.ct, [hashMetaValue('saoluis')]);
  assert.deepEqual(data.st, [hashMetaValue('pi')]);
  assert.deepEqual(data.external_id, [hashMetaValue('tenant-a:lead-1')]);
  assert.deepEqual(buildUserData({ city: 'São Luís' }), buildUserData({ city: 'São Luís' }));
});

test('mantém attribution sem hash e omite todos os campos ausentes ou vazios', () => {
  const data = buildUserData({
    email: 'invalid', phone: '---', firstName: ' ', fbc: ' fb.1.click ', fbp: 'fb.1.browser',
    clientIpAddress: '203.0.113.7', clientUserAgent: 'Browser/1.0',
  });
  assert.deepEqual(data, {
    fbc: 'fb.1.click', fbp: 'fb.1.browser', client_ip_address: '203.0.113.7', client_user_agent: 'Browser/1.0',
  });
  assert.deepEqual(buildUserData(undefined), {});
  assert.equal(Object.values(data).some((value) => Array.isArray(value) && value.length === 0), false);
});

test('carrega Lead e attribution com tenant isolation em uma única consulta', async () => {
  let received: any;
  const db = { lead: { findFirst: async (args: unknown) => {
    received = args;
    return {
      id: 'lead-1', name: 'Maria Clara Sousa', email: 'maria@example.com', phone: '5586999991234',
      city: 'Teresina', state: 'PI', attribution: {
        fbc: 'fbc-value', fbp: 'fbp-value', clientIp: '203.0.113.7', clientUserAgent: 'Browser/1', landingPage: 'https://cliente.example/form',
      },
    };
  } } };
  const result = await getMetaLeadUserData({ tenantId: 'tenant-a', leadId: 'lead-1', db });
  assert.deepEqual(received.where, { id: 'lead-1', tenantId: 'tenant-a' });
  assert.equal(result.user.externalId, 'tenant-a:lead-1');
  assert.equal(result.user.firstName, 'Maria');
  assert.equal(result.user.lastName, 'Clara Sousa');
  assert.equal(result.user.fbc, 'fbc-value');
  assert.equal(result.landingPage, 'https://cliente.example/form');
});

test('não usa fallback em tentativa cross-tenant e aceita Lead antigo sem attribution', async () => {
  const missDb = { lead: { findFirst: async () => null } };
  const miss = await getMetaLeadUserData({ tenantId: 'tenant-b', leadId: 'lead-a', fallbackLead: { email: 'leak@example.com' }, db: missDb });
  assert.deepEqual(miss, { user: {}, landingPage: null });

  const oldDb = { lead: { findFirst: async () => ({
    id: 'old-lead', name: 'Diego', email: 'diego@example.com', phone: '5511999999999', city: null, state: null, attribution: null,
  }) } };
  const oldLead = await getMetaLeadUserData({ tenantId: 'tenant-a', leadId: 'old-lead', db: oldDb });
  assert.equal(oldLead.user.email, 'diego@example.com');
  assert.equal(oldLead.user.phone, '5511999999999');
  assert.equal(oldLead.user.firstName, 'Diego');
  assert.equal(oldLead.user.fbc, undefined);
  assert.equal(oldLead.landingPage, null);
});

test('permite configurar Meta Purchase sem value fixo', () => {
  const parsed = kanbanEventSchema.safeParse({
    pipelineId: 'pipe_1',
    stageId: 'stage_1',
    provider: 'meta',
    eventName: 'Purchase',
    currency: 'BRL',
    enabled: true,
  });

  assert.equal(parsed.success, true);
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

test('Meta Lead público usa o event ID do servidor e outros eventos recebem IDs próprios', () => {
  const sharedId = 'server-owned-lead-event-id';
  const context = { source: 'public_form' as const, metaLeadEventId: sharedId };

  assert.equal(resolveTrackingEventId({ provider: 'meta', eventName: 'Lead' }, context), sharedId);
  assert.notEqual(resolveTrackingEventId({ provider: 'meta', eventName: 'QualifiedLead' }, context), sharedId);
  assert.notEqual(resolveTrackingEventId({ provider: 'meta', eventName: 'Purchase' }, context), sharedId);
  assert.notEqual(resolveTrackingEventId({ provider: 'google_ads', eventName: 'Lead' }, context), sharedId);
  assert.notEqual(resolveTrackingEventId({ provider: 'meta', eventName: 'Lead' }, { source: 'kanban', metaLeadEventId: sharedId }), sharedId);
});

test('Meta Pixel dispara Standard Event Lead com o mesmo eventID, sem PII', () => {
  const calls: unknown[][] = [];
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  Object.assign(globalThis, {
    window: { fbq: (...args: unknown[]) => calls.push(args) },
    document: {},
  });
  try {
    assert.equal(fireMetaLeadPixel({ pixelId: '123456789', eventId: 'server-event-123' }), true);
    assert.deepEqual(calls, [
      ['init', '123456789'],
      ['track', 'Lead', {}, { eventID: 'server-event-123' }],
    ]);
    assert.equal(JSON.stringify(calls).includes('email'), false);
  } finally {
    Object.assign(globalThis, { window: previousWindow, document: previousDocument });
  }
});

test('Meta Pixel rejeita configuração inválida e falha de browser é best-effort', () => {
  const previousWindow = globalThis.window;
  const previousDocument = globalThis.document;
  Object.assign(globalThis, { window: {}, document: { getElementById: () => null, createElement: () => ({}), head: { appendChild: () => { throw new Error('blocked'); } } } });
  try {
    assert.equal(fireMetaLeadPixel({ pixelId: 'pixel-do-request', eventId: 'event' }), false);
    assert.equal(fireMetaLeadPixel({ pixelId: '987654321', eventId: 'event' }), false);
  } finally {
    Object.assign(globalThis, { window: previousWindow, document: previousDocument });
  }
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

import assert from 'node:assert/strict';
import test from 'node:test';

import { canReplayMetaEvent } from '../lib/tracking/replay-rules';

const now = new Date('2026-10-21T12:00:00Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);

test('eventos de etapa podem ser reenviados até perto de 7 dias', () => {
  assert.equal(canReplayMetaEvent({ source: 'kanban', eventName: 'Contact', createdAt: hoursAgo(24) }, now), true);
  assert.equal(canReplayMetaEvent({ source: 'kanban', eventName: 'QualifiedLead', createdAt: hoursAgo(160) }, now), true);
  assert.equal(canReplayMetaEvent({ source: 'kanban', eventName: 'Contact', createdAt: hoursAgo(170) }, now), false);
});

test('Lead do formulário só até 48 horas (o Pixel do navegador já enviou uma cópia)', () => {
  assert.equal(canReplayMetaEvent({ source: 'public_form', eventName: 'Lead', createdAt: hoursAgo(20) }, now), true);
  assert.equal(canReplayMetaEvent({ source: 'public_form', eventName: 'Lead', createdAt: hoursAgo(60) }, now), false);
});

test('compras e outras origens não são reenviadas aqui', () => {
  assert.equal(canReplayMetaEvent({ source: 'kanban', eventName: 'Purchase', createdAt: hoursAgo(2) }, now), false);
  assert.equal(canReplayMetaEvent({ source: 'whatsapp_ai', eventName: 'Lead', createdAt: hoursAgo(2) }, now), false);
});

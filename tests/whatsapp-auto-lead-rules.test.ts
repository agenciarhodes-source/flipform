import test from 'node:test';
import assert from 'node:assert/strict';
import { mainPipeline, shouldCreateWhatsAppLead, whatsappLeadSource } from '../lib/leads/whatsapp-auto-lead-rules';

test('a new WhatsApp contact without a lead gets one, unless the AI handles it', () => {
  assert.equal(shouldCreateWhatsAppLead({ hasLead: false, aiOn: false, messageType: 'text' }), true);
  assert.equal(shouldCreateWhatsAppLead({ hasLead: false, aiOn: false, messageType: 'image' }), true);
  assert.equal(shouldCreateWhatsAppLead({ hasLead: true, aiOn: false, messageType: 'text' }), false);
  assert.equal(shouldCreateWhatsAppLead({ hasLead: false, aiOn: true, messageType: 'text' }), false);
  assert.equal(shouldCreateWhatsAppLead({ hasLead: false, aiOn: false, messageType: 'revoke' }), false);
  assert.equal(shouldCreateWhatsAppLead({ hasLead: false, aiOn: false, messageType: 'reaction' }), false);
});

test('source and main funnel', () => {
  assert.equal(whatsappLeadSource(true), 'Anúncio Meta — WhatsApp');
  assert.equal(whatsappLeadSource(false), 'WhatsApp');
  const old = { id: 'a', isDefault: false, isArchived: false, createdAt: new Date('2026-01-01') };
  const newer = { id: 'b', isDefault: false, isArchived: false, createdAt: new Date('2026-05-01') };
  const def = { id: 'c', isDefault: true, isArchived: false, createdAt: new Date('2026-09-01') };
  const archivedDefault = { id: 'd', isDefault: true, isArchived: true, createdAt: new Date('2025-01-01') };
  assert.equal(mainPipeline([newer, old])?.id, 'a');
  assert.equal(mainPipeline([newer, old, def])?.id, 'c');
  assert.equal(mainPipeline([archivedDefault, newer])?.id, 'b');
  assert.equal(mainPipeline([archivedDefault]), null);
});

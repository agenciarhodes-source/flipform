import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLIP_VOICE_DEFAULTS,
  evaluateVoiceCallGate,
  estimateLunaTextCostUsd,
  type VoiceCallAuthorization,
} from '../lib/flip-voice/policy';

const NOW = new Date('2026-11-23T22:00:00.000Z');
const baseline = (): VoiceCallAuthorization => ({
  tenantId: 'tenant-A',
  contactTenantId: 'tenant-A',
  enabled: true,
  tenantEnabled: true,
  outboundEnabled: true,
  providerReady: true,
  actorOrWebhookAuthorized: true,
  direction: 'outbound',
  channel: 'pstn',
  idempotencyKey: 'request-1',
  doNotCall: false,
  personAskedForHuman: false,
  humanHandoffAvailable: true,
  contactConsentEvidenceId: 'consent-1',
  monthlyBudgetRemainingUsd: 10,
  reservedCallEstimateUsd: 1,
});

test('FV00 defaults do not enable calls, outbound or recording', () => {
  assert.equal(FLIP_VOICE_DEFAULTS.enabled, false);
  assert.equal(FLIP_VOICE_DEFAULTS.tenantEnabled, false);
  assert.equal(FLIP_VOICE_DEFAULTS.outboundEnabled, false);
  assert.equal(FLIP_VOICE_DEFAULTS.recordingEnabled, false);
  assert.equal(FLIP_VOICE_DEFAULTS.llmModel, 'gpt-6-luna');
});

test('FV00 allows only an explicitly authorized, budgeted call', () => {
  assert.deepEqual(evaluateVoiceCallGate(baseline(), NOW), { allowed: true, reason: 'authorized' });
});

test('FV00 denies feature flags, wrong tenant, unauthorized actor and missing idempotency', () => {
  for (const [patch, reason] of [
    [{ enabled: false }, 'feature_disabled'],
    [{ tenantEnabled: false }, 'tenant_disabled'],
    [{ contactTenantId: 'tenant-B' }, 'tenant_mismatch'],
    [{ actorOrWebhookAuthorized: false }, 'actor_not_authorized'],
    [{ idempotencyKey: '' }, 'idempotency_required'],
    [{ providerReady: false }, 'provider_not_ready'],
  ] as const) {
    assert.deepEqual(evaluateVoiceCallGate({ ...baseline(), ...patch }, NOW), { allowed: false, reason });
  }
});

test('FV00 denies outgoing calls without consent, when stopped or without outbound flag', () => {
  for (const [patch, reason] of [
    [{ outboundEnabled: false }, 'outbound_disabled'],
    [{ contactConsentEvidenceId: null }, 'consent_required'],
    [{ doNotCall: true }, 'do_not_call'],
    [{ personAskedForHuman: true, humanHandoffAvailable: false }, 'human_handoff_required'],
  ] as const) {
    assert.deepEqual(evaluateVoiceCallGate({ ...baseline(), ...patch }, NOW), { allowed: false, reason });
  }
});

test('FV00 requires valid WhatsApp-specific call permission in addition to contact consent', () => {
  const whatsapp = { ...baseline(), channel: 'whatsapp' as const };
  assert.deepEqual(evaluateVoiceCallGate(whatsapp, NOW), {
    allowed: false, reason: 'whatsapp_call_permission_required',
  });
  assert.deepEqual(evaluateVoiceCallGate({
    ...whatsapp, whatsappPermission: { evidenceId: 'meta-1', granted: true, expiresAt: '2026-11-22T00:00:00Z' },
  }, NOW), { allowed: false, reason: 'whatsapp_call_permission_expired' });
  assert.deepEqual(evaluateVoiceCallGate({
    ...whatsapp, whatsappPermission: { evidenceId: 'meta-1', granted: true, expiresAt: null },
  }, NOW), { allowed: true, reason: 'authorized' });
});

test('FV00 protects account budget; inbound calls do not require outbound consent', () => {
  assert.deepEqual(evaluateVoiceCallGate({
    ...baseline(), monthlyBudgetRemainingUsd: 0.5,
  }, NOW), { allowed: false, reason: 'budget_exceeded' });
  assert.deepEqual(evaluateVoiceCallGate({
    ...baseline(), direction: 'inbound', outboundEnabled: false, contactConsentEvidenceId: null,
  }, NOW), { allowed: true, reason: 'authorized' });
});

test('FV00 estimates Luna cost separately from voice and telephony', () => {
  assert.equal(estimateLunaTextCostUsd(5_000, 1_000), 0.001);
  assert.throws(() => estimateLunaTextCostUsd(-1, 200), RangeError);
  assert.throws(() => estimateLunaTextCostUsd(Number.NaN, 200), RangeError);
});

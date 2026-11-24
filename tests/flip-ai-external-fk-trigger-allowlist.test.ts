import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isApprovedFlipVoiceReferenceTrigger,
  type CatalogForeignKeyTrigger,
} from '../lib/flip-ai/external-fk-trigger-allowlist';

const base: CatalogForeignKeyTrigger = {
  triggerTableName: 'flip_ai_agents',
  triggerName: 'RI_ConstraintTrigger_a_123456',
  enabled: 'O',
  internal: true,
  deferrable: false,
  initiallyDeferred: false,
  constraintTableName: 'flip_voice_profiles',
  constraintName: 'flip_voice_profiles_tenant_id_agent_id_fkey',
  constraintType: 'f',
  functionName: 'RI_FKey_restrict_del',
};

test('only the two native parent-side triggers for the new Flip Voice FK are approved', () => {
  assert.equal(isApprovedFlipVoiceReferenceTrigger(base), true);
  assert.equal(isApprovedFlipVoiceReferenceTrigger({ ...base, functionName: 'RI_FKey_cascade_upd' }), true);
});

test('other relations, external tables, user triggers and modified RI actions remain unexpected', () => {
  const overrides: Partial<CatalogForeignKeyTrigger>[] = [
    { triggerTableName: 'tenants' },
    { constraintTableName: 'flip_voice_calls' },
    { constraintName: 'flip_voice_profiles_other_fkey' },
    { constraintType: 't' },
    { enabled: 'D' },
    { internal: false },
    { deferrable: true },
    { initiallyDeferred: true },
    { triggerName: 'custom_trigger' },
    { triggerName: 'RI_ConstraintTrigger_c_123456' },
    { functionName: 'RI_FKey_cascade_del' },
    { functionName: 'arbitrary_function' },
  ];
  for (const patch of overrides) {
    assert.equal(isApprovedFlipVoiceReferenceTrigger({ ...base, ...patch }), false, JSON.stringify(patch));
  }
});

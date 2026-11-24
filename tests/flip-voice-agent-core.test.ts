import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFlipVoiceAgentDraft,
  validateApprovedVoice,
  type ApprovedVoice,
} from '../lib/flip-voice/agent-core';

const now = new Date('2026-11-24T12:00:00Z');
function approved(): ApprovedVoice {
  return {
    tenantId: 'tenant-A',
    profileId: 'p1',
    provider: 'elevenlabs',
    providerVoiceId: '21m00Tcm4TlvDq8ikWAM',
    profileStatus: 'active',
    consentStatus: 'verified',
    consentScopes: ['tts', 'voice_calls'],
    consentEvidenceHash: 'a'.repeat(64),
    consentVerifiedAt: new Date('2026-11-23T12:00:00Z'),
    consentExpiresAt: new Date('2026-12-01T00:00:00Z'),
    consentRevokedAt: null,
  };
}

test('only a verified, scoped, same-tenant voice can build the agent', () => {
  assert.doesNotThrow(() => validateApprovedVoice(approved(), 'tenant-A', 'voice_calls', now));
  for (const [override, tenant, scope] of [
    [{tenantId:'tenant-B'},'tenant-A','voice_calls'],
    [{profileStatus:'pending'},'tenant-A','voice_calls'],
    [{consentStatus:'pending'},'tenant-A','voice_calls'],
    [{consentRevokedAt:new Date('2026-11-23')},'tenant-A','voice_calls'],
    [{consentExpiresAt:new Date('2026-11-23')},'tenant-A','voice_calls'],
    [{consentScopes:['tts']},'tenant-A','voice_calls'],
    [{consentVerifiedAt:new Date('2026-11-25')},'tenant-A','voice_calls'],
    [{consentEvidenceHash:'not-a-hash'},'tenant-A','voice_calls'],
    [{providerVoiceId:'bad!'},'tenant-A','voice_calls'],
  ] as const) {
    assert.throws(
      () => validateApprovedVoice({...approved(), ...override} as ApprovedVoice, tenant, scope, now),
    );
  }
});

test('gpt-6-luna + cloned voice test-only config discloses AI and has no tools', () => {
  const x = buildFlipVoiceAgentDraft({
    tenantId: 'tenant-A', voice: approved(), businessDisplayName: 'Empresa Piloto',
    businessInstructions: 'Falar de horários de atendimento sem prometer resultados.',
    testOnly: true, now,
  });
  assert.equal(x.conversation_config.agent.prompt.llm, 'gpt-6-luna');
  assert.equal(x.conversation_config.agent.prompt.reasoning_effort, 'none');
  assert.deepEqual(x.conversation_config.agent.prompt.tools, []);
  assert.match(x.conversation_config.agent.first_message, /assistente virtual de inteligência artificial/i);
  assert.equal(x.conversation_config.tts.voice_id, approved().providerVoiceId);
  assert.equal(x.conversation_config.conversation.max_duration_seconds, 180);
  assert.match(x.name, /^Flip Voice TEST/);
  assert.match(x.conversation_config.agent.prompt.prompt, /não invente/i);
});

test('agent blueprint rejects production use, giant instructions, invalid durations and tenant mismatch', () => {
  const baseline = { tenantId:'tenant-A', voice: approved(), businessDisplayName:'Empresa Piloto', testOnly:true as const, businessInstructions:'' };
  assert.throws(() => buildFlipVoiceAgentDraft({...baseline, testOnly:false as never, now}));
  assert.throws(() => buildFlipVoiceAgentDraft({...baseline, businessInstructions:'x'.repeat(4001), now}));
  assert.throws(() => buildFlipVoiceAgentDraft({...baseline, maxCallSeconds:3600, now}));
  assert.throws(() => buildFlipVoiceAgentDraft({...baseline, tenantId:'tenant-B', now}));
});

test('using our own GPT-6 Luna account requires a secret reference, never a key', () => {
  const secretId='elevenSecretForOpenAi123';
  const cfg=buildFlipVoiceAgentDraft({
    tenantId:'tenant-A',voice:approved(),businessDisplayName:'Empresa Piloto',
    businessInstructions:'Informações da empresa',testOnly:true,now,openAiSecretId:secretId,
  });
  const prompt=cfg.conversation_config.agent.prompt;
  assert.equal(prompt.llm,'custom-llm');
  assert.equal(prompt.custom_llm?.url,'https://api.openai.com/v1/chat/completions');
  assert.equal(prompt.custom_llm?.model_id,'gpt-6-luna');
  assert.equal(prompt.custom_llm?.api_key.secret_id,secretId);
  assert.equal(cfg.platform_settings.auth.enable_auth,true);
  assert.equal(cfg.platform_settings.call_limits.daily_limit,5);
  assert.deepEqual(prompt.tools,[]);
  assert.throws(()=>buildFlipVoiceAgentDraft({
    tenantId:'tenant-A',voice:approved(),businessDisplayName:'Empresa Piloto',
    businessInstructions:'',testOnly:true,now,openAiSecretId:'sk-proj-unsafe key with spaces',
  }));
});

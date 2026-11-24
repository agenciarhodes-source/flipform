import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFlipVoiceAgentDraft, type ApprovedVoice } from '../lib/flip-voice/agent-core';
import { provisionElevenTestAgent, flipVoiceProvisioningReadiness } from '../lib/flip-voice/elevenlabs-agent';

const voice: ApprovedVoice = {
  tenantId: 'test-tenant', profileId: 'p', provider:'elevenlabs',
  providerVoiceId:'21m00Tcm4TlvDq8ikWAM', profileStatus:'active',
  consentStatus:'verified', consentScopes:['voice_calls'], consentEvidenceHash:'a'.repeat(64),
  consentVerifiedAt:new Date('2026-11-20'), consentExpiresAt:null, consentRevokedAt:null,
};
const draft = buildFlipVoiceAgentDraft({
  tenantId:'test-tenant', voice, businessDisplayName:'Empresa Teste',
  businessInstructions:'Atendimento neutro.', testOnly:true,
});

test('provider code does not run network while provisioning disabled', async () => {
  let calls=0;
  const transport = (async()=>{calls++;throw Error('should not call');}) as unknown as typeof fetch;
  await assert.rejects(
    provisionElevenTestAgent({draft,providerApiKey:'fake',provisioningEnabled:false,fetchImpl:transport}),
    /PROVISIONING_DISABLED/,
  );
  assert.equal(calls,0);
});

test('provider adapter posts a test-only draft, returns only agent ID', async () => {
  let called=0;
  const transport = (async (url: string|URL|Request,init?:RequestInit)=>{
    called++;
    assert.equal(String(url),'https://api.elevenlabs.io/v1/convai/agents/create');
    assert.equal(init?.method,'POST');
    const parsed = JSON.parse(String(init?.body));
    assert.equal(parsed.conversation_config.agent.prompt.llm,'gpt-6-luna');
    assert.deepEqual(parsed.conversation_config.agent.prompt.tools, []);
    return new Response(JSON.stringify({agent_id:'testAgent1234567890'}),{status:200});
  }) as typeof fetch;
  const response=await provisionElevenTestAgent({draft,providerApiKey:'fake-test-key',provisioningEnabled:true,fetchImpl:transport});
  assert.equal(response.agentId,'testAgent1234567890');
  assert.equal(called,1);
});

test('does not leak an API key in provider errors or readiness', async () => {
  const transport=(async()=>new Response('provider diagnostic contains key',{status:401})) as typeof fetch;
  await assert.rejects(
    provisionElevenTestAgent({draft,providerApiKey:'private-dont-print',provisioningEnabled:true,fetchImpl:transport}),
    (e: unknown)=>e instanceof Error && e.message==='ELEVEN_AGENT_CREATE_FAILED_401',
  );
  const state=flipVoiceProvisioningReadiness({NODE_ENV:'test',ELEVENLABS_API_KEY:'secret',FLIP_VOICE_AGENT_PROVISIONING_ENABLED:'false'} as NodeJS.ProcessEnv);
  assert.equal(state.hasElevenLabsKey,true);
  assert.equal(state.agentProvisioningEnabled,false);
  assert.equal(JSON.stringify(state).includes('secret'),false);
});

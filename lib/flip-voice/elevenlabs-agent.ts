/**
 * ElevenLabs agent creation adapter.
 * A deliberately non-routed integration point: no browser route, cron, webhook
 * or trigger invokes this in PR #636. Test provisioning can only be performed by
 * trusted server code after the operator explicitly enables the dedicated flag.
 *
 * Agent provisioning is not an outbound telephone call. No phone or customer
 * record is sent to this function.
 */
import type { VoiceAgentDraft } from './agent-core';
import { FlipVoiceCoreError } from './agent-core';

export type TestAgentProvisionResult = { agentId: string };

export async function provisionElevenTestAgent(input: {
  draft: VoiceAgentDraft;
  providerApiKey: string;
  provisioningEnabled: boolean;
  fetchImpl?: typeof fetch;
}): Promise<TestAgentProvisionResult> {
  if (!input.provisioningEnabled) throw new FlipVoiceCoreError('PROVISIONING_DISABLED');
  const prompt = input.draft.conversation_config.agent.prompt;
  const usesApprovedLuna =
    (prompt.llm === 'gpt-6-luna' && prompt.custom_llm === undefined) ||
    (prompt.llm === 'custom-llm' &&
      prompt.custom_llm?.url === 'https://api.openai.com/v1/chat/completions' &&
      prompt.custom_llm?.model_id === 'gpt-6-luna' &&
      prompt.custom_llm?.api_type === 'chat_completions' &&
      /^[a-zA-Z0-9_-]{8,100}$/.test(prompt.custom_llm.api_key.secret_id));
  if (!input.draft.name.startsWith('Flip Voice TEST - ') ||
      prompt.tools.length !== 0 || prompt.reasoning_effort !== 'none' || !usesApprovedLuna) {
    throw new FlipVoiceCoreError('UNSAFE_AGENT_CONFIG');
  }
  if (!input.providerApiKey.trim()) throw new FlipVoiceCoreError('PROVIDER_KEY_MISSING');

  const response = await (input.fetchImpl || fetch)('https://api.elevenlabs.io/v1/convai/agents/create', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': input.providerApiKey,
    },
    body: JSON.stringify(input.draft),
    signal: AbortSignal.timeout(15_000),
    cache: 'no-store',
  });
  if (!response.ok) {
    throw new FlipVoiceCoreError('ELEVEN_AGENT_CREATE_FAILED_' + response.status);
  }
  const raw: unknown = await response.json().catch(() => null);
  if (!raw || typeof raw !== 'object' ||
      !('agent_id' in raw) || typeof raw.agent_id !== 'string' ||
      !/^[a-zA-Z0-9_-]{10,100}$/.test(raw.agent_id)) {
    throw new FlipVoiceCoreError('ELEVEN_AGENT_RESPONSE_INVALID');
  }
  return { agentId: raw.agent_id };
}

/** Trusted server-side diagnostic only. Does not return any credentials. */
export function flipVoiceProvisioningReadiness(env: NodeJS.ProcessEnv = process.env) {
  return {
    draftOnly: true,
    hasElevenLabsKey: Boolean(env.ELEVENLABS_API_KEY?.trim()),
    agentProvisioningEnabled: env.FLIP_VOICE_AGENT_PROVISIONING_ENABLED === 'true',
    liveCallsEnabled: false, // this adapter has no dial/call capability
  };
}

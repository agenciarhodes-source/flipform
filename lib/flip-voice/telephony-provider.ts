/**
 * Only this provider adapter can request a telephone call from ElevenLabs.
 * Never invoke from a public route without persisted tenant + budget authorization.
 */
import { FlipVoiceCoreError } from './agent-core';
import { validE164 } from './telephony-core';

const BASE = 'https://api.elevenlabs.io/v1/convai/twilio/';
export type OutboundCallAccepted = { providerCallId: string; conversationId: string | null };

function checkCredentials(apiKey: string): void {
  if (apiKey.trim().length < 16) throw new FlipVoiceCoreError('ELEVENLABS_KEY_MISSING');
}
function checkAgent(agentId: string): void {
  if (!/^[a-zA-Z0-9_-]{10,120}$/.test(agentId)) throw new FlipVoiceCoreError('AGENT_ID_INVALID');
}
function checkNumber(number: string): void {
  if (!validE164(number)) throw new FlipVoiceCoreError('PHONE_INVALID');
}

export async function startElevenTwilioOutbound(input: {
  apiKey: string;
  agentId: string;
  agentPhoneNumberId: string;
  recipientNumber: string;
  recordingAllowed: false;
  fetchImpl?: typeof fetch;
}): Promise<OutboundCallAccepted> {
  checkCredentials(input.apiKey);
  checkAgent(input.agentId);
  checkAgent(input.agentPhoneNumberId);
  checkNumber(input.recipientNumber);
  if (input.recordingAllowed !== false) throw new FlipVoiceCoreError('RECORDING_FORBIDDEN');
  const response = await (input.fetchImpl ?? fetch)(BASE + 'outbound-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': input.apiKey },
    body: JSON.stringify({
      agent_id: input.agentId,
      agent_phone_number_id: input.agentPhoneNumberId,
      to_number: input.recipientNumber,
      call_recording_enabled: false,
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new FlipVoiceCoreError('ELEVEN_OUTBOUND_UNCERTAIN_' + response.status);
  const raw: unknown = await response.json().catch(() => null);
  if (!raw || typeof raw !== 'object' || !('success' in raw) || raw.success !== true
    || !('callSid' in raw) || typeof raw.callSid !== 'string'
    || !/^CA[a-f0-9]{32}$/i.test(raw.callSid)) {
    throw new FlipVoiceCoreError('ELEVEN_OUTBOUND_RESPONSE_UNCERTAIN');
  }
  const conversationId = 'conversation_id' in raw && typeof raw.conversation_id === 'string'
    ? raw.conversation_id : null;
  return { providerCallId: raw.callSid, conversationId };
}

export async function registerElevenTwilioInbound(input: {
  apiKey: string;
  agentId: string;
  fromNumber: string;
  toNumber: string;
  direction?: 'inbound' | 'outbound';
  fetchImpl?: typeof fetch;
}): Promise<string> {
  checkCredentials(input.apiKey);
  checkAgent(input.agentId);
  checkNumber(input.fromNumber);
  checkNumber(input.toNumber);
  const response = await (input.fetchImpl ?? fetch)(BASE + 'register-call', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'xi-api-key': input.apiKey },
    body: JSON.stringify({
      agent_id: input.agentId,
      from_number: input.fromNumber,
      to_number: input.toNumber,
      direction: input.direction ?? 'inbound',
    }),
    cache: 'no-store',
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw new FlipVoiceCoreError('ELEVEN_REGISTER_INBOUND_FAILED_' + response.status);
  const twiml = await response.text();
  if (twiml.length > 16_384 || !/^\s*(<\?xml[^>]*>\s*)?<Response(?:\s[^>]*)?>[\s\S]*<\/Response>\s*$/.test(twiml)
    || /<!DOCTYPE|<!ENTITY|<script|<Redirect\b/i.test(twiml)) {
    throw new FlipVoiceCoreError('ELEVEN_TWIML_INVALID');
  }
  return twiml;
}

/**
 * Flip Voice FV00: pure, fail-closed authorization rules.
 *
 * These functions DO NOT place calls. They are the contract all future PSTN and
 * WhatsApp call adapters must enforce, followed by atomic database reservation.
 * Never derive authorization from user-submitted tenant IDs or contact metadata.
 */
export const FLIP_VOICE_DEFAULTS = Object.freeze({
  enabled: false,
  tenantEnabled: false,
  outboundEnabled: false,
  recordingEnabled: false,
  llmModel: 'gpt-6-luna',
  maxCallSeconds: 180,
});

export type VoiceCallChannel = 'pstn' | 'whatsapp';
export type VoiceCallDirection = 'inbound' | 'outbound';

export type VoiceCallAuthorization = {
  tenantId: string; // authenticated tenant; never from request body
  contactTenantId: string; // tenant looked up server-side
  enabled: boolean; // global feature flag
  tenantEnabled: boolean; // per-tenant feature flag
  outboundEnabled: boolean;
  providerReady: boolean;
  actorOrWebhookAuthorized: boolean; // RBAC OR verified provider signature
  direction: VoiceCallDirection;
  channel: VoiceCallChannel;
  idempotencyKey: string;
  doNotCall: boolean;
  personAskedForHuman: boolean;
  humanHandoffAvailable: boolean;
  contactConsentEvidenceId: string | null;
  whatsappPermission?: {
    evidenceId: string;
    granted: boolean;
    expiresAt: string | null; // null = provider-confirmed permanent permission
  };
  monthlyBudgetRemainingUsd: number;
  reservedCallEstimateUsd: number;
};

export type VoiceCallDenyReason =
  | 'feature_disabled'
  | 'tenant_disabled'
  | 'tenant_mismatch'
  | 'invalid_tenant'
  | 'provider_not_ready'
  | 'actor_not_authorized'
  | 'idempotency_required'
  | 'outbound_disabled'
  | 'do_not_call'
  | 'human_handoff_required'
  | 'consent_required'
  | 'whatsapp_call_permission_required'
  | 'whatsapp_call_permission_expired'
  | 'budget_exceeded';

export type VoiceCallGateResult =
  | { allowed: true; reason: 'authorized' }
  | { allowed: false; reason: VoiceCallDenyReason };

const deny = (reason: VoiceCallDenyReason): VoiceCallGateResult => ({ allowed: false, reason });

/** Supply time from the trusted server clock. Never use caller-supplied time. */
export function evaluateVoiceCallGate(
  input: VoiceCallAuthorization,
  now: Date = new Date(),
): VoiceCallGateResult {
  if (!input.enabled) return deny('feature_disabled');
  if (!input.tenantEnabled) return deny('tenant_disabled');
  if (!input.tenantId?.trim() || !input.contactTenantId?.trim()) return deny('invalid_tenant');
  if (input.tenantId !== input.contactTenantId) return deny('tenant_mismatch');
  if (!input.providerReady) return deny('provider_not_ready');
  if (!input.actorOrWebhookAuthorized) return deny('actor_not_authorized');
  if (!input.idempotencyKey?.trim()) return deny('idempotency_required');
  if (input.doNotCall) return deny('do_not_call');
  if (input.personAskedForHuman && !input.humanHandoffAvailable) return deny('human_handoff_required');
  if (
    !Number.isFinite(input.monthlyBudgetRemainingUsd) ||
    !Number.isFinite(input.reservedCallEstimateUsd) ||
    input.reservedCallEstimateUsd <= 0 ||
    input.monthlyBudgetRemainingUsd < input.reservedCallEstimateUsd
  ) return deny('budget_exceeded');

  if (input.direction === 'outbound') {
    if (!input.outboundEnabled) return deny('outbound_disabled');
    if (!input.contactConsentEvidenceId?.trim()) return deny('consent_required');
    if (input.channel === 'whatsapp') {
      const permission = input.whatsappPermission;
      if (!permission?.granted || !permission.evidenceId?.trim()) {
        return deny('whatsapp_call_permission_required');
      }
      if (permission.expiresAt !== null) {
        const expiry = Date.parse(permission.expiresAt);
        if (!Number.isFinite(expiry) || expiry <= now.getTime()) {
          return deny('whatsapp_call_permission_expired');
        }
      }
    }
  }
  return { allowed: true, reason: 'authorized' };
}

export const GPT_6_LUNA_USD_PER_MILLION = Object.freeze({ input: 0.10, output: 0.50 });

/** Estimated text-model cost only. Audio, telephony and provider hosting are separate. */
export function estimateLunaTextCostUsd(inputTokens: number, outputTokens: number): number {
  if (
    !Number.isSafeInteger(inputTokens) || inputTokens < 0 ||
    !Number.isSafeInteger(outputTokens) || outputTokens < 0
  ) throw new RangeError('Tokens must be non-negative safe integers');
  return (inputTokens * GPT_6_LUNA_USD_PER_MILLION.input +
    outputTokens * GPT_6_LUNA_USD_PER_MILLION.output) / 1_000_000;
}

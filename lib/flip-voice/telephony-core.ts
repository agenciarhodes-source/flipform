import { createHmac, timingSafeEqual } from 'node:crypto';
import { brazilianDigits } from '@/lib/leads/call-rules';
import { FlipVoiceCoreError } from './agent-core';

/** Fail-closed rules for PSTN only. WhatsApp Calling is PR3. */
export const FLIP_VOICE_PSTN_GATE = Object.freeze({
  provider: 'elevenlabs_twilio_native',
  enabledByDefault: false,
  maxSeconds: 180,
  // Budget reservation is intentionally conservative; reconcile against actual provider invoices.
  estimatedCombinedUsdMicrosPerMinute: 200_000n,
});

export function normalizeBrazilianDialNumber(value: string | null | undefined): string {
  const raw=(value||'').trim();
  // A foreign explicit +country code must never be reinterpreted as a Brazilian local number.
  if(raw.startsWith('+') && !raw.replace(/\D/g,'').startsWith('55')) {
    throw new FlipVoiceCoreError('PHONE_NOT_DIALABLE');
  }
  const digits = brazilianDigits(raw);
  if (!digits) throw new FlipVoiceCoreError('PHONE_NOT_DIALABLE');
  return '+' + digits;
}

export function validE164(value: string): boolean {
  return /^\+[1-9][0-9]{7,14}$/.test(value);
}

export function validatePstnLine(line: {
  tenantId: string;
  status: string;
  inboundEnabled: boolean;
  outboundEnabled: boolean;
  providerAgentId: string;
  providerPhoneNumberId: string;
  phoneE164: string;
}, tenantId: string, direction: 'inbound' | 'outbound'): void {
  if (line.tenantId !== tenantId || !tenantId) throw new FlipVoiceCoreError('LINE_TENANT_MISMATCH');
  if (line.status !== 'ready') throw new FlipVoiceCoreError('LINE_NOT_READY');
  if (direction === 'outbound' && !line.outboundEnabled) throw new FlipVoiceCoreError('LINE_OUTBOUND_DISABLED');
  if (direction === 'inbound' && !line.inboundEnabled) throw new FlipVoiceCoreError('LINE_INBOUND_DISABLED');
  if (!validE164(line.phoneE164) ||
      !/^[a-zA-Z0-9_-]{10,120}$/.test(line.providerAgentId) ||
      !/^[a-zA-Z0-9_-]{10,120}$/.test(line.providerPhoneNumberId)) {
    throw new FlipVoiceCoreError('LINE_CONFIGURATION_INVALID');
  }
}

export function validRecipientPermission(permission: {
  tenantId: string;
  leadId: string;
  phoneHash: string;
  channel: string;
  purpose: string;
  evidenceSha256: string;
  status: string;
  verifiedAt: Date | null;
  revokedAt: Date | null;
  expiresAt: Date | null;
}, tenantId: string, leadId: string, expectedPhoneHash: string, now: Date): boolean {
  return permission.tenantId === tenantId && permission.leadId === leadId
    && /^[a-f0-9]{64}$/i.test(expectedPhoneHash) && permission.phoneHash === expectedPhoneHash
    && permission.channel === 'pstn'
    && permission.purpose === 'requested_follow_up'
    && permission.status === 'verified'
    && /^[a-f0-9]{64}$/i.test(permission.evidenceSha256)
    && permission.verifiedAt instanceof Date
    && permission.verifiedAt.getTime() <= now.getTime()
    && permission.revokedAt === null
    && (permission.expiresAt === null || permission.expiresAt.getTime() > now.getTime());
}

/** Conservative business-hour check: Monday–Friday, 09:00–18:00 São Paulo time. */
export function allowedBrazilBusinessHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo', weekday: 'short', hour: '2-digit',
    minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const field = (type: string) => parts.find(x=>x.type===type)?.value || '';
  const weekday = field('weekday');
  const hour = Number(field('hour')), minute = Number(field('minute'));
  if (!['Mon','Tue','Wed','Thu','Fri'].includes(weekday)) return false;
  return Number.isInteger(hour) && Number.isInteger(minute) && (hour*60+minute >= 540)
    && (hour*60+minute < 1080);
}

export function estimateCallReserveMicros(seconds: number): bigint {
  if (!Number.isInteger(seconds) || seconds < 30 || seconds > FLIP_VOICE_PSTN_GATE.maxSeconds) {
    throw new FlipVoiceCoreError('CALL_DURATION_NOT_ALLOWED');
  }
  return BigInt(Math.ceil(seconds / 60)) * FLIP_VOICE_PSTN_GATE.estimatedCombinedUsdMicrosPerMinute;
}

export function utcMonthStart(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function hashCallIdentity(value: string, secret: string): string {
  if (secret.length < 32 || !value.trim()) throw new FlipVoiceCoreError('CALL_HASH_KEY_NOT_READY');
  return createHmac('sha256',secret).update(value).digest('hex');
}

/**
 * Twilio request signing for application/x-www-form-urlencoded voice webhooks.
 * Caller must supply the canonical public HTTPS URL configured at Twilio.
 * Refuse duplicate parameters at the route layer; never trust forwarded host.
 */
export function validTwilioSignature(url: string, parameters: Record<string,string>, token: string, header: string): boolean {
  if (!url.startsWith('https://') || token.length < 16 || !header) return false;
  const payload = url + Object.keys(parameters).sort().map(k=>k+parameters[k]).join('');
  const expected = createHmac('sha1',token).update(payload).digest('base64');
  const a=Buffer.from(expected,'utf8'), b=Buffer.from(header,'utf8');
  return a.length === b.length && timingSafeEqual(a,b);
}

/** Provisional spend, not the provider invoice. Requires independent reconciliation. */
export function estimatedTerminalSpendMicros(
  terminalStatus:'completed'|'busy'|'no-answer'|'failed'|'canceled',
  durationSeconds:number|null,
  reservedMicros:bigint,
):bigint|null {
  if(reservedMicros<0n)return null;
  if(terminalStatus!=='completed')return 0n;
  if(durationSeconds===null||!Number.isInteger(durationSeconds)||
     durationSeconds<0||durationSeconds>3600)return null;
  const estimate=BigInt(Math.ceil(Math.max(1,durationSeconds)/60)) *
    FLIP_VOICE_PSTN_GATE.estimatedCombinedUsdMicrosPerMinute;
  return estimate <= reservedMicros ? estimate : null;
}

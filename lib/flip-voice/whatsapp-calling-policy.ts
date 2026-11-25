import { FlipVoiceCoreError } from './agent-core';
import { hashCallIdentity, validE164 } from './telephony-core';

/**
 * WhatsApp Business Calling PR3. Completely separate from PSTN:
 * no forwarding WhatsApp calls to PSTN, and never assume ordinary
 * phone opt-in is permission to initiate a WhatsApp voice call.
 */
export const WHATSAPP_CALLING_DEFAULTS = Object.freeze({
  globalEnabled: false,
  inboundEnabled: false,
  outboundEnabled: false,
  dryRun: true,
  maxSeconds: 180,
  maxCallsPer24Hours: 5,
  maxPermissionRequests24Hours: 1,
  maxPermissionRequests7Days: 2,
  maxPermissionDays: 7,
  estimatedCombinedUsdMicrosPerMinute: 250_000n,
});

export function normalizeWhatsAppAddress(value: string): string {
  if (!value.startsWith('whatsapp:')) throw new FlipVoiceCoreError('WA_ADDRESS_INVALID');
  const raw=value.slice('whatsapp:'.length);
  if (!validE164(raw) || !raw.startsWith('+55')) throw new FlipVoiceCoreError('WA_ADDRESS_INVALID');
  return raw;
}

export function validateWhatsAppChannel(line: {
  tenantId: string; status: string; phoneE164: string;
  whatsappInboundEnabled: boolean; whatsappOutboundEnabled: boolean;
  whatsappSenderSid: string | null; whatsappRoutingMode: string;
}, tenantId: string, direction: 'inbound'|'outbound'): void {
  if (!tenantId || line.tenantId!==tenantId || line.status!=='ready') {
    throw new FlipVoiceCoreError('WA_CHANNEL_NOT_READY');
  }
  if (!validE164(line.phoneE164) || !line.phoneE164.startsWith('+55') ||
      line.whatsappRoutingMode!=='twilio_voice' ||
      !line.whatsappSenderSid || !/^[A-Za-z0-9]{16,64}$/.test(line.whatsappSenderSid)) {
    throw new FlipVoiceCoreError('WA_CHANNEL_NOT_CONFIGURED');
  }
  if (direction==='inbound'&&!line.whatsappInboundEnabled) throw new FlipVoiceCoreError('WA_INBOUND_DISABLED');
  if (direction==='outbound'&&!line.whatsappOutboundEnabled) throw new FlipVoiceCoreError('WA_OUTBOUND_DISABLED');
}

export type ProviderWhatsAppPermission = {
  tenantId: string; leadId: string; phoneHash: string; channel: string;
  evidenceSha256: string; providerPermissionSource: string | null;
  providerPermissionRef: string | null;
  providerPermissionRequestSid: string | null;
  providerPermissionConfirmedAt: Date | null;
  verifiedAt: Date | null; expiresAt: Date | null; revokedAt: Date | null; status: string;
  outboundCallWindowStart: Date | null;
  outboundCallsInWindow: number;
};

export function isWhatsAppCallPermitted(
  permission:ProviderWhatsAppPermission,
  tenantId:string, leadId:string, normalizedNumber:string,
  pepper:string, now:Date,
): boolean {
  if (!tenantId||!leadId||!validE164(normalizedNumber)||pepper.length<32)return false;
  const expected=hashCallIdentity(tenantId+':'+normalizedNumber,pepper);
  const age=permission.providerPermissionConfirmedAt?.getTime()??Number.NaN;
  if(permission.tenantId!==tenantId||permission.leadId!==leadId ||
     permission.channel!=='whatsapp'||permission.phoneHash!==expected ||
     permission.status!=='verified'||permission.revokedAt!==null||
     permission.providerPermissionSource!=='twilio_signed_webhook'||
     !permission.providerPermissionRef?.trim()||
     !/^SM[a-f0-9]{32}$/i.test(permission.providerPermissionRequestSid||'')||
     !/^[a-f0-9]{64}$/i.test(permission.evidenceSha256)||
     !permission.verifiedAt||permission.verifiedAt.getTime()>now.getTime()||
     !Number.isFinite(age)||age>now.getTime()||
     now.getTime()-age>WHATSAPP_CALLING_DEFAULTS.maxPermissionDays*86400_000||
     !permission.expiresAt||permission.expiresAt.getTime()<=now.getTime())return false;
  if (permission.outboundCallWindowStart &&
     permission.outboundCallWindowStart.getTime()>now.getTime())return false;
  if(!Number.isSafeInteger(permission.outboundCallsInWindow)||permission.outboundCallsInWindow<0)return false;
  return true;
}

export function whatsappCallQuotaAllows(
  count: number, windowStart:Date|null, now:Date,
):boolean {
  if(!Number.isSafeInteger(count)||count<0)return false;
  if(windowStart===null)return count===0;
  const elapsed=now.getTime()-windowStart.getTime();
  if(!Number.isFinite(elapsed)||elapsed<0)return false;
  return elapsed>=24*3600_000 || count < WHATSAPP_CALLING_DEFAULTS.maxCallsPer24Hours;
}

/** Requests are limited by Meta independently of outgoing call limits.
 * Includes unresolved/failed sends: never retry automatically after uncertainty.
 */
export function whatsappPermissionRequestQuotaAllows(attempts:Date[],now:Date):boolean {
  if(!(now instanceof Date)||!Number.isFinite(now.getTime())||
     !Array.isArray(attempts))return false;
  const seen=attempts.map(x=>x instanceof Date?x.getTime():Number.NaN);
  if(seen.some(x=>!Number.isFinite(x)||x>now.getTime()))return false;
  const pastWeek=seen.filter(x=>x>=now.getTime()-7*86400_000);
  const pastDay=pastWeek.filter(x=>x>=now.getTime()-86400_000);
  return pastDay.length < WHATSAPP_CALLING_DEFAULTS.maxPermissionRequests24Hours &&
    pastWeek.length < WHATSAPP_CALLING_DEFAULTS.maxPermissionRequests7Days;
}

/** Extra conservative budget hold; invoices must be reconciled with Twilio/Meta. */
export function estimateWhatsAppCallReservationMicros(seconds:number):bigint {
  if(!Number.isSafeInteger(seconds)||seconds<30||seconds>WHATSAPP_CALLING_DEFAULTS.maxSeconds) {
    throw new FlipVoiceCoreError('WA_CALL_DURATION_INVALID');
  }
  return BigInt(Math.ceil(seconds/60))*WHATSAPP_CALLING_DEFAULTS.estimatedCombinedUsdMicrosPerMinute;
}

/** Only a signed Twilio messaging webhook can change permission state. */
export function parseTwilioCallPermissionReply(
  fields:Record<string,string>,
):{decision:'accepted'|'rejected';permanent:boolean;sender:string;recipient:string;eventSid:string}|null {
  if(fields.Body!=='VOICE_CALL_REQUEST' ||
    (fields.ButtonPayload!=='ACCEPTED'&&fields.ButtonPayload!=='REJECTED'))return null;
  if(!/^SM[a-f0-9]{32}$/i.test(fields.MessageSid||''))return null;
  try {
    return {
      decision:fields.ButtonPayload==='ACCEPTED'?'accepted':'rejected',
      permanent:fields.CallPermissionIsPermanent==='true',
      sender:normalizeWhatsAppAddress(fields.From||''),
      recipient:normalizeWhatsAppAddress(fields.To||''),
      eventSid:fields.MessageSid,
    };
  }catch{return null;}
}

export function validateWhatsAppTwilioAccount(fields:Record<string,string>, sid:string):boolean {
  return /^AC[a-f0-9]{32}$/i.test(sid)&&fields.AccountSid===sid;
}

/** Deliberately no PSTN forwarding; only a provider-confirmed VoIP/SIP handoff. */
export function validateWhatsAppHumanHandoff(input:{
  provider:'twilio'|'elevenlabs'; destinationKind:'voip'|'sip'|'pstn';
  configured:boolean; approved:boolean;
}): boolean {
  return input.configured&&input.approved&&input.destinationKind!=='pstn';
}

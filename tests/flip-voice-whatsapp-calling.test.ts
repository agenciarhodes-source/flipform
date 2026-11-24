import test from 'node:test';
import assert from 'node:assert/strict';
import {
  WHATSAPP_CALLING_DEFAULTS, normalizeWhatsAppAddress, validateWhatsAppChannel,
  isWhatsAppCallPermitted, whatsappCallQuotaAllows,
  estimateWhatsAppCallReservationMicros, parseTwilioCallPermissionReply,
  validateWhatsAppHumanHandoff, validateWhatsAppTwilioAccount,
  type ProviderWhatsAppPermission,
} from '../lib/flip-voice/whatsapp-calling-policy';
import { hashCallIdentity } from '../lib/flip-voice/telephony-core';

const pepper='x'.repeat(32);
const now=new Date('2026-11-24T16:00:00.000Z');
const number='+5586999990000';
const permission=():ProviderWhatsAppPermission=>({
  tenantId:'tenant-a',leadId:'lead-a',phoneHash:hashCallIdentity('tenant-a:'+number,pepper),
  channel:'whatsapp',evidenceSha256:'a'.repeat(64),
  providerPermissionSource:'twilio_signed_webhook',
  providerPermissionRef:'SM'+'a'.repeat(32),
  providerPermissionConfirmedAt:new Date('2026-11-23T12:00:00.000Z'),
  verifiedAt:new Date('2026-11-23T12:00:00.000Z'),
  expiresAt:new Date('2026-11-30T12:00:00.000Z'),
  revokedAt:null,status:'verified',
  outboundCallWindowStart:null,outboundCallsInWindow:0,
});

test('WhatsApp channel disabled by default and distinct from PSTN',()=>{
  assert.equal(WHATSAPP_CALLING_DEFAULTS.globalEnabled,false);
  assert.equal(WHATSAPP_CALLING_DEFAULTS.outboundEnabled,false);
  assert.equal(WHATSAPP_CALLING_DEFAULTS.dryRun,true);
  assert.equal(normalizeWhatsAppAddress('whatsapp:'+number),number);
  for(const s of [number,'whatsapp:+15551234567','tel:'+number,'whatsapp:+5586BAD']){
    assert.throws(()=>normalizeWhatsAppAddress(s));
  }
});

test('WhatsApp sender validation is tenant-bound and independently enabled',()=>{
 const line={tenantId:'tenant-a',status:'ready',phoneE164:'+558655551111',
   whatsappInboundEnabled:true,whatsappOutboundEnabled:true,
   whatsappSenderSid:'XE'+'a'.repeat(32),whatsappRoutingMode:'twilio_voice'};
 assert.doesNotThrow(()=>validateWhatsAppChannel(line,'tenant-a','outbound'));
 for(const p of [{tenantId:'tenant-b'},{whatsappOutboundEnabled:false},
   {whatsappInboundEnabled:false},{status:'disabled'},{whatsappRoutingMode:'none'},
   {whatsappSenderSid:null}]){
   const changed={...line,...p};
   const direction='whatsappInboundEnabled' in p?'inbound':'outbound';
   assert.throws(()=>validateWhatsAppChannel(changed,'tenant-a',direction));
 }
});

test('permission requires exact tenant, number and signed provider origin',()=>{
 assert.equal(isWhatsAppCallPermitted(permission(),'tenant-a','lead-a',number,pepper,now),true);
 for(const change of [{channel:'pstn'},{status:'pending'},{providerPermissionSource:null},
  {providerPermissionRef:null},{phoneHash:'b'.repeat(64)},
  {expiresAt:new Date('2026-11-23')},{revokedAt:now},
  {providerPermissionConfirmedAt:new Date('2026-11-01')},
  {providerPermissionConfirmedAt:new Date('2026-11-25')},
  {evidenceSha256:'fake'}]){
  assert.equal(isWhatsAppCallPermitted({...permission(),...change},'tenant-a','lead-a',number,pepper,now),false);
 }
 assert.equal(isWhatsAppCallPermitted(permission(),'tenant-b','lead-a',number,pepper,now),false);
 assert.equal(isWhatsAppCallPermitted(permission(),'tenant-a','lead-b',number,pepper,now),false);
 assert.equal(isWhatsAppCallPermitted(permission(),'tenant-a','lead-a','+5586999991111',pepper,now),false);
});

test('five-call/24h limit and 7-day grant expiry',()=>{
 assert.equal(whatsappCallQuotaAllows(0,null,now),true);
 assert.equal(whatsappCallQuotaAllows(4,new Date('2026-11-24T10:00:00Z'),now),true);
 assert.equal(whatsappCallQuotaAllows(5,new Date('2026-11-24T10:00:00Z'),now),false);
 assert.equal(whatsappCallQuotaAllows(5,new Date('2026-11-23T15:00:00Z'),now),true);
 assert.equal(whatsappCallQuotaAllows(5,new Date('2026-11-25T15:00:00Z'),now),false);
 assert.equal(estimateWhatsAppCallReservationMicros(180),750_000n);
 assert.throws(()=>estimateWhatsAppCallReservationMicros(3600));
});

test('Twilio permission event parsing cannot infer approval from regular message',()=>{
 const payload={Body:'VOICE_CALL_REQUEST',ButtonPayload:'ACCEPTED',CallPermissionIsPermanent:'false',
   To:'whatsapp:+558655551111',From:'whatsapp:'+number,
   MessageSid:'SM'+'a'.repeat(32),AccountSid:'AC'+'b'.repeat(32)};
 const p=parseTwilioCallPermissionReply(payload);
 assert.deepEqual(p,{decision:'accepted',permanent:false,sender:number,
  recipient:'+558655551111',eventSid:payload.MessageSid});
 assert.equal(parseTwilioCallPermissionReply({...payload,ButtonPayload:'MAYBE'}),null);
 assert.equal(parseTwilioCallPermissionReply({...payload,Body:'test'}),null);
 assert.equal(validateWhatsAppTwilioAccount(payload,payload.AccountSid),true);
 assert.equal(validateWhatsAppTwilioAccount(payload,'AC'+'c'.repeat(32)),false);
});

test('handoff is VoIP/SIP only and never bridges WhatsApp to PSTN',()=>{
 assert.equal(validateWhatsAppHumanHandoff({provider:'twilio',destinationKind:'sip',configured:true,approved:true}),true);
 assert.equal(validateWhatsAppHumanHandoff({provider:'twilio',destinationKind:'pstn',configured:true,approved:true}),false);
 assert.equal(validateWhatsAppHumanHandoff({provider:'elevenlabs',destinationKind:'voip',configured:false,approved:true}),false);
});

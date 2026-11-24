import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  normalizeBrazilianDialNumber, validE164, validatePstnLine, validRecipientPermission,
  allowedBrazilBusinessHours, estimateCallReserveMicros, utcMonthStart,
  hashCallIdentity, validTwilioSignature, estimatedTerminalSpendMicros,
} from '../lib/flip-voice/telephony-core';

const line={tenantId:'tenant-A',status:'ready',inboundEnabled:true,outboundEnabled:true,providerAgentId:'agent_1234567890123',providerPhoneNumberId:'phnum_1234567890123',phoneE164:'+5511987654321'};
test('PSTN line is tenant-scoped, disabled unless ready and configured',()=>{
 assert.doesNotThrow(()=>validatePstnLine(line,'tenant-A','outbound'));
 for(const changed of [
  {...line,tenantId:'tenant-B'}, {...line,status:'disabled'},
  {...line,outboundEnabled:false}, {...line,phoneE164:'11999999999'},
  {...line,providerAgentId:'invalid!'},
 ]) assert.throws(()=>validatePstnLine(changed,'tenant-A','outbound'));
});

test('Brazilian dial normalization never sends arbitrary raw input',()=>{
 assert.equal(normalizeBrazilianDialNumber('(86) 99999-0000'),'+5586999990000');
 assert.equal(normalizeBrazilianDialNumber('+55 86 99999 0000'),'+5586999990000');
 for(const phone of ['bad','123','+1 555 111 2222',undefined])assert.throws(()=>normalizeBrazilianDialNumber(phone));
 assert.equal(validE164('+5586999990000'),true);
 assert.equal(validE164('5586999990000'),false);
});

test('recipient consent is separate from voice consent and revocable',()=>{
 const now = new Date('2026-11-24T14:00:00Z');
 const p={tenantId:'A',leadId:'lead1',channel:'pstn',purpose:'requested_follow_up',evidenceSha256:'a'.repeat(64),phoneHash:'b'.repeat(64),status:'verified',verifiedAt:new Date('2026-11-20'),expiresAt:new Date('2026-12-20'),revokedAt:null};
 assert.equal(validRecipientPermission(p,'A','lead1','b'.repeat(64),now),true);
 for(const changed of [
  {...p,tenantId:'B'}, {...p,leadId:'lead2'}, {...p,status:'pending'},
  {...p,revokedAt:now}, {...p,expiresAt:new Date('2026-11-01')},
  {...p,evidenceSha256:'bogus'}, {...p,phoneHash:'c'.repeat(64)}, {...p,verifiedAt:new Date('2026-12-01')},
  {...p,channel:'whatsapp'}, {...p,purpose:'marketing_prospecting'}
 ]) assert.equal(validRecipientPermission(changed,'A','lead1','b'.repeat(64),now),false);
});

test('business-hour and budget guards are conservative',()=>{
 assert.equal(allowedBrazilBusinessHours(new Date('2026-11-24T15:00:00Z')),true);
 assert.equal(allowedBrazilBusinessHours(new Date('2026-11-25T01:00:00Z')),false);
 assert.equal(allowedBrazilBusinessHours(new Date('2026-11-22T15:00:00Z')),false);
 assert.equal(estimateCallReserveMicros(180),600_000n);
 assert.throws(()=>estimateCallReserveMicros(3600));
 assert.equal(utcMonthStart(new Date('2026-11-24T13:22:00Z')).toISOString(),'2026-11-01T00:00:00.000Z');
});

test('Twilio signature requires HTTPS, exact parameters and constant-time comparison',()=>{
 const url='https://example.com/api/flip-voice/twilio/inbound';
 const params={To:'+5511987654321',From:'+5586999990000',CallSid:'CA123'};
 const key='test-token-with-more-than-16-characters';
 const payload=url+Object.keys(params).sort().map(k=>k+params[k]).join('');
 const sig=createHmac('sha1',key).update(payload).digest('base64');
 assert.equal(validTwilioSignature(url,params,key,sig),true);
 assert.equal(validTwilioSignature('http://example.com/unsafe',params,key,sig),false);
 assert.equal(validTwilioSignature(url,{...params,To:'+5586999999999'},key,sig),false);
 assert.equal(validTwilioSignature(url,params,key,'anything'),false);
 assert.match(hashCallIdentity('lead-1','x'.repeat(32)),/^[a-f0-9]{64}$/);
 assert.throws(()=>hashCallIdentity('lead-1','weak'));
});

test('terminal settlement caps estimated cost at previously reserved budget',()=>{
 assert.equal(estimatedTerminalSpendMicros('completed',120,600_000n),400_000n);
 assert.equal(estimatedTerminalSpendMicros('completed',0,600_000n),200_000n);
 assert.equal(estimatedTerminalSpendMicros('busy',null,600_000n),0n);
 assert.equal(estimatedTerminalSpendMicros('completed',200,600_000n),null);
 assert.equal(estimatedTerminalSpendMicros('completed',null,600_000n),null);
 assert.equal(estimatedTerminalSpendMicros('completed',10,-1n),null);
});

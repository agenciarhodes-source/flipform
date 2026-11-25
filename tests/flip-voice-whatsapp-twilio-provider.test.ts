import test from 'node:test';
import assert from 'node:assert/strict';
import { createTwilioWhatsAppCall, requestTwilioWhatsAppCallPermission } from '../lib/flip-voice/whatsapp-twilio-provider';

const defaults={
  accountSid:'AC'+'a'.repeat(32),authToken:'x'.repeat(24),
  senderE164:'+558655551111',recipientE164:'+5586999990000',
  voiceWebhookUrl:'https://api.example.com/api/flip-voice/whatsapp/outbound-twiml?ticket='+('a'.repeat(32)),
  statusWebhookUrl:'https://api.example.com/api/flip-voice/whatsapp/status',
};
test('official Twilio WhatsApp outbound endpoint uses dedicated addresses and trusted URL',async()=>{
 let calls=0;
 const transport=(async(url:RequestInfo|URL,init?:RequestInit)=>{
   calls++;
   assert.equal(url,'https://api.twilio.com/2010-04-01/Accounts/'+defaults.accountSid+'/Calls.json');
   assert.equal(init?.method,'POST');
   const form=new URLSearchParams(String(init?.body));
   assert.equal(form.get('To'),'whatsapp:'+defaults.recipientE164);
   assert.equal(form.get('From'),'whatsapp:'+defaults.senderE164);
   assert.equal(form.get('Record'),'false');
   assert.equal(form.get('Url'),defaults.voiceWebhookUrl);
   assert.equal(form.get('StatusCallback'),defaults.statusWebhookUrl);
   return new Response(JSON.stringify({sid:'CA'+'b'.repeat(32)}),{status:201});
 }) as typeof fetch;
 const result=await createTwilioWhatsAppCall({...defaults,fetchImpl:transport});
 assert.equal(result.callSid,'CA'+'b'.repeat(32));
 assert.equal(calls,1);
});
test('provider refuses unapproved callback URLs and invalid sender before network',async()=>{
 let calls=0;
 const transport=(async()=>{calls++;throw Error('unwanted network');}) as typeof fetch;
 for(const patch of [
  {senderE164:'+15551234567'},
  {voiceWebhookUrl:'https://api.example.com/api/flip-voice/whatsapp/outbound-twiml'},
  {voiceWebhookUrl:'https://api.example.com/api/flip-voice/whatsapp/outbound-twiml?ticket=short'},
  {voiceWebhookUrl:'https://api.example.com/api/flip-voice/whatsapp/outbound-twiml?ticket='+('a'.repeat(32))+'&extra=1'},
  {voiceWebhookUrl:'http://api.example.com/api/flip-voice/whatsapp/outbound-twiml'},
  {statusWebhookUrl:'https://evil.example.com/pstn'},
  {accountSid:'invalid'},
 ]){
  await assert.rejects(createTwilioWhatsAppCall({...defaults,...patch,fetchImpl:transport}));
 }
 assert.equal(calls,0);
});
test('permission request uses exactly approved Twilio call template',async()=>{
 let calls=0;
 const transport=(async(url:RequestInfo|URL,init?:RequestInit)=>{
   calls++;
   assert.equal(String(url),'https://api.twilio.com/2010-04-01/Accounts/'+defaults.accountSid+'/Messages.json');
   const form=new URLSearchParams(String(init?.body));
   assert.equal(form.get('ContentSid'),'HX'+'b'.repeat(32));
   assert.equal(form.get('From'),'whatsapp:'+defaults.senderE164);
   assert.equal(form.get('To'),'whatsapp:'+defaults.recipientE164);
   assert.equal(form.get('Body'),null);
   return new Response(JSON.stringify({sid:'SM'+'c'.repeat(32)}),{status:201});
 }) as typeof fetch;
 const x=await requestTwilioWhatsAppCallPermission({...defaults,contentSid:'HX'+'b'.repeat(32),fetchImpl:transport});
 assert.equal(x.messageSid,'SM'+'c'.repeat(32));
 assert.equal(calls,1);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { startElevenTwilioOutbound, registerElevenTwilioInbound } from '../lib/flip-voice/telephony-provider';
const defaults={
 apiKey:'test-elevenlabs-nonsecret-123', agentId:'agent_valid12345678',
 agentPhoneNumberId:'phnum_valid12345678', recipientNumber:'+5586999990000',
 recordingAllowed:false as const,
};
test('outbound refuses malformed numbers, ids and recording without provider calls',async()=>{
 let calls=0;
 const fetchImpl = (async()=>{calls++;throw Error('SHOULD_NOT_CALL')}) as unknown as typeof fetch;
 for(const patch of [{recipientNumber:'invalid'}, {agentId:'!'},{recordingAllowed:true}, {apiKey:''}]) {
  await assert.rejects(startElevenTwilioOutbound({...defaults,...patch,fetchImpl} as typeof defaults & {fetchImpl:typeof fetch}));
 }
 assert.equal(calls,0);
});
test('outbound request is bounded, recording OFF and returns Twilio call ID',async()=>{
 let seen=0;
 const fetchImpl = (async(url: RequestInfo | URL, init?: RequestInit)=>{
  seen++;
  assert.equal(url,'https://api.elevenlabs.io/v1/convai/twilio/outbound-call');
  assert.equal(init?.method,'POST');
  const data=JSON.parse(String(init?.body));
  assert.deepEqual(data,{agent_id:defaults.agentId,agent_phone_number_id:defaults.agentPhoneNumberId,to_number:defaults.recipientNumber,call_recording_enabled:false});
  return new Response(JSON.stringify({success:true,callSid:'CA'+'a'.repeat(32),conversation_id:'conv1'}),{status:200});
 }) as typeof fetch;
 const result=await startElevenTwilioOutbound({...defaults,fetchImpl});
 assert.equal(result.providerCallId,'CA'+'a'.repeat(32));
 assert.equal(seen,1);
});
test('unknown provider response never signals successful call',async()=>{
 const fetchImpl = (async()=>new Response(JSON.stringify({success:false}),{status:200})) as typeof fetch;
 await assert.rejects(startElevenTwilioOutbound({...defaults,fetchImpl}),/ELEVEN_OUTBOUND_RESPONSE_UNCERTAIN/);
});
test('inbound requires XML returned by provider, never redirects to untrusted endpoint',async()=>{
 const fetchImpl=(async (_url: RequestInfo|URL,init?:RequestInit)=>{
  const body=JSON.parse(String(init?.body));assert.equal(body.direction,'inbound');
  return new Response('<?xml version="1.0"?><Response><Connect><Stream url="wss://example.com/test" /></Connect></Response>',{status:200});
 }) as typeof fetch;
 const xml=await registerElevenTwilioInbound({
  apiKey:defaults.apiKey,agentId:defaults.agentId,fromNumber:defaults.recipientNumber,
  toNumber:'+5511987654321',fetchImpl,
 });
 assert.match(xml,/^<\?xml/);
 const badFetch=(async()=>new Response('<!DOCTYPE x><Response><Redirect>https://bad</Redirect></Response>',{status:200})) as typeof fetch;
 await assert.rejects(registerElevenTwilioInbound({
  apiKey:defaults.apiKey,agentId:defaults.agentId,fromNumber:defaults.recipientNumber,
  toNumber:'+5511987654321',fetchImpl:badFetch,
 }),/ELEVEN_TWIML_INVALID/);
});

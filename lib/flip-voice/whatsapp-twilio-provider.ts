import { FlipVoiceCoreError } from './agent-core';
import { validE164 } from './telephony-core';

const SID=/^AC[a-f0-9]{32}$/i;
const CALL=/^CA[a-f0-9]{32}$/i;
const CONTENT=/^HX[a-f0-9]{32}$/i;
function validateTwilioCredentials(sid:string,token:string):void{
  if(!SID.test(sid)||token.trim().length<16)throw new FlipVoiceCoreError('WA_TWILIO_CREDENTIALS_MISSING');
}
function trustedWebhook(url:string,path:string):void{
  let target:URL;
  try{target=new URL(url);}catch{throw new FlipVoiceCoreError('WA_WEBHOOK_URL_INVALID');}
  if(target.protocol!=='https:'||target.username||target.password||target.search||target.hash||
     target.hostname==='localhost'||target.pathname!==path){
    throw new FlipVoiceCoreError('WA_WEBHOOK_URL_INVALID');
  }
}
function verifyNumber(n:string):void{
  if(!validE164(n)||!n.startsWith('+55'))throw new FlipVoiceCoreError('WA_NUMBER_INVALID');
}

/** Business-initiated WhatsApp call via Twilio's official Voice API. */
export async function createTwilioWhatsAppCall(input:{
  accountSid:string;authToken:string;senderE164:string;recipientE164:string;
  voiceWebhookUrl:string;statusWebhookUrl:string;fetchImpl?:typeof fetch;
}):Promise<{callSid:string}>{
  validateTwilioCredentials(input.accountSid,input.authToken);
  verifyNumber(input.senderE164);verifyNumber(input.recipientE164);
  trustedWebhook(input.voiceWebhookUrl,'/api/flip-voice/whatsapp/outbound-twiml');
  trustedWebhook(input.statusWebhookUrl,'/api/flip-voice/whatsapp/status');
  const payload=new URLSearchParams({
    From:'whatsapp:'+input.senderE164,
    To:'whatsapp:'+input.recipientE164,
    Url:input.voiceWebhookUrl,
    Method:'POST',
    StatusCallback:input.statusWebhookUrl,
    StatusCallbackMethod:'POST',
    'StatusCallbackEvent[0]':'completed',
    Record:'false',
  });
  const auth=Buffer.from(input.accountSid+':'+input.authToken).toString('base64');
  const res=await (input.fetchImpl??fetch)(
    'https://api.twilio.com/2010-04-01/Accounts/'+input.accountSid+'/Calls.json',
    {method:'POST',headers:{Authorization:'Basic '+auth,
       'Content-Type':'application/x-www-form-urlencoded'},
     body:payload.toString(),cache:'no-store',signal:AbortSignal.timeout(12000)},
  );
  if(!res.ok)throw new FlipVoiceCoreError('WA_TWILIO_CALL_STATE_UNCERTAIN_'+res.status);
  const data:unknown=await res.json().catch(()=>null);
  if(!data||typeof data!=='object'||!('sid' in data)||
     typeof data.sid!=='string'||!CALL.test(data.sid)){
    throw new FlipVoiceCoreError('WA_TWILIO_CALL_RESPONSE_UNCERTAIN');
  }
  return {callSid:data.sid};
}

/** Send Twilio VOICE_CALL_REQUEST Content template, NOT a free-form solicitation. */
export async function requestTwilioWhatsAppCallPermission(input:{
  accountSid:string;authToken:string;contentSid:string;senderE164:string;recipientE164:string;
  fetchImpl?:typeof fetch;
}):Promise<{messageSid:string}> {
  validateTwilioCredentials(input.accountSid,input.authToken);
  verifyNumber(input.senderE164);verifyNumber(input.recipientE164);
  if(!CONTENT.test(input.contentSid))throw new FlipVoiceCoreError('WA_TEMPLATE_SID_INVALID');
  const payload=new URLSearchParams({
    ContentSid:input.contentSid,From:'whatsapp:'+input.senderE164,
    To:'whatsapp:'+input.recipientE164,
  });
  const res=await (input.fetchImpl??fetch)(
    'https://api.twilio.com/2010-04-01/Accounts/'+input.accountSid+'/Messages.json',
    {method:'POST',headers:{
      Authorization:'Basic '+Buffer.from(input.accountSid+':'+input.authToken).toString('base64'),
      'Content-Type':'application/x-www-form-urlencoded'},
      body:payload.toString(),cache:'no-store',signal:AbortSignal.timeout(12000)},
  );
  if(!res.ok)throw new FlipVoiceCoreError('WA_PERMISSION_SEND_UNCERTAIN_'+res.status);
  const data:unknown=await res.json().catch(()=>null);
  if(!data||typeof data!=='object'||!('sid' in data)||
    typeof data.sid!=='string'||!/^SM[a-f0-9]{32}$/i.test(data.sid)){
    throw new FlipVoiceCoreError('WA_PERMISSION_RESPONSE_UNCERTAIN');
  }
  return {messageSid:data.sid};
}

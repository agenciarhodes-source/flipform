import { NextRequest, NextResponse } from 'next/server';
import { validTwilioSignature } from '@/lib/flip-voice/telephony-core';
import { validateWhatsAppTwilioAccount, normalizeWhatsAppAddress } from '@/lib/flip-voice/whatsapp-calling-policy';
import { settleFlipVoiceTwilioCall } from '@/lib/flip-voice/telephony-service';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const reply=(status=204)=>new NextResponse(null,{status,headers:{'Cache-Control':'no-store'}});

/** Channel-bound signed status callback: WhatsApp cannot settle PSTN calls. */
export async function POST(req:NextRequest) {
  if(process.env.FLIP_VOICE_WHATSAPP_ENABLED!=='true')return reply(403);
  const url=process.env.FLIP_VOICE_WHATSAPP_STATUS_URL||'';
  const token=process.env.TWILIO_AUTH_TOKEN||'';
  const accountSid=process.env.TWILIO_ACCOUNT_SID||'';
  let endpoint:URL;
  try{endpoint=new URL(url);}catch{return reply(403);}
  if(endpoint.protocol!=='https:'||endpoint.search||endpoint.hash||
     endpoint.pathname!==req.nextUrl.pathname ||
     !url.endsWith('/api/flip-voice/whatsapp/status')||token.length<16)return reply(403);
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')||
     Number(req.headers.get('content-length')||0)>4096)return reply(403);
  const raw=await req.text();
  if(raw.length>4096)return reply(403);
  const fields:Record<string,string>={};
  for(const [k,v]of new URLSearchParams(raw)){
    if(Object.hasOwn(fields,k)||!/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(k))return reply(403);
    fields[k]=v;
  }
  if(!validTwilioSignature(url,fields,token,req.headers.get('x-twilio-signature')||'')||
     !validateWhatsAppTwilioAccount(fields,accountSid))return reply(403);
  try{normalizeWhatsAppAddress(fields.From||'');normalizeWhatsAppAddress(fields.To||'');}
  catch{return reply(403);}
  const allowed=['completed','busy','no-answer','failed','canceled'] as const;
  if(!allowed.includes(fields.CallStatus as typeof allowed[number]))return reply(204);
  const seconds=fields.CallDuration?Number(fields.CallDuration):null;
  if(seconds!==null&&(!Number.isInteger(seconds)||seconds<0||seconds>3600))return reply(422);
  try{
    const res=await settleFlipVoiceTwilioCall({
      callSid:fields.CallSid||'',
      status:fields.CallStatus as typeof allowed[number],
      durationSeconds:seconds,channel:'whatsapp',
    });
    return reply(res==='needs_review'?409:204);
  }catch{return reply(503);}
}

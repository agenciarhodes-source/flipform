import { NextRequest, NextResponse } from 'next/server';
import { validTwilioSignature } from '@/lib/flip-voice/telephony-core';
import { normalizeWhatsAppAddress, validateWhatsAppTwilioAccount } from '@/lib/flip-voice/whatsapp-calling-policy';
import { registerWhatsAppInbound } from '@/lib/flip-voice/whatsapp-inbound-service';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const NO_CALL='<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="busy"/></Response>';
const reply=(twiml=NO_CALL)=>new NextResponse(twiml,{
  status:200,headers:{'Content-Type':'text/xml; charset=utf-8','Cache-Control':'no-store'},
});

/** Dedicated signed Twilio Voice webhook for WhatsApp Business Calling (NOT messages). */
export async function POST(req:NextRequest) {
  if(process.env.FLIP_VOICE_WHATSAPP_ENABLED!=='true' ||
     process.env.FLIP_VOICE_WHATSAPP_INBOUND_ENABLED!=='true' ||
     process.env.FLIP_VOICE_WHATSAPP_PROVIDER_VERIFIED!=='true')return reply();
  const webhookUrl=process.env.FLIP_VOICE_WHATSAPP_INBOUND_URL||'';
  const token=process.env.TWILIO_AUTH_TOKEN||'';
  const accountSid=process.env.TWILIO_ACCOUNT_SID||'';
  let u:URL;
  try{u=new URL(webhookUrl);}catch{return reply();}
  if(u.protocol!=='https:'||u.hash||u.search||u.pathname!==req.nextUrl.pathname ||
    !webhookUrl.endsWith('/api/flip-voice/whatsapp/inbound')||token.length<16)return reply();
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')||
     Number(req.headers.get('content-length')||0)>4096)return reply();
  const body=await req.text();
  if(body.length>4096)return reply();
  const fields:Record<string,string>={};
  for(const [k,v] of new URLSearchParams(body)){
    if(Object.hasOwn(fields,k)||!/^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(k))return reply();
    fields[k]=v;
  }
  if(!validTwilioSignature(webhookUrl,fields,token,req.headers.get('x-twilio-signature')||'')||
     !validateWhatsAppTwilioAccount(fields,accountSid)||
     !/^CA[a-f0-9]{32}$/i.test(fields.CallSid||''))return reply();
  try{
    const from=normalizeWhatsAppAddress(fields.From||'');
    const to=normalizeWhatsAppAddress(fields.To||'');
    const state=await registerWhatsAppInbound({fromNumber:from,toNumber:to,callSid:fields.CallSid});
    return reply(state.twiml);
  }catch{return reply();}
}

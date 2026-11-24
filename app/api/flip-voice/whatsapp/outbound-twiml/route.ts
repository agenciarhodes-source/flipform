import { NextRequest, NextResponse } from 'next/server';
import { validTwilioSignature } from '@/lib/flip-voice/telephony-core';
import { normalizeWhatsAppAddress, validateWhatsAppTwilioAccount } from '@/lib/flip-voice/whatsapp-calling-policy';
import { loadWhatsAppOutboundTwiML } from '@/lib/flip-voice/whatsapp-outbound-service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const NO_CALL='<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="busy"/></Response>';
const reply=(twiml=NO_CALL)=>new NextResponse(twiml,{headers:{'Content-Type':'text/xml; charset=utf-8','Cache-Control':'no-store'}});
export async function POST(req:NextRequest){
 if(process.env.FLIP_VOICE_WHATSAPP_ENABLED!=='true'||
    process.env.FLIP_VOICE_WHATSAPP_OUTBOUND_ENABLED!=='true'||
    process.env.FLIP_VOICE_WHATSAPP_PROVIDER_VERIFIED!=='true')return reply();
 const url=process.env.FLIP_VOICE_WHATSAPP_OUTBOUND_TWIML_URL||'';
 const token=process.env.TWILIO_AUTH_TOKEN||'';
 let endpoint:URL;try{endpoint=new URL(url);}catch{return reply();}
 if(endpoint.protocol!=='https:'||endpoint.search||endpoint.hash||
    endpoint.pathname!==req.nextUrl.pathname||
    !url.endsWith('/api/flip-voice/whatsapp/outbound-twiml')||token.length<16)return reply();
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')||
    Number(req.headers.get('content-length')||0)>4096)return reply();
 const body=await req.text();if(body.length>4096)return reply();
 const fields:Record<string,string>={};
 for(const [k,v]of new URLSearchParams(body)){
   if(Object.hasOwn(fields,k)||!/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(k))return reply();
   fields[k]=v;
 }
 if(!validTwilioSignature(url,fields,token,req.headers.get('x-twilio-signature')||'')||
    !validateWhatsAppTwilioAccount(fields,process.env.TWILIO_ACCOUNT_SID||''))return reply();
 try{
   const sender=normalizeWhatsAppAddress(fields.From||'');
   const recipient=normalizeWhatsAppAddress(fields.To||'');
   return reply(await loadWhatsAppOutboundTwiML({
     providerCallSid:fields.CallSid||'',sender,recipient,
   }));
 }catch{return reply();}
}

import { NextRequest, NextResponse } from 'next/server';
import { validTwilioSignature, validE164 } from '@/lib/flip-voice/telephony-core';
import { registerFlipVoiceInbound } from '@/lib/flip-voice/telephony-service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const REJECT = '<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="busy"/></Response>';
const xml=(body:string,status=200) => new NextResponse(body,{
  status,headers:{'Content-Type':'text/xml; charset=utf-8','Cache-Control':'no-store'},
});

/** Public webhook: authenticates Twilio BEFORE any DB read or API call. */
export async function POST(req:NextRequest) {
  const callbackUrl=process.env.FLIP_VOICE_TWILIO_INBOUND_URL || '';
  const token=process.env.TWILIO_AUTH_TOKEN || '';
  if (process.env.FLIP_VOICE_PSTN_ENABLED !== 'true' || !callbackUrl || !token) return xml(REJECT);
  let canonical:URL;
  try {canonical=new URL(callbackUrl);}
  catch {return xml(REJECT);}
  if (canonical.protocol!=='https:' || canonical.search || canonical.hash ||
    canonical.pathname!==req.nextUrl.pathname ||
    !callbackUrl.endsWith('/api/flip-voice/twilio/inbound')) return xml(REJECT);
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded')
    || Number(req.headers.get('content-length')||'0')>4096) return xml(REJECT);
  const raw=await req.text();
  if(raw.length>4096)return xml(REJECT);
  const form=new URLSearchParams(raw);
  const params:Record<string,string>={};
  for(const [k,v] of form) {
    if(Object.hasOwn(params,k) || !/^[a-zA-Z][a-zA-Z0-9_]{0,60}$/.test(k))return xml(REJECT);
    params[k]=v;
  }
  const signature=req.headers.get('x-twilio-signature')||'';
  if(!validTwilioSignature(callbackUrl,params,token,signature))return xml(REJECT);
  if(!validE164(params.To||'')||!validE164(params.From||'') ||
    !/^CA[a-f0-9]{32}$/i.test(params.CallSid||''))return xml(REJECT);
  try {
    const result=await registerFlipVoiceInbound({
      calledNumber:params.To,callerNumber:params.From,callSid:params.CallSid,
    });
    return xml(result.twiml);
  }catch{return xml(REJECT);}
}

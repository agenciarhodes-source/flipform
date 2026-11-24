import { NextRequest, NextResponse } from 'next/server';
import { validTwilioSignature } from '@/lib/flip-voice/telephony-core';
import { settleFlipVoiceTwilioCall } from '@/lib/flip-voice/telephony-service';

export const runtime='nodejs';
export const dynamic='force-dynamic';

/** Twilio status webhook. Signed event required, never accepts tenant/budget from payload. */
export async function POST(req:NextRequest) {
  const url=process.env.FLIP_VOICE_TWILIO_STATUS_URL || '';
  const auth=process.env.TWILIO_AUTH_TOKEN || '';
  const reply=(status=204)=>new NextResponse(null,{status,headers:{'Cache-Control':'no-store'}});
  if(process.env.FLIP_VOICE_PSTN_ENABLED!=='true'||!url||!auth)return reply(403);
  try{
    const canonical=new URL(url);
    if(canonical.protocol!=='https:'||canonical.search||canonical.hash||
       canonical.pathname!==req.nextUrl.pathname||
       !url.endsWith('/api/flip-voice/twilio/status'))return reply(403);
    if(!req.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')||
       Number(req.headers.get('content-length')||'0')>4096)return reply(403);
    const text=await req.text();
    if(text.length>4096)return reply(403);
    const params:Record<string,string>={};
    for(const [k,v]of new URLSearchParams(text)){
      if(Object.hasOwn(params,k)||!/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(k))return reply(403);
      params[k]=v;
    }
    if(!validTwilioSignature(url,params,auth,req.headers.get('x-twilio-signature')||''))return reply(403);
    const status=params.CallStatus;
    if(!['completed','busy','no-answer','failed','canceled'].includes(status))return reply(204);
    const seconds=params.CallDuration?Number(params.CallDuration):null;
    if(seconds!==null&&(!Number.isInteger(seconds)||seconds<0||seconds>3600))return reply(422);
    const result=await settleFlipVoiceTwilioCall({
      callSid:params.CallSid||'',status:status as 'completed'|'busy'|'no-answer'|'failed'|'canceled',
      durationSeconds:seconds,
    });
    // Retry on legitimate reconciliation failure; never acknowledge budget changes
    // that were not actually committed.
    return reply(result==='needs_review'?409:204);
  }catch{return reply(503);}
}

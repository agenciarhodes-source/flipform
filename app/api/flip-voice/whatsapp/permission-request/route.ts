import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { readFlipAiBody } from '@/lib/flip-ai/http';
import { initiateWhatsAppCallPermissionRequest } from '@/lib/flip-voice/whatsapp-permission-service';
import { FlipVoiceCoreError } from '@/lib/flip-voice/agent-core';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const schema=z.object({
  leadId:z.guid(),lineId:z.guid(),idempotencyKey:z.guid(),
}).strict();
const headers={'Cache-Control':'private, no-store'};

/** Sends one explicitly requested VOICE_CALL_REQUEST. Never starts a call. */
export const POST=withAuth(async(req:NextRequest,session)=>{
  if(req.headers.get('origin')!==req.nextUrl.origin)
    return NextResponse.json({code:'WA_INVALID_ORIGIN'},{status:403,headers});
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')||
     Number(req.headers.get('content-length')||0)>2048)
    return NextResponse.json({code:'WA_INVALID_BODY'},{status:400,headers});
  let parsedBody:unknown;
  try{parsedBody=await readFlipAiBody(req,2048);}
  catch{return NextResponse.json({code:'WA_INVALID_BODY'},{status:400,headers});}
  const p=schema.safeParse(parsedBody);
  if(!p.success)return NextResponse.json({code:'WA_INVALID_REQUEST'},{status:400,headers});
  try{
    const result=await initiateWhatsAppCallPermissionRequest(session,p.data);
    return NextResponse.json(result,{status:result.status==='sent'?202:result.reused?200:409,headers});
  }catch(error){
    if(error instanceof FlipVoiceCoreError){
      const forbidden=/DISABLED|FORBIDDEN|OUTSIDE|RATE_LIMIT|PREVIOUSLY_REVOKED/.test(error.code);
      return NextResponse.json({code:error.code},{status:forbidden?403:409,headers});
    }
    return NextResponse.json({code:'WA_PERMISSION_UNAVAILABLE'},{status:503,headers});
  }
});

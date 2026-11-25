import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { readFlipAiBody } from '@/lib/flip-ai/http';
import { requestFlipVoiceWhatsAppCall } from '@/lib/flip-voice/whatsapp-outbound-service';
import { FlipVoiceCoreError } from '@/lib/flip-voice/agent-core';
import { prisma } from '@/lib/prisma';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const form=z.object({leadId:z.guid(),lineId:z.guid(),idempotencyKey:z.guid()}).strict();
const headers={'Cache-Control':'private, no-store'};

/** Unit call, never bulk; Twilio enforces Meta consent in addition to DB proof. */
export const POST=withAuth(async(req:NextRequest,session)=>{
 if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({code:'INVALID_ORIGIN'},{status:403,headers});
 if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')||
    Number(req.headers.get('content-length')||0)>2048)return NextResponse.json({code:'INVALID_BODY'},{status:400,headers});
 let data:unknown;
 try{data=await readFlipAiBody(req,2048);}catch{return NextResponse.json({code:'INVALID_BODY'},{status:400,headers});}
 const p=form.safeParse(data);
 if(!p.success)return NextResponse.json({code:'INVALID_REQUEST'},{status:400,headers});
 try{
  const result=await requestFlipVoiceWhatsAppCall(session,p.data);
  return NextResponse.json(result,{status:result.reused?200:result.status==='initiated'?202:409,headers});
 }catch(err){
  if(err instanceof FlipVoiceCoreError){
   const forbidden=/FORBIDDEN|DISABLED|OUTSIDE|PERMISSION|OPTOUT/.test(err.code);
   return NextResponse.json({code:err.code},{status:forbidden?403:409,headers});
  }
  return NextResponse.json({code:'WA_CALL_UNAVAILABLE'},{status:503,headers});
 }
});
export const GET=withAuth(async(_req:NextRequest,session)=>{
 if(!session.tenantId||!['owner','admin','manager'].includes(session.role))return NextResponse.json({code:'WA_CALL_FORBIDDEN'},{status:403,headers});
 if(process.env.FLIP_VOICE_WHATSAPP_ENABLED!=='true')return NextResponse.json({enabled:false,calls:[]},{headers});
 try{
  const rows=await prisma.flipVoiceCall.findMany({
   where:{tenantId:session.tenantId,channel:'whatsapp'},
   orderBy:{createdAt:'desc'},take:50,
   select:{id:true,leadId:true,direction:true,status:true,
      createdAt:true,startedAt:true,endedAt:true,reservedUsdMicros:true,billedUsdMicros:true},
  });
  return NextResponse.json({enabled:true,calls:rows.map(x=>({
    ...x,reservedUsdMicros:String(x.reservedUsdMicros),billedUsdMicros:String(x.billedUsdMicros),
  }))},{headers});
 }catch{return NextResponse.json({code:'WA_CALL_UNAVAILABLE'},{status:503,headers});}
});

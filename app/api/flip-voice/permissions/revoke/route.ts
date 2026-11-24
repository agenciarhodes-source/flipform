import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { readFlipAiBody } from '@/lib/flip-ai/http';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const request=z.object({leadId:z.string().uuid()}).strict();

/** Owner/admin can immediately revoke every existing consent for a specific lead. */
export const POST = withAuth(async(req:NextRequest,session)=>{
  const headers={'Cache-Control':'private, no-store'};
  if(!session.tenantId||!['owner','admin'].includes(session.role))return NextResponse.json({code:'VOICE_FORBIDDEN'},{status:403,headers});
  if(req.headers.get('origin')!==req.nextUrl.origin)return NextResponse.json({code:'INVALID_ORIGIN'},{status:403,headers});
  if(!req.headers.get('content-type')?.startsWith('application/json')||
     Number(req.headers.get('content-length')||0)>1024)return NextResponse.json({code:'INVALID_BODY'},{status:400,headers});
  let body:unknown;
  try{body=await readFlipAiBody(req,1024);}catch{return NextResponse.json({code:'INVALID_BODY'},{status:400,headers});}
  const parsed=request.safeParse(body);
  if(!parsed.success)return NextResponse.json({code:'INVALID_REQUEST'},{status:400,headers});
  try{
    const tenantId=session.tenantId,leadId=parsed.data.leadId;
    const lead=await prisma.lead.findFirst({where:{tenantId,id:leadId},select:{id:true}});
    if(!lead)return NextResponse.json({code:'LEAD_NOT_FOUND'},{status:404,headers});
    const result=await prisma.$transaction(async db=>{
      const changed=await db.flipVoiceContactPermission.updateMany({
        where:{tenantId,leadId,channel:'pstn',revokedAt:null},
        data:{revokedAt:new Date(),status:'revoked'},
      });
      await db.auditLog.create({data:{
        tenantId,userId:session.userId,entityType:'flip_voice_contact_permission',
        entityId:leadId,action:'opt_out_pstn',metadata:{recordsRevoked:changed.count},
      }});
      return changed.count;
    });
    return NextResponse.json({revoked:true,recordsUpdated:result},{headers});
  }catch{return NextResponse.json({code:'VOICE_UNAVAILABLE'},{status:503,headers});}
});

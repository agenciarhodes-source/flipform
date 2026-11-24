import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashCallIdentity, validTwilioSignature } from '@/lib/flip-voice/telephony-core';
import {
  parseTwilioCallPermissionReply, validateTwilioWhatsAppAccountForEvent,
} from '@/lib/flip-voice/whatsapp-event';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const response = (status=204) => new NextResponse(null,{status,headers:{'Cache-Control':'no-store'}});

/**
 * Only signed Twilio voice-permission callbacks; NEVER accepts a tenantId or
 * leadId from the provider. Does not touch existing Meta Cloud message webhooks.
 */
export async function POST(req:NextRequest) {
  if(process.env.FLIP_VOICE_WHATSAPP_PERMISSION_WEBHOOK_ENABLED!=='true')return response(403);
  const callbackUrl=process.env.FLIP_VOICE_WHATSAPP_PERMISSION_URL||'';
  const token=process.env.TWILIO_AUTH_TOKEN||'';
  const accountSid=process.env.TWILIO_ACCOUNT_SID||'';
  const pepper=process.env.FLIP_VOICE_CONTACT_PEPPER||'';
  if(token.length<16||pepper.length<32)return response(403);
  let expected: URL;
  try{expected=new URL(callbackUrl);}catch{return response(403);}
  if(expected.protocol!=='https:'||expected.search||expected.hash||
    expected.pathname!==req.nextUrl.pathname ||
    !callbackUrl.endsWith('/api/flip-voice/whatsapp/permission'))return response(403);
  if(!req.headers.get('content-type')?.toLowerCase().startsWith('application/x-www-form-urlencoded') ||
     Number(req.headers.get('content-length')||'0')>4096)return response(403);
  const raw=await req.text();
  if(raw.length>4096)return response(403);
  const fields:Record<string,string>={};
  for(const [key,value] of new URLSearchParams(raw)){
    if(Object.hasOwn(fields,key) || !/^[A-Za-z][A-Za-z0-9_]{0,60}$/.test(key))return response(403);
    fields[key]=value;
  }
  if(!validTwilioSignature(callbackUrl,fields,token,req.headers.get('x-twilio-signature')||''))return response(403);
  if(!validateTwilioWhatsAppAccountForEvent(fields,accountSid))return response(403);
  const event=parseTwilioCallPermissionReply(fields);
  if(!event)return response(204); // other messages still go to existing messaging stack
  try{
    const channels=await prisma.flipVoiceLine.findMany({
      where:{phoneE164:event.recipient,status:'ready',whatsappRoutingMode:'twilio_voice'},
      select:{tenantId:true,whatsappSenderSid:true},take:2,
    });
    if(channels.length!==1||!channels[0].whatsappSenderSid)return response(204);
    const tenantId=channels[0].tenantId;
    const phoneHash=hashCallIdentity(tenantId+':'+event.sender,pepper);
    const now=new Date();
    const pending=await prisma.flipVoiceContactPermission.findMany({
      where:{
        tenantId,channel:'whatsapp',phoneHash,status:'pending',revokedAt:null,
        providerPermissionRequestSid:{not:null},
        expiresAt:{gt:now},
        createdAt:{gte:new Date(now.getTime()-7*86400_000)},
      },
      select:{id:true,leadId:true,providerPermissionRequestSid:true},
      orderBy:{createdAt:'desc'},take:2,
    });
    if(pending.length!==1||!/^SM[a-f0-9]{32}$/i.test(pending[0].providerPermissionRequestSid||''))return response(204);
    // Reject an unprompted button reply if no active, sent request exists.
    // Seven-day cap even for provider marked "permanent" permission.
    const expiresAt=new Date(now.getTime()+7*86400_000);
    const eventProof=hashCallIdentity(tenantId+':whatsapp-permission:'+event.eventSid,pepper);
    const result=await prisma.flipVoiceContactPermission.updateMany({
      where:{
        tenantId,id:pending[0].id,status:'pending',revokedAt:null,phoneHash,
        providerPermissionRequestSid:pending[0].providerPermissionRequestSid,
        expiresAt:{gt:now},
      },
      data:event.decision==='accepted'
        ? {status:'verified',verifiedAt:now,expiresAt,
           providerPermissionSource:'twilio_signed_webhook',
           providerPermissionRef:event.eventSid,
           providerPermissionConfirmedAt:now,
           evidenceSha256:eventProof}
        : {status:'revoked',revokedAt:now,expiresAt:now,
           providerPermissionSource:'twilio_signed_webhook',
           providerPermissionRef:event.eventSid,
           providerPermissionConfirmedAt:now,
           evidenceSha256:eventProof},
    });
    if(result.count===1){
      // Best effort no message content; no raw phone is stored.
      await prisma.auditLog.create({data:{
        tenantId,userId:null,entityType:'flip_voice_contact_permission',
        entityId:pending[0].id,action:event.decision==='accepted'?'whatsapp_call_permission_verified':'whatsapp_call_permission_rejected',
        metadata:{channel:'whatsapp',eventRefHash:eventProof.slice(0,20)},
      }}).catch(()=>undefined);
    }
    return response(204);
  }catch{return response(503);}
}

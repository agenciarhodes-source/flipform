import 'server-only';
import { Prisma } from '@prisma/client';
import type { SessionPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FlipVoiceCoreError } from './agent-core';
import { validateVoiceOwner, reserveBudget } from './telephony-service';
import {
  allowedBrazilBusinessHours, hashCallIdentity, normalizeBrazilianDialNumber, utcMonthStart,
} from './telephony-core';
import {
  estimateWhatsAppCallReservationMicros, isWhatsAppCallPermitted,
  whatsappCallQuotaAllows, validateWhatsAppChannel,
} from './whatsapp-calling-policy';
import { createTwilioWhatsAppCall } from './whatsapp-twilio-provider';
import { registerElevenTwilioInbound } from './telephony-provider';

const disabled=()=>process.env.FLIP_VOICE_WHATSAPP_ENABLED!=='true'||
  process.env.FLIP_VOICE_WHATSAPP_OUTBOUND_ENABLED!=='true'||
  process.env.FLIP_VOICE_WHATSAPP_PROVIDER_VERIFIED!=='true';
const sid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const rejected='<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="busy"/></Response>';

export async function requestFlipVoiceWhatsAppCall(
  session:SessionPayload,
  input:{leadId:string;lineId:string;idempotencyKey:string},
):Promise<{id:string;status:string;reused:boolean}> {
  if(!session.tenantId||!['owner','admin'].includes(session.role))throw new FlipVoiceCoreError('WA_CALL_FORBIDDEN');
  if(disabled())throw new FlipVoiceCoreError('WA_CALL_GLOBALLY_DISABLED');
  if(!sid.test(input.leadId)||!sid.test(input.lineId)||!sid.test(input.idempotencyKey))throw new FlipVoiceCoreError('WA_CALL_ID_INVALID');
  const pepper=process.env.FLIP_VOICE_CONTACT_PEPPER||'';
  const accountSid=process.env.TWILIO_ACCOUNT_SID||'';
  const authToken=process.env.TWILIO_AUTH_TOKEN||'';
  const voiceUrl=process.env.FLIP_VOICE_WHATSAPP_OUTBOUND_TWIML_URL||'';
  const statusUrl=process.env.FLIP_VOICE_WHATSAPP_STATUS_URL||'';
  if(pepper.length<32||authToken.length<16||!accountSid)throw new FlipVoiceCoreError('WA_CALL_PROVIDER_NOT_READY');
  const now=new Date();
  if(!allowedBrazilBusinessHours(now))throw new FlipVoiceCoreError('WA_CALL_OUTSIDE_HOURS');
  const tenantId=session.tenantId;
  const [line,settings,lead,budget]=await Promise.all([
    prisma.flipVoiceLine.findFirst({where:{tenantId,id:input.lineId}}),
    prisma.flipVoiceSettings.findUnique({where:{tenantId}}),
    prisma.lead.findFirst({where:{tenantId,id:input.leadId},select:{id:true,phone:true,tenantId:true}}),
    prisma.flipVoiceBudget.findUnique({where:{tenantId_periodStart:{tenantId,periodStart:utcMonthStart(now)}}}),
  ]);
  if(!line||!settings?.enabled||!settings.outboundEnabled||!lead||!budget)throw new FlipVoiceCoreError('WA_CALL_NOT_CONFIGURED');
  validateWhatsAppChannel(line,tenantId,'outbound');
  if(settings.maxCallSeconds<30||settings.maxCallSeconds>180)throw new FlipVoiceCoreError('WA_CALL_DURATION_INVALID');
  const amount=estimateWhatsAppCallReservationMicros(settings.maxCallSeconds);
  if(settings.perCallLimitMicros<amount||settings.monthlyLimitMicros<amount)throw new FlipVoiceCoreError('WA_CALL_BUDGET_DISABLED');
  const recipient=normalizeBrazilianDialNumber(lead.phone);
  const numberHash=hashCallIdentity(tenantId+':'+recipient,pepper);
  const permissions=await prisma.flipVoiceContactPermission.findMany({
    where:{tenantId,leadId:lead.id,channel:'whatsapp'},
    orderBy:{createdAt:'desc'},take:30,
  });
  const consent=permissions.find(x=>isWhatsAppCallPermitted(x,tenantId,lead.id,recipient,pepper,now));
  const newerRevocation=permissions.some(x=>x.revokedAt&&(!consent?.verifiedAt||x.revokedAt.getTime()>=consent.verifiedAt.getTime()));
  if(!consent||newerRevocation||!whatsappCallQuotaAllows(consent.outboundCallsInWindow,consent.outboundCallWindowStart,now)){
    throw new FlipVoiceCoreError('WA_CALL_PERMISSION_NOT_VERIFIED');
  }
  const consentId=await validateVoiceOwner(prisma,{tenantId,profileId:line.profileId,now});
  const requestKeyHash=hashCallIdentity(tenantId+':wa-out:'+input.idempotencyKey,pepper);
  const held=await prisma.$transaction(async db=>{
    const previous=await db.flipVoiceCall.findFirst({
      where:{tenantId,channel:'whatsapp',direction:'outbound',requestKeyHash},
      select:{id:true,status:true},
    });
    if(previous)return {id:previous.id,status:previous.status,reused:true};
    // Locks serialize concurrent authorizations and preserve the provider call limit.
    const locks=await db.$queryRaw<{id:string}[]>(Prisma.sql`
      SELECT "id" FROM "flip_voice_contact_permissions"
      WHERE "id"=${consent.id} AND "tenant_id"=${tenantId}
      FOR UPDATE
    `);
    if(locks.length!==1)throw new FlipVoiceCoreError('WA_CALL_PERMISSION_CHANGED');
    const [freshLine,freshSettings,freshConsent,freshLead]=await Promise.all([
      db.flipVoiceLine.findFirst({where:{id:line.id,tenantId}}),
      db.flipVoiceSettings.findUnique({where:{tenantId}}),
      db.flipVoiceContactPermission.findFirst({where:{id:consent.id,tenantId}}),
      db.lead.findFirst({where:{id:lead.id,tenantId},select:{phone:true}}),
    ]);
    if(!freshLine||!freshSettings?.enabled||!freshSettings.outboundEnabled||
       freshSettings.perCallLimitMicros<amount||freshSettings.monthlyLimitMicros<amount||
       !freshConsent||!freshLead||normalizeBrazilianDialNumber(freshLead.phone)!==recipient)throw new FlipVoiceCoreError('WA_CALL_STATE_CHANGED');
    validateWhatsAppChannel(freshLine,tenantId,'outbound');
    const current=new Date();
    if(!isWhatsAppCallPermitted(freshConsent,tenantId,lead.id,recipient,pepper,current)||
       !whatsappCallQuotaAllows(freshConsent.outboundCallsInWindow,freshConsent.outboundCallWindowStart,current))throw new FlipVoiceCoreError('WA_CALL_PERMISSION_EXPIRED');
    const latestRevoked=await db.flipVoiceContactPermission.findFirst({
      where:{tenantId,leadId:lead.id,channel:'whatsapp',revokedAt:{not:null}},
      orderBy:{revokedAt:'desc'},
    });
    if(latestRevoked?.revokedAt&&freshConsent.verifiedAt&&
       latestRevoked.revokedAt.getTime()>=freshConsent.verifiedAt.getTime())throw new FlipVoiceCoreError('WA_CALL_RECIPIENT_OPTOUT');
    const currentOwnerConsent=await validateVoiceOwner(db,{tenantId,profileId:line.profileId,now:current});
    if(currentOwnerConsent!==consentId)throw new FlipVoiceCoreError('WA_CALL_VOICE_REVOKED');
    await reserveBudget(db,{tenantId,periodStart:utcMonthStart(current),micros:amount,
      monthlyCeiling:freshSettings.monthlyLimitMicros});
    const elapsed=freshConsent.outboundCallWindowStart
      ? current.getTime()-freshConsent.outboundCallWindowStart.getTime() : 86400_000;
    const windowStart=elapsed>=86400_000?current:freshConsent.outboundCallWindowStart||current;
    const nextCount=elapsed>=86400_000?1:freshConsent.outboundCallsInWindow+1;
    await db.flipVoiceContactPermission.update({where:{id:freshConsent.id},data:{
      outboundCallWindowStart:windowStart,outboundCallsInWindow:nextCount,
    }});
    const row=await db.flipVoiceCall.create({data:{
      tenantId,profileId:line.profileId,consentId,lineId:line.id,
      leadId:lead.id,contactPermissionId:freshConsent.id,
      channel:'whatsapp',direction:'outbound',status:'held',
      contactHash:numberHash,requestKeyHash,
      reservedUsdMicros:amount,billedUsdMicros:0n,
    },select:{id:true,status:true}});
    return {id:row.id,status:row.status,reused:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15000});

  if(held.reused)return held;
  const started=await prisma.flipVoiceCall.updateMany({
    where:{id:held.id,tenantId,status:'held'},data:{status:'dispatching'},
  });
  if(started.count!==1)return {id:held.id,status:'held_for_review',reused:false};
  try {
    const created=await createTwilioWhatsAppCall({
      accountSid,authToken,senderE164:line.phoneE164,recipientE164:recipient,
      voiceWebhookUrl:voiceUrl,statusWebhookUrl:statusUrl,
    });
    await prisma.flipVoiceCall.updateMany({
      where:{id:held.id,tenantId,status:'dispatching'},
      data:{status:'initiated',providerCallId:created.callSid,startedAt:new Date()},
    });
    return {id:held.id,status:'initiated',reused:false};
  }catch{
    await prisma.flipVoiceCall.updateMany({
      where:{id:held.id,tenantId,status:'dispatching'},
      data:{status:'delivery_unknown'},
    }).catch(()=>undefined);
    return {id:held.id,status:'delivery_unknown',reused:false};
  }
}

/** Request TwiML for an already authorized WhatsApp outbound call ONLY. */
export async function loadWhatsAppOutboundTwiML(input:{
  providerCallSid:string;sender:string;recipient:string;
}):Promise<string>{
  if(disabled()||!/^CA[a-f0-9]{32}$/i.test(input.providerCallSid))return rejected;
  const pepper=process.env.FLIP_VOICE_CONTACT_PEPPER||'';
  const elevenKey=process.env.ELEVENLABS_API_KEY||'';
  if(pepper.length<32||elevenKey.length<16)return rejected;
  const matches=await prisma.flipVoiceCall.findMany({
    where:{providerCallId:input.providerCallSid,channel:'whatsapp',direction:'outbound'},
    select:{id:true,tenantId:true,profileId:true,lineId:true,
      consentId:true,status:true,contactHash:true},take:2,
  });
  if(matches.length!==1)return rejected;
  const call=matches[0],tenantId=call.tenantId;
  if(!call.lineId||!call.contactHash||
      call.contactHash!==hashCallIdentity(tenantId+':'+input.recipient,pepper)||
      !['initiated','delivery_unknown'].includes(call.status))return rejected;
  const [line,settings]=await Promise.all([
    prisma.flipVoiceLine.findFirst({where:{tenantId,id:call.lineId}}),
    prisma.flipVoiceSettings.findUnique({where:{tenantId}}),
  ]);
  if(!line||!settings?.enabled)return rejected;
  try{
    validateWhatsAppChannel(line,tenantId,'outbound');
    if(line.phoneE164!==input.sender)return rejected;
    const currentConsentId=await validateVoiceOwner(prisma,{tenantId,profileId:call.profileId,now:new Date()});
    if(currentConsentId!==call.consentId)return rejected;
    const twiml=await registerElevenTwilioInbound({
      apiKey:elevenKey,agentId:line.providerAgentId,
      fromNumber:input.sender,toNumber:input.recipient,
    });
    if(!/<Connect\b[\s\S]*?<Stream\b/i.test(twiml)||
       /<Dial\b|<Number\b|<Sip\b|<Redirect\b/i.test(twiml))return rejected;
    return twiml;
  }catch{return rejected;}
}

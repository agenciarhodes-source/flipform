import 'server-only';
import { randomBytes } from 'node:crypto';
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
  // Prepared BEFORE Twilio is called so the Voice webhook can identify the held
  // session even when Twilio requests TwiML before returning its CallSid.
  const webhookTicket=randomBytes(24).toString('base64url');
  const outboundWebhookTicketHash=hashCallIdentity(tenantId+':wa-ticket:'+webhookTicket,pepper);
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
      contactHash:numberHash,requestKeyHash,outboundWebhookTicketHash,
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
    const url=new URL(voiceUrl);
    if(url.search||url.hash)throw new FlipVoiceCoreError('WA_CALLBACK_URL_INVALID');
    url.searchParams.set('ticket',webhookTicket);
    const created=await createTwilioWhatsAppCall({
      accountSid,authToken,senderE164:line.phoneE164,recipientE164:recipient,
      voiceWebhookUrl:url.toString(),statusWebhookUrl:statusUrl,
    });
    // The signed webhook might already have claimed the CallSid. Do not
    // overwrite it, reset the state or create a second call.
    await prisma.flipVoiceCall.updateMany({
      where:{id:held.id,tenantId,status:'dispatching',providerCallId:null},
      data:{status:'initiated',providerCallId:created.callSid,startedAt:new Date()},
    });
    return {id:held.id,status:'initiated',reused:false};
  }catch{
    await prisma.flipVoiceCall.updateMany({
      where:{id:held.id,tenantId,status:'dispatching',providerCallId:null},
      data:{status:'delivery_unknown'},
    }).catch(()=>undefined);
    return {id:held.id,status:'delivery_unknown',reused:false};
  }
}

/** Claim a pre-authorized outbound call before Twilio has to know its CallSid. */
export async function loadWhatsAppOutboundTwiML(input:{
  providerCallSid:string;sender:string;recipient:string;ticket:string;
}):Promise<string>{
  if(disabled()||!/^CA[a-f0-9]{32}$/i.test(input.providerCallSid)||
     !/^[A-Za-z0-9_-]{32,64}$/.test(input.ticket))return rejected;
  const pepper=process.env.FLIP_VOICE_CONTACT_PEPPER||'';
  const elevenKey=process.env.ELEVENLABS_API_KEY||'';
  if(pepper.length<32||elevenKey.length<16)return rejected;

  // Derive the tenant from the unique sender, never from a user query param.
  const senderLines=await prisma.flipVoiceLine.findMany({
    where:{phoneE164:input.sender,whatsappRoutingMode:'twilio_voice',
      whatsappOutboundEnabled:true,status:'ready'},
    take:2,
  });
  if(senderLines.length!==1)return rejected;
  const line=senderLines[0],tenantId=line.tenantId;
  const ticketHash=hashCallIdentity(tenantId+':wa-ticket:'+input.ticket,pepper);
  const calls=await prisma.flipVoiceCall.findMany({
    where:{tenantId,outboundWebhookTicketHash:ticketHash,
      channel:'whatsapp',direction:'outbound'},
    select:{
      id:true,tenantId:true,profileId:true,lineId:true,leadId:true,
      contactPermissionId:true,consentId:true,status:true,contactHash:true,
      providerCallId:true,outboundTwiMLClaimedAt:true,
    },
    take:2,
  });
  if(calls.length!==1)return rejected;
  const call=calls[0];
  if(call.lineId!==line.id||!call.leadId||!call.contactPermissionId||
     !call.contactHash||call.outboundTwiMLClaimedAt!==null||
     !['initiated','dispatching'].includes(call.status)||
     (call.providerCallId!==null&&call.providerCallId!==input.providerCallSid)||
     call.contactHash!==hashCallIdentity(tenantId+':'+input.recipient,pepper)){
    return rejected;
  }
  const now=new Date();
  try{
    const [settings,permission,lead,latestRevoked]=await Promise.all([
      prisma.flipVoiceSettings.findUnique({where:{tenantId}}),
      prisma.flipVoiceContactPermission.findFirst({where:{id:call.contactPermissionId,tenantId}}),
      prisma.lead.findFirst({where:{id:call.leadId,tenantId},select:{phone:true}}),
      prisma.flipVoiceContactPermission.findFirst({
        where:{tenantId,leadId:call.leadId,channel:'whatsapp',revokedAt:{not:null}},
        orderBy:{revokedAt:'desc'},
      }),
    ]);
    if(!settings?.enabled||!settings.outboundEnabled||!permission||!lead||
       normalizeBrazilianDialNumber(lead.phone)!==input.recipient||
       !isWhatsAppCallPermitted(permission,tenantId,call.leadId,input.recipient,pepper,now)||
       (latestRevoked?.revokedAt&&permission.verifiedAt&&
         latestRevoked.revokedAt.getTime()>=permission.verifiedAt.getTime())){
      return rejected;
    }
    validateWhatsAppChannel(line,tenantId,'outbound');
    const voiceConsent=await validateVoiceOwner(prisma,{tenantId,profileId:call.profileId,now});
    if(voiceConsent!==call.consentId)return rejected;

    // A unique, atomic claim blocks duplicate/forged TwiML requests. Correlation
    // is based on the ticket committed BEFORE creating the remote Twilio call.
    const claim=await prisma.flipVoiceCall.updateMany({
      where:{id:call.id,tenantId,outboundWebhookTicketHash:ticketHash,
        outboundTwiMLClaimedAt:null,status:{in:['dispatching','initiated']},
        OR:[{providerCallId:null},{providerCallId:input.providerCallSid}]},
      data:{providerCallId:input.providerCallSid,outboundTwiMLClaimedAt:now},
    });
    if(claim.count!==1)return rejected;
    const twiml=await registerElevenTwilioInbound({
      apiKey:elevenKey,agentId:line.providerAgentId,
      fromNumber:input.sender,toNumber:input.recipient,
      direction:'outbound',
    });
    if(!/<Connect\\b[\\s\\S]*?<Stream\\b/i.test(twiml)||
       /<Dial\\b|<Number\\b|<Sip\\b|<Redirect\\b/i.test(twiml))return rejected;
    return twiml;
  }catch{return rejected;}
}

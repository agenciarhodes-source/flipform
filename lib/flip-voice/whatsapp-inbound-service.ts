import 'server-only';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { FlipVoiceCoreError } from './agent-core';
import { hashCallIdentity, utcMonthStart } from './telephony-core';
import { validateVoiceOwner, reserveBudget } from './telephony-service';
import { registerElevenTwilioInbound } from './telephony-provider';
import {
  estimateWhatsAppCallReservationMicros, validateWhatsAppChannel,
} from './whatsapp-calling-policy';

const REJECT='<?xml version="1.0" encoding="UTF-8"?><Response><Reject reason="busy"/></Response>';
const enabled=()=>process.env.FLIP_VOICE_WHATSAPP_ENABLED==='true'
  && process.env.FLIP_VOICE_WHATSAPP_INBOUND_ENABLED==='true'
  && process.env.FLIP_VOICE_WHATSAPP_PROVIDER_VERIFIED==='true';

type InboundResult = {accepted:boolean;twiml:string;callId?:string};

/**
 * Called ONLY after verified Twilio HMAC; the recipient WhatsApp sender
 * selects the tenant. This does not share the ordinary PSTN handler.
 */
export async function registerWhatsAppInbound(input:{
  fromNumber:string;toNumber:string;callSid:string;
}):Promise<InboundResult> {
  const unavailable={accepted:false,twiml:REJECT};
  const pepper=process.env.FLIP_VOICE_CONTACT_PEPPER||'';
  const apiKey=process.env.ELEVENLABS_API_KEY||'';
  if(!enabled()||pepper.length<32||apiKey.length<16 ||
     !/^CA[a-f0-9]{32}$/i.test(input.callSid))return unavailable;
  try {
    const lines=await prisma.flipVoiceLine.findMany({
      where:{phoneE164:input.toNumber,whatsappInboundEnabled:true,
             whatsappRoutingMode:'twilio_voice',status:'ready'},take:2,
    });
    if(lines.length!==1)return unavailable;
    const line=lines[0],tenantId=line.tenantId,now=new Date();
    validateWhatsAppChannel(line,tenantId,'inbound');
    const settings=await prisma.flipVoiceSettings.findUnique({where:{tenantId}});
    if(!settings?.enabled||settings.maxCallSeconds<30||settings.maxCallSeconds>180)return unavailable;
    const micros=estimateWhatsAppCallReservationMicros(settings.maxCallSeconds);
    if(settings.perCallLimitMicros<micros||settings.monthlyLimitMicros<micros)return unavailable;
    const consentId=await validateVoiceOwner(prisma,{tenantId,profileId:line.profileId,now});
    const requestKeyHash=hashCallIdentity(tenantId+':wa-in:'+input.callSid,pepper);
    const contactHash=hashCallIdentity(tenantId+':'+input.fromNumber,pepper);
    const hold=await prisma.$transaction(async db=>{
      const existing=await db.flipVoiceCall.findFirst({
        where:{tenantId,channel:'whatsapp',direction:'inbound',requestKeyHash},
        select:{id:true},
      });
      if(existing)return {id:existing.id,reused:true};
      const [latestLine,latestSettings]=await Promise.all([
        db.flipVoiceLine.findFirst({where:{tenantId,id:line.id}}),
        db.flipVoiceSettings.findUnique({where:{tenantId}}),
      ]);
      if(!latestLine||!latestSettings?.enabled||
         latestSettings.perCallLimitMicros<micros ||
         latestSettings.monthlyLimitMicros<micros)throw new FlipVoiceCoreError('WA_INBOUND_DISABLED');
      validateWhatsAppChannel(latestLine,tenantId,'inbound');
      const currentConsentId=await validateVoiceOwner(db,{tenantId,profileId:line.profileId,now:new Date()});
      if(currentConsentId!==consentId)throw new FlipVoiceCoreError('WA_VOICE_CONSENT_CHANGED');
      await reserveBudget(db,{tenantId,periodStart:utcMonthStart(now),
        micros,monthlyCeiling:latestSettings.monthlyLimitMicros});
      const created=await db.flipVoiceCall.create({data:{
        tenantId,profileId:line.profileId,consentId,lineId:line.id,
        channel:'whatsapp',direction:'inbound',status:'held',
        requestKeyHash,contactHash,providerCallId:input.callSid,
        reservedUsdMicros:micros,billedUsdMicros:0n,
      },select:{id:true}});
      return {id:created.id,reused:false};
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:15_000});
    if(hold.reused)return unavailable;
    const started=await prisma.flipVoiceCall.updateMany({
      where:{tenantId,id:hold.id,status:'held'},data:{status:'dispatching'},
    });
    if(started.count!==1)return unavailable;
    try{
      const twiml=await registerElevenTwilioInbound({
        apiKey,agentId:line.providerAgentId,
        fromNumber:input.fromNumber,toNumber:input.toNumber,
      });
      // WhatsApp must never be bridged to a telephone number.
      if(!/<Connect\b[\s\S]*?<Stream\b/i.test(twiml) ||
         /<Dial\b|<Number\b|<Sip\b|<Redirect\b/i.test(twiml)){
        throw new FlipVoiceCoreError('WA_TWIML_NOT_VOIP_ONLY');
      }
      await prisma.flipVoiceCall.updateMany({
        where:{tenantId,id:hold.id,status:'dispatching'},
        data:{status:'initiated',startedAt:new Date()},
      });
      return {accepted:true,twiml,callId:hold.id};
    }catch{
      await prisma.flipVoiceCall.updateMany({
        where:{tenantId,id:hold.id,status:'dispatching'},data:{status:'delivery_unknown'},
      }).catch(()=>undefined);
      return unavailable;
    }
  }catch{return unavailable;}
}

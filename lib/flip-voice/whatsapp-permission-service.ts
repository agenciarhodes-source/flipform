import 'server-only';
import { Prisma } from '@prisma/client';
import type { SessionPayload } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { FlipVoiceCoreError } from './agent-core';
import { allowedBrazilBusinessHours, hashCallIdentity, normalizeBrazilianDialNumber } from './telephony-core';
import { validateWhatsAppChannel, whatsappPermissionRequestQuotaAllows } from './whatsapp-calling-policy';
import { requestTwilioWhatsAppCallPermission } from './whatsapp-twilio-provider';

const guid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function deny(code:string):never{throw new FlipVoiceCoreError(code);}
const permissionRequestsEnabled=()=>
  process.env.FLIP_VOICE_WHATSAPP_ENABLED==='true' &&
  process.env.FLIP_VOICE_WHATSAPP_PERMISSION_REQUESTS_ENABLED==='true' &&
  process.env.FLIP_VOICE_WHATSAPP_PROVIDER_VERIFIED==='true';

/**
 * A single explicit human-triggered permission request. Not a bulk marketing
 * campaign, and never proof that the recipient accepted the future call.
 *
 * A call to the provider is *not* performed inside the DB transaction. A
 * network timeout remains an unresolved request; it is not retried silently.
 */
export async function initiateWhatsAppCallPermissionRequest(
  session:SessionPayload,
  input:{leadId:string;lineId:string;idempotencyKey:string},
):Promise<{requestId:string;status:'requesting'|'sent'|'delivery_unknown';reused:boolean}>{
  if(!session.tenantId||!['owner','admin'].includes(session.role))deny('WA_PERMISSION_FORBIDDEN');
  if(!permissionRequestsEnabled())deny('WA_PERMISSION_REQUESTS_DISABLED');
  if(!guid.test(input.leadId)||!guid.test(input.lineId)||!guid.test(input.idempotencyKey))deny('WA_PERMISSION_INVALID_REQUEST');
  if(!allowedBrazilBusinessHours(new Date()))deny('WA_PERMISSION_OUTSIDE_HOURS');
  const pepper=process.env.FLIP_VOICE_CONTACT_PEPPER||'';
  const accountSid=process.env.TWILIO_ACCOUNT_SID||'';
  const authToken=process.env.TWILIO_AUTH_TOKEN||'';
  const contentSid=process.env.FLIP_VOICE_WHATSAPP_PERMISSION_TEMPLATE_SID||'';
  if(pepper.length<32||!/^AC[a-f0-9]{32}$/i.test(accountSid)||
     authToken.length<16||!/^HX[a-f0-9]{32}$/i.test(contentSid))deny('WA_PERMISSION_PROVIDER_NOT_READY');
  const tenantId=session.tenantId;
  const [settings,line,lead]=await Promise.all([
    prisma.flipVoiceSettings.findUnique({where:{tenantId}}),
    prisma.flipVoiceLine.findFirst({where:{tenantId,id:input.lineId}}),
    prisma.lead.findFirst({where:{tenantId,id:input.leadId},select:{id:true,phone:true}}),
  ]);
  if(!settings?.enabled||!settings.outboundEnabled||!line||!lead)deny('WA_PERMISSION_NOT_CONFIGURED');
  validateWhatsAppChannel(line,tenantId,'outbound');
  const to=normalizeBrazilianDialNumber(lead.phone);
  const phoneHash=hashCallIdentity(tenantId+':'+to,pepper);
  const requestHash=hashCallIdentity(tenantId+':wa-permission-request:'+input.idempotencyKey,pepper);
  const now=new Date();
  const held=await prisma.$transaction(async db=>{
    // Prevent parallel manual requests bypassing the Meta 1/day and 2/week limits.
    await db.$queryRaw(Prisma.sql`
      SELECT pg_advisory_xact_lock(hashtext(${tenantId}),hashtext(${lead.id}))
    `);
    const earlier=await db.flipVoiceContactPermission.findFirst({
      where:{tenantId,leadId:lead.id,channel:'whatsapp',evidenceSha256:requestHash},
      select:{id:true,providerPermissionRequestSid:true},
    });
    if(earlier)return {id:earlier.id,reused:true,sent:Boolean(earlier.providerPermissionRequestSid)};
    const freshLine=await db.flipVoiceLine.findFirst({where:{tenantId,id:line.id}});
    const freshSettings=await db.flipVoiceSettings.findUnique({where:{tenantId}});
    const freshLead=await db.lead.findFirst({where:{tenantId,id:lead.id},select:{phone:true}});
    if(!freshLine||!freshSettings?.enabled||!freshSettings.outboundEnabled||
       !freshLead||normalizeBrazilianDialNumber(freshLead.phone)!==to)deny('WA_PERMISSION_STATE_CHANGED');
    validateWhatsAppChannel(freshLine,tenantId,'outbound');
    const revoked=await db.flipVoiceContactPermission.findFirst({
      where:{tenantId,leadId:lead.id,channel:'whatsapp',revokedAt:{not:null}},
      select:{id:true},
    });
    if(revoked)deny('WA_PERMISSION_PREVIOUSLY_REVOKED');
    const lastWeek=new Date(now.getTime()-7*86400_000);
    const attempts=await db.flipVoiceContactPermission.findMany({
      where:{tenantId,leadId:lead.id,channel:'whatsapp',phoneHash,
        createdAt:{gte:lastWeek}},
      select:{createdAt:true},
    });
    if(!whatsappPermissionRequestQuotaAllows(attempts.map(x=>x.createdAt),now))
      deny('WA_PERMISSION_RATE_LIMIT');
    // Supersede older unresolved requests without recording a customer opt-out.
    await db.flipVoiceContactPermission.updateMany({
      where:{tenantId,leadId:lead.id,channel:'whatsapp',phoneHash,
        status:'pending',expiresAt:{gt:now}},
      data:{expiresAt:now},
    });
    const record=await db.flipVoiceContactPermission.create({
      data:{
        tenantId,leadId:lead.id,channel:'whatsapp',
        phoneHash,purpose:'requested_follow_up',
        evidenceSha256:requestHash,status:'pending',
        expiresAt:new Date(now.getTime()+7*86400_000),
      },
      select:{id:true},
    });
    return {id:record.id,reused:false,sent:false};
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:12000});
  if(held.reused)return {requestId:held.id,status:held.sent?'sent':'delivery_unknown',reused:true};
  try{
    const sent=await requestTwilioWhatsAppCallPermission({
      accountSid,authToken,contentSid,
      senderE164:line.phoneE164,recipientE164:to,
    });
    const saved=await prisma.flipVoiceContactPermission.updateMany({
      where:{tenantId,id:held.id,status:'pending',providerPermissionRequestSid:null},
      data:{providerPermissionRequestSid:sent.messageSid},
    });
    return {requestId:held.id,status:saved.count===1?'sent':'delivery_unknown',reused:false};
  }catch{
    // A provider timeout may have delivered a request already. Never auto-retry.
    return {requestId:held.id,status:'delivery_unknown',reused:false};
  }
}

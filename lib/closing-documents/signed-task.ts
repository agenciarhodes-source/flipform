import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { tenantHasFeature } from '@/lib/billing/tenant-features';
import { activeFeatureGrant } from '@/lib/billing/tenant-feature-rules';
import { expectedClosingDocs, type ClosingReturnMode } from './signed-rules';
import { approvedClosingStatus, GOJUS_TASK_TITLE, pickClosingAssignee } from './signed-review-rules';
import { readSignedClosingState } from './signed-review';

type Identity={tenantId:string;conversationId:string;leadId?:string};
async function lockConversation(tx:Prisma.TransactionClient,input:Identity) {
  // Serialize completion and format approvals per conversation. No schema change is needed.
  const rows=await tx.$queryRaw<Array<{id:string}>>`SELECT id FROM conversations WHERE id = ${input.conversationId} AND tenant_id = ${input.tenantId} AND channel = 'whatsapp' FOR UPDATE`;
  if(!rows.length)return false;
  const now=new Date();
  const grants=await tx.tenantEntitlementGrant.findMany({where:{tenantId:input.tenantId,feature:'closing_signed_check',enabled:true,revokedAt:null,startsAt:{lte:now},expiresAt:{gt:now}},select:{enabled:true,revokedAt:true,startsAt:true,expiresAt:true,approvedBy:true,reason:true}});
  return grants.some(g=>activeFeatureGrant(g,new Date()));
}
async function createTaskLocked(tx:Prisma.TransactionClient,input:Identity) {
  const state=await readSignedClosingState(tx,input.tenantId,input.conversationId);
  if(!state)return {created:false,reason:'no_manifest'} as const;
  if(state.taskCreated)return {created:false,reason:'already_created'} as const;
  const status=approvedClosingStatus(state.sent.manifest,state.received,state.mode);
  if(!status.modeApproved || !status.complete)return {created:false,reason:'pending'} as const;
  const conversation=await tx.conversation.findFirst({where:{id:input.conversationId,tenantId:input.tenantId,channel:'whatsapp'},select:{leadId:true,assignedTo:true}});
  if(!conversation?.leadId || (input.leadId && conversation.leadId!==input.leadId))return {created:false,reason:'no_lead'} as const;
  const lead=await tx.lead.findFirst({where:{id:conversation.leadId,tenantId:input.tenantId},select:{id:true,assignedTo:true}});
  if(!lead)return {created:false,reason:'no_lead'} as const;
  const members=await tx.tenantUser.findMany({where:{tenantId:input.tenantId},select:{userId:true,role:true,status:true}});
  const assignedTo=pickClosingAssignee({leadAssignee:lead.assignedTo,conversationAssignee:conversation.assignedTo,members});
  if(!assignedTo)return {created:false,reason:'no_assignee'} as const;
  const files=status.items.flatMap(item=>item.messageId?[item.messageId]:[]);
  if(files.length!==status.items.length || new Set(files).size!==files.length)return {created:false,reason:'pending'} as const;
  const appUrl=(process.env.NEXT_PUBLIC_APP_URL||'https://app.flipform.com.br').replace(/\/$/,'');
  const task=await tx.task.create({data:{tenantId:input.tenantId,leadId:lead.id,assignedTo,createdBy:null,title:GOJUS_TASK_TITLE,
    description:['Conferência visual preliminar. Abra os arquivos e confirme assinaturas, preenchimento, integralidade e validade antes de lançar. Se houve reenvio, confira a versão mais recente.','Não lançar se houver pendências.',`Conversa: ${appUrl}/inbox?conversationId=${encodeURIComponent(input.conversationId)}`,`Lead: ${appUrl}/leads?leadId=${encodeURIComponent(lead.id)}`].join('\n\n'),
    priority:'high',dueDate:new Date(Date.now()+5*60_000),remindMinutesBefore:5},select:{id:true}});
  await tx.auditLog.create({data:{tenantId:input.tenantId,entityType:'conversation',entityId:input.conversationId,userId:null,action:'closing_documents.all_signed',metadata:{files,taskId:task.id,sentId:state.sent.sentId,urgent:true}}});
  return {created:true,reason:'created'} as const;
}
export async function ensureSignedClosingTask(input:Identity) {
  if(!await tenantHasFeature(input.tenantId,'closing_signed_check'))return {created:false,reason:'disabled'} as const;
  return prisma.$transaction(async tx=>{
    if(!await lockConversation(tx,input))return {created:false,reason:'disabled'} as const;
    return createTaskLocked(tx,input);
  });
}
export async function approveSignedReturnMode(input:Identity&{leadId:string;userId:string;sentId:string;mode:ClosingReturnMode}) {
  if(!await tenantHasFeature(input.tenantId,'closing_signed_check'))return {ok:false,reason:'disabled'} as const;
  return prisma.$transaction(async tx=>{
    if(!await lockConversation(tx,input))return {ok:false,reason:'disabled'} as const;
    const [owner,conversation]=await Promise.all([
      tx.tenantUser.findFirst({where:{tenantId:input.tenantId,userId:input.userId,role:'owner',status:'active'},select:{id:true}}),
      tx.conversation.findFirst({where:{tenantId:input.tenantId,id:input.conversationId,leadId:input.leadId},select:{id:true}}),
    ]);
    if(!owner||!conversation)return {ok:false,reason:'forbidden'} as const;
    const state=await readSignedClosingState(tx,input.tenantId,input.conversationId);
    if(!state||state.sent.sentId!==input.sentId||state.taskCreated)return {ok:false,reason:'stale'} as const;
    if(!expectedClosingDocs(state.sent.manifest.templates,state.sent.manifest.situation,input.mode,state.sent.manifest.sendComplete).length)return {ok:false,reason:'incompatible'} as const;
    if(state.mode!==input.mode)await tx.auditLog.create({data:{tenantId:input.tenantId,userId:input.userId,entityType:'conversation',entityId:input.conversationId,action:'closing_documents.return_mode_approved',metadata:{sentId:input.sentId,mode:input.mode}}});
    const task=await createTaskLocked(tx,input);
    return {ok:true,task} as const;
  });
}

import 'server-only';
import { prisma } from '@/lib/prisma';
import type { Prisma } from '@prisma/client';
import { tenantHasFeature } from '@/lib/billing/tenant-features';
import { parseClosingManifest, preliminaryClosingStatus, approvedReturnMode, approvedClosingStatus, approvedSignedInstruction } from './signed-review-rules';
import type { SignedDocument } from './signed-rules';

export async function signedClosingManifest(tenantId: string, conversationId: string) {
  if (!await tenantHasFeature(tenantId,'closing_signed_check')) return null;
  return readClosingManifest(prisma,tenantId,conversationId);
}
export async function readClosingManifest(db:Prisma.TransactionClient,tenantId:string,conversationId:string) {
  const conversation = await db.conversation.findFirst({where:{id:conversationId,tenantId,channel:'whatsapp'},select:{id:true}});
  if(!conversation) return null;
  const audit=await db.auditLog.findFirst({where:{tenantId,entityType:'conversation',entityId:conversationId,action:'closing_documents.sent'},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{id:true,createdAt:true,metadata:true}});
  if(!audit) return null;
  const manifest=parseClosingManifest(audit.metadata);
  return manifest ? {sentId:audit.id,sentAt:audit.createdAt,manifest} : null;
}
export async function signedClosingReview(tenantId:string,conversationId:string) {
  if (!await tenantHasFeature(tenantId,'closing_signed_check')) return null;
  const state=await readSignedClosingState(prisma,tenantId,conversationId);
  if(!state)return null;
  const {sent,received,mode,taskCreated}=state;
  const approved=approvedClosingStatus(sent.manifest,received,mode);
  const status=approved.modeApproved?approved:preliminaryClosingStatus(sent.manifest,received);
  return {sentId:sent.sentId,sentAt:sent.sentAt.toISOString(),...status,mode,modeApproved:approved.modeApproved,taskCreated,instruction:approvedSignedInstruction(sent.manifest,received,mode)};
}
export async function readSignedClosingState(db:Prisma.TransactionClient,tenantId:string,conversationId:string) {
  const sent=await readClosingManifest(db,tenantId,conversationId);
  if(!sent)return null;
  const docs=await db.leadDocument.findMany({where:{tenantId,conversationId,checklistId:null,itemKey:{startsWith:'closing:'}},select:{itemKey:true,messageId:true,status:true,note:true}});
  const messages=await db.message.findMany({where:{tenantId,conversationId,direction:'inbound',id:{in:docs.map(d=>d.messageId)},createdAt:{gte:sent.sentAt}},select:{id:true,createdAt:true}});
  const time=new Map(messages.map(m=>[m.id,m.createdAt]));
  const received: SignedDocument[]=docs.flatMap(d=>{
    const createdAt=time.get(d.messageId);
    if(!createdAt || !d.itemKey || (d.status!=='received'&&d.status!=='problem'&&d.status!=='unreadable'))return [];
    return [{itemKey:d.itemKey,messageId:d.messageId,status:d.status,note:d.note,createdAt}];
  });
  const [approval,completion]=await Promise.all([
    db.auditLog.findFirst({where:{tenantId,entityType:'conversation',entityId:conversationId,action:'closing_documents.return_mode_approved'},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{metadata:true}}),
    db.auditLog.findFirst({where:{tenantId,entityType:'conversation',entityId:conversationId,action:'closing_documents.all_signed'},select:{id:true}}),
  ]);
  return {sent,received,mode:approvedReturnMode(approval?.metadata,sent.sentId),taskCreated:!!completion};
}

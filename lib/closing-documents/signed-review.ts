import 'server-only';
import { prisma } from '@/lib/prisma';
import { tenantHasFeature } from '@/lib/billing/tenant-features';
import { parseClosingManifest, preliminaryClosingStatus, signedReviewInstruction } from './signed-review-rules';
import type { SignedDocument } from './signed-rules';

export async function signedClosingManifest(tenantId: string, conversationId: string) {
  if (!await tenantHasFeature(tenantId,'closing_signed_check')) return null;
  const conversation = await prisma.conversation.findFirst({where:{id:conversationId,tenantId,channel:'whatsapp'},select:{id:true}});
  if(!conversation) return null;
  const audit=await prisma.auditLog.findFirst({where:{tenantId,entityType:'conversation',entityId:conversationId,action:'closing_documents.sent'},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{createdAt:true,metadata:true}});
  if(!audit) return null;
  const manifest=parseClosingManifest(audit.metadata);
  return manifest ? {sentAt:audit.createdAt,manifest} : null;
}
export async function signedClosingReview(tenantId:string,conversationId:string) {
  const sent=await signedClosingManifest(tenantId,conversationId);
  if(!sent)return null;
  const docs=await prisma.leadDocument.findMany({where:{tenantId,conversationId,checklistId:null,itemKey:{startsWith:'closing:'}},select:{itemKey:true,messageId:true,status:true,note:true}});
  const messages=await prisma.message.findMany({where:{tenantId,conversationId,direction:'inbound',id:{in:docs.map(d=>d.messageId)},createdAt:{gte:sent.sentAt}},select:{id:true,createdAt:true}});
  const time=new Map(messages.map(m=>[m.id,m.createdAt]));
  const received: SignedDocument[]=docs.flatMap(d=>{
    const createdAt=time.get(d.messageId);
    if(!createdAt || !d.itemKey || (d.status!=='received'&&d.status!=='problem'&&d.status!=='unreadable'))return [];
    return [{itemKey:d.itemKey,messageId:d.messageId,status:d.status,note:d.note,createdAt}];
  });
  return {sentAt:sent.sentAt.toISOString(),...preliminaryClosingStatus(sent.manifest,received),instruction:signedReviewInstruction(sent.manifest,received)};
}

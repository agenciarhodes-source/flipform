import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, canEditLead } from '@/lib/rbac-server';
import { getLeadScopeForRole } from '@/lib/rbac';
import { tenantHasFeature } from '@/lib/billing/tenant-features';
import { leadCpfSummary } from '@/lib/leads/cpf';
import { signedClosingReview } from '@/lib/closing-documents/signed-review';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
const headers = { 'Cache-Control': 'private, no-store' };
const json=(data:object,status=200)=>NextResponse.json(data,{status,headers});

export const GET=withPermission('LEADS_VIEW',async(_req,session,ctx:{params:{id:string}})=>{
  if(!await tenantHasFeature(session.tenantId,'gojus_sheet'))return json({error:'Recurso não disponível.'},403);
  try {
    const lead=await prisma.lead.findFirst({where:{...getLeadScopeForRole(session),id:ctx.params.id,tenantId:session.tenantId},select:{id:true,assignedTo:true,name:true,phone:true,state:true,city:true}});
    if(!lead)return json({error:'Lead não encontrado.'},404);
    if(!canEditLead(session.role,lead,session.userId))return json({error:'Sem permissão.'},403);
    const [cpf,conversations]=await Promise.all([
      leadCpfSummary(session.tenantId,lead.id),
      prisma.conversation.findMany({where:{tenantId:session.tenantId,leadId:lead.id,channel:'whatsapp'},select:{id:true,externalContactIdentity:{select:{tenantId:true,phone:true}}},take:30,orderBy:{updatedAt:'desc'}}),
    ]);
    const cases=await Promise.all(conversations.map(async c=>{
      const [choice,review]=await Promise.all([
        prisma.conversationDocumentCase.findFirst({where:{tenantId:session.tenantId,conversationId:c.id},select:{checklistId:true}}),
        signedClosingReview(session.tenantId,c.id),
      ]);
      const checklist=choice?await prisma.documentChecklist.findFirst({where:{tenantId:session.tenantId,id:choice.checklistId},select:{name:true}}):null;
      return {conversationId:c.id,whatsapp:c.externalContactIdentity.tenantId===session.tenantId?c.externalContactIdentity.phone:null,caseLabel:checklist?.name??null,contractsComplete:review?.complete===true,contracts:review?.items.map(i=>({name:i.name,status:i.status}))??[]};
    }));
    return json({enabled:true,ready:false,lead:{name:lead.name,phone:lead.phone,state:lead.state,city:lead.city,cpfMasked:cpf.masked,hasCpf:cpf.hasCpf},cases});
  }catch{return json({error:'Ficha indisponível.'},503);}
});

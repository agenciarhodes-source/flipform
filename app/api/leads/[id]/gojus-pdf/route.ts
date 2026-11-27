import {NextResponse} from 'next/server';
import {prisma} from '@/lib/prisma';
import {withPermission,canEditLead} from '@/lib/rbac-server';
import {getLeadScopeForRole} from '@/lib/rbac';
import {tenantHasFeature} from '@/lib/billing/tenant-features';
import {rateLimit} from '@/lib/rate-limit';
import {generateGoJusPdf,GoJusBundleError} from '@/lib/gojus/bundle-service';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=120;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(error:string,status:number)=>NextResponse.json({error},{status,headers});
export const POST=withPermission('LEADS_VIEW',async(req,session,ctx:{params:{id:string}})=>{
  if(!await tenantHasFeature(session.tenantId,'gojus_sheet'))return json('Recurso não disponível.',403);
  const lead=await prisma.lead.findFirst({where:{...getLeadScopeForRole(session),id:ctx.params.id,tenantId:session.tenantId},select:{id:true,assignedTo:true}});
  if(!lead||!canEditLead(session.role,lead,session.userId))return json('Sem permissão.',403);
  const origin=req.headers.get('origin');
  if(origin!==null&&origin!==req.nextUrl.origin)return json('Origem não permitida.',403);
  if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return json('Requisição inválida.',400);
  const body=await req.json().catch(()=>null);
  if(typeof body?.conversationId!=='string'||!/^[-A-Za-z0-9_]{1,100}$/.test(body.conversationId)||body.confirmed!==true)return json('Confirme a revisão dos documentos e selecione o caso.',400);
  const limit=await rateLimit({key:`gojus-pdf:${session.tenantId}`,limit:4,windowMs:60_000});
  if(!limit.allowed)return json('Muitas solicitações. Tente novamente depois.',429);
  try{
    const result=await generateGoJusPdf({tenantId:session.tenantId,leadId:lead.id,conversationId:body.conversationId},req.headers.get('x-vercel-oidc-token'));
    if(!await tenantHasFeature(session.tenantId,'gojus_sheet'))return json('Recurso não disponível.',403);
    const current=await prisma.lead.findFirst({where:{...getLeadScopeForRole(session),id:lead.id,tenantId:session.tenantId},select:{id:true,assignedTo:true}});
    if(!current||!canEditLead(session.role,current,session.userId))return json('Sem permissão.',403);
    await prisma.auditLog.create({data:{tenantId:session.tenantId,userId:session.userId,entityType:'lead',entityId:lead.id,action:'gojus.pdf_generated',metadata:{fileCount:result.count,outputSha256:result.hash}}});
    return NextResponse.json({downloadUrl:result.url},{headers});
  }catch(error){
    if(error instanceof GoJusBundleError){
      if(error.code==='too_large')return json('Documentação acima do limite de geração ou download. Revise manualmente.',413);
      if(error.code==='disabled')return json('Recurso não disponível.',403);
      if(error.code==='incomplete'||error.code==='changed')return json('Documentos pendentes, ambíguos ou alterados. Revise o caso antes de gerar.',409);
    }
    return json('Gerador de PDF indisponível.',503);
  }
});

import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { tenantHasFeature } from '@/lib/billing/tenant-features';
import { approveSignedReturnMode } from '@/lib/closing-documents/signed-task';
export const dynamic='force-dynamic';
export const runtime='nodejs';
function json(body:object,status=200){return NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});}
export const PUT=withPermission('LEADS_VIEW',async(req,session,ctx:{params:{id:string}})=>{
  if(!await tenantHasFeature(session.tenantId,'closing_signed_check'))return json({error:'Recurso não disponível para esta empresa.'},403);
  if(session.role!=='owner')return json({error:'Somente o dono da empresa pode confirmar o formato.'},403);
  const body=await req.json().catch(()=>null);
  if(!body||typeof body.conversationId!=='string'||body.conversationId.length>100||typeof body.sentId!=='string'||body.sentId.length>100||!['separate','package'].includes(body.mode))return json({error:'Formato inválido.'},400);
  try {
    const result=await approveSignedReturnMode({tenantId:session.tenantId,leadId:ctx.params.id,userId:session.userId,conversationId:body.conversationId,sentId:body.sentId,mode:body.mode});
    if(!result.ok)return json({error:result.reason==='incompatible'?'Formato incompatível com os modelos enviados. Confira os documentos manualmente.':'Não foi possível confirmar este envio.'},result.reason==='forbidden'||result.reason==='disabled'?403:409);
    return json({ok:true,taskCreated:result.task.created||result.task.reason==='already_created'});
  }catch{return json({error:'Conferência indisponível.'},503);}
});

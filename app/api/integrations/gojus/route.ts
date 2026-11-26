import {NextResponse} from 'next/server';
import {withPermission} from '@/lib/rbac-server';
import {tenantHasFeature} from '@/lib/billing/tenant-features';
import {rateLimit} from '@/lib/rate-limit';
import {gojusLoginStatus,saveGoJusLogin,removeGoJusLogin,testGoJusLogin} from '@/lib/gojus/login-vault';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const json=(data:object,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store'}});
export const GET=withPermission('INTEGRATIONS_VIEW',async(_req,session)=>{
  if(session.role!=='developer'||!await tenantHasFeature(session.tenantId,'gojus_robot'))return json({error:'Recurso não disponível.'},403);
  try{return json(await gojusLoginStatus(session));}catch{return json({error:'Configuração indisponível.'},503);}
});
export const POST=withPermission('INTEGRATIONS_EDIT',async(req,session)=>{
  if(session.role!=='developer'||!await tenantHasFeature(session.tenantId,'gojus_robot'))return json({error:'Recurso não disponível.'},403);
  if(req.headers.get('origin')!==req.nextUrl.origin||req.headers.get('content-type')?.split(';')[0]!=='application/json')return json({error:'Requisição inválida.'},403);
  const length=Number(req.headers.get('content-length')||0);
  if(length>8192)return json({error:'Requisição inválida.'},400);
  const raw=await req.text().catch(()=>null);
  if(!raw||raw.length>8192)return json({error:'Requisição inválida.'},400);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'Requisição inválida.'},400);}
  if(!['save','test','remove'].includes(body?.action))return json({error:'Requisição inválida.'},400);
  const limit=await rateLimit({key:'gojus-login:'+session.tenantId,limit:3,windowMs:60_000});
  if(!limit.allowed)return json({error:'Muitas tentativas. Tente novamente depois.'},429);
  try{
    if(body.action==='save')await saveGoJusLogin(session,body);
    else if(body.action==='remove')await removeGoJusLogin(session);
    else await testGoJusLogin(session);
    return json(await gojusLoginStatus(session));
  }catch{return json({error:'Operação indisponível ou dados inválidos. Confira a configuração.'},503);}
});

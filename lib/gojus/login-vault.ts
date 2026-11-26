import 'server-only';
import {createHash} from 'node:crypto';
import {Prisma} from '@prisma/client';
import {prisma} from '@/lib/prisma';
import {tenantHasFeature} from '@/lib/billing/tenant-features';
import {currentVaultKey,sealCredential,openCredential} from '@/lib/universal-connectors/vault';
import {GOJUS_PROVIDER,GOJUS_AUTH_METHOD,exactHttpsUrl,validatedLogin,LOGIN_RESULTS,type GoJusLogin,type LoginResult} from './login-rules';

type Actor={tenantId:string;userId:string;role:string};
const serializable={isolationLevel:Prisma.TransactionIsolationLevel.Serializable} as const;
function config(){
  if(process.env.GOJUS_LOGIN_CONFIG_ENABLED!=='1')return null;
  const url=exactHttpsUrl(process.env.GOJUS_LOGIN_URL);
  if(!url)return null;
  try{currentVaultKey();return {url};}catch{return null;}
}
function worker(){
  if(process.env.GOJUS_LOGIN_TEST_ENABLED!=='1')return null;
  const url=exactHttpsUrl(process.env.GOJUS_LOGIN_WORKER_URL);
  const token=process.env.GOJUS_LOGIN_WORKER_TOKEN||'';
  return url&&new URL(url).pathname==='/v1/login-test'&&token.length>=32?{url,token}:null;
}
async function assertAccess(actor:Actor){
  if(actor.role!=='developer'||!actor.userId||!await tenantHasFeature(actor.tenantId,'gojus_robot'))throw new Error('Unavailable');
}
function where(actor:Actor){
  return {tenantId:actor.tenantId,providerId:GOJUS_PROVIDER,authMethod:GOJUS_AUTH_METHOD,revokedAt:null,enabled:false};
}
function binding(actor:Actor,id:string){return {tenantId:actor.tenantId,connectionId:id,providerId:GOJUS_PROVIDER};}
function version(ciphertext:string){return createHash('sha256').update(ciphertext).digest('hex');}
async function current(actor:Actor){
  const rows=await prisma.universalConnection.findMany({where:where(actor),select:{id:true,credential:{select:{keyId:true,ciphertext:true,updatedAt:true}}},take:2});
  if(rows.length>1)throw new Error('Unavailable');
  return rows[0]||null;
}
export async function gojusLoginStatus(actor:Actor){
  await assertAccess(actor);
  const cfg=config();
  const row=await current(actor);
  const credential=row?.credential;
  let status:'not_configured'|'saved'|LoginResult=credential?'saved':'not_configured';
  let testedAt:string|null=null;
  if(row&&credential){
    const prefix='gojus.login.';const suffix=':'+version(credential.ciphertext);
    const last=await prisma.universalConnectionAudit.findFirst({where:{tenantId:actor.tenantId,connectionId:row.id,action:{in:LOGIN_RESULTS.map(r=>prefix+r+suffix)}},orderBy:[{createdAt:'desc'},{id:'desc'}],select:{action:true,createdAt:true}});
    if(last){status=last.action.slice(prefix.length,-suffix.length) as LoginResult;testedAt=last.createdAt.toISOString();}
  }
  return {available:!!cfg,testAvailable:!!cfg&&!!worker(),url:cfg?.url||'',saved:!!credential,status,testedAt};
}
export async function saveGoJusLogin(actor:Actor,input:unknown){
  await assertAccess(actor);
  const cfg=config();const login=cfg?validatedLogin(input,cfg.url):null;
  if(!login)throw new Error('Unavailable');
  await prisma.$transaction(async tx=>{
    const rows=await tx.universalConnection.findMany({where:where(actor),select:{id:true},take:2});
    if(rows.length>1)throw new Error('Unavailable');
    const row=rows[0]||await tx.universalConnection.create({data:{tenantId:actor.tenantId,providerId:GOJUS_PROVIDER,authMethod:GOJUS_AUTH_METHOD,enabled:false},select:{id:true}});
    const encrypted=sealCredential(JSON.stringify(login),binding(actor,row.id),currentVaultKey());
    await tx.universalConnectionCredential.upsert({where:{tenantId_connectionId:{tenantId:actor.tenantId,connectionId:row.id}},create:{tenantId:actor.tenantId,connectionId:row.id,...encrypted},update:encrypted});
    await tx.universalConnectionAudit.create({data:{tenantId:actor.tenantId,connectionId:row.id,actorUserId:actor.userId,action:'gojus.credential.saved'}});
  },serializable);
}
export async function removeGoJusLogin(actor:Actor){
  await assertAccess(actor);
  await prisma.$transaction(async tx=>{
    const rows=await tx.universalConnection.findMany({where:where(actor),select:{id:true},take:2});
    if(rows.length!==1)throw new Error('Unavailable');
    const id=rows[0].id;
    const changed=await tx.universalConnection.updateMany({where:{...where(actor),id},data:{revokedAt:new Date(),enabled:false}});
    if(changed.count!==1)throw new Error('Unavailable');
    await tx.universalConnectionCredential.deleteMany({where:{tenantId:actor.tenantId,connectionId:id}});
    await tx.universalConnectionAudit.create({data:{tenantId:actor.tenantId,connectionId:id,actorUserId:actor.userId,action:'gojus.credential.revoked'}});
  },serializable);
}
export async function testGoJusLogin(actor:Actor):Promise<LoginResult>{
  await assertAccess(actor);
  const cfg=config();const w=worker();const row=await current(actor);
  if(!cfg||!w||!row?.credential)throw new Error('Unavailable');
  const envelope=row.credential;
  const login=validatedLogin(JSON.parse(openCredential(envelope,binding(actor,row.id),currentVaultKey())),cfg.url);
  if(!login)throw new Error('Unavailable');
  let result:LoginResult='unavailable';
  try{
    const res=await fetch(w.url,{method:'POST',headers:{'Authorization':'Bearer '+w.token,'Content-Type':'application/json'},body:JSON.stringify(login satisfies GoJusLogin),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(50_000)});
    // Only the small fixed status response is accepted; never forward worker text.
    if(res.ok&&res.headers.get('content-type')==='application/json'&&Number(res.headers.get('content-length'))>0&&Number(res.headers.get('content-length'))<=128){
      const data=await res.json();
      if(LOGIN_RESULTS.includes(data?.result))result=data.result;
    }
  }catch{/* controlled status */}
  await assertAccess(actor);
  await prisma.$transaction(async tx=>{
    const same=await tx.universalConnection.findFirst({where:{...where(actor),id:row.id,credential:{is:{ciphertext:envelope.ciphertext,keyId:envelope.keyId}}},select:{id:true}});
    if(!same)throw new Error('Unavailable');
    await tx.universalConnectionAudit.create({data:{tenantId:actor.tenantId,connectionId:row.id,actorUserId:actor.userId,action:'gojus.login.'+result+':'+version(envelope.ciphertext)}});
  },serializable);
  return result;
}

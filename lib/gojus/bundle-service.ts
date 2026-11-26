import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import {tenantHasFeature} from '@/lib/billing/tenant-features';
import {signedClosingReview} from '@/lib/closing-documents/signed-review';
import {createAttachmentDownloadUrl,deleteAttachmentObject,presignS3Url,resolveAttachmentStorage,type AttachmentStorageConfig} from '@/lib/storage/attachment-storage';
import {planGoJusBundle,type BundleFile} from './pre-registration-rules';
import {selectLatestCaseFiles,GOJUS_OUTPUT_LIMIT,GOJUS_INPUT_LIMIT} from './bundle-selection';

type Identity={tenantId:string;leadId:string;conversationId:string};
export class GoJusBundleError extends Error{
  constructor(public readonly code:'disabled'|'incomplete'|'unavailable'|'too_large'|'changed'){super(code);}
}
function workerConfig(){
  if(process.env.GOJUS_PDF_WORKER_ENABLED!=='1'||process.env.GOJUS_PDF_R2_LIFECYCLE_VERIFIED!=='1')return null;
  const token=process.env.GOJUS_PDF_WORKER_TOKEN||'';
  try{
    const url=new URL(process.env.GOJUS_PDF_WORKER_URL||'');
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/api/pdf'||token.length<32)return null;
    return {url:url.href,token};
  }catch{return null;}
}
export function gojusPdfWorkerConfigured(){return workerConfig()!==null;}

async function selectManifest(input:Identity){
  if(!await tenantHasFeature(input.tenantId,'gojus_sheet')||!await tenantHasFeature(input.tenantId,'closing_signed_check'))throw new GoJusBundleError('disabled');
  const conversation=await prisma.conversation.findFirst({where:{id:input.conversationId,tenantId:input.tenantId,leadId:input.leadId,channel:'whatsapp'},select:{id:true}});
  if(!conversation)throw new GoJusBundleError('incomplete');
  const review=await signedClosingReview(input.tenantId,input.conversationId);
  if(!review?.complete||!review.modeApproved)throw new GoJusBundleError('incomplete');
  const signedIds=review.items.flatMap(i=>i.status==='received'&&i.messageId?[i.messageId]:[]);
  if(!signedIds.length||signedIds.length!==review.items.length)throw new GoJusBundleError('incomplete');
  const choice=await prisma.conversationDocumentCase.findFirst({where:{tenantId:input.tenantId,conversationId:input.conversationId},select:{checklistId:true}});
  const checklist=choice?await prisma.documentChecklist.findFirst({where:{tenantId:input.tenantId,id:choice.checklistId,enabled:true},select:{items:true}}):null;
  if(!checklist||!Array.isArray(checklist.items))throw new GoJusBundleError('incomplete');
  const keys=checklist.items.flatMap(i=>i&&typeof i==='object'&&!Array.isArray(i)&&typeof i.key==='string'?[i.key]:[]);
  if(keys.length!==checklist.items.length||!keys.length||keys.length>30)throw new GoJusBundleError('incomplete');
  const rows=await prisma.leadDocument.findMany({where:{tenantId:input.tenantId,conversationId:input.conversationId,leadId:input.leadId,checklistId:choice!.checklistId,itemKey:{in:keys}},select:{itemKey:true,messageId:true,status:true},take:301});
  if(rows.length>300)throw new GoJusBundleError('incomplete');
  const allIds=[...new Set([...rows.map(r=>r.messageId),...signedIds])];
  const messages=await prisma.message.findMany({where:{tenantId:input.tenantId,conversationId:input.conversationId,direction:'inbound',id:{in:allIds}},select:{id:true,createdAt:true,providerTimestamp:true}});
  const times=new Map(messages.map(m=>[m.id,m.providerTimestamp||m.createdAt]));
  if(allIds.some(id=>!times.has(id)))throw new GoJusBundleError('incomplete');
  const caseIds=selectLatestCaseFiles(keys,rows.map(r=>({...r,createdAt:times.get(r.messageId)!})));
  if(!caseIds)throw new GoJusBundleError('incomplete');
  const ids=[...caseIds,...signedIds];
  if(ids.length>40||new Set(ids).size!==ids.length)throw new GoJusBundleError('incomplete');
  const attachments=await prisma.chatAttachment.findMany({where:{tenantId:input.tenantId,conversationId:input.conversationId,clientMessageId:{in:ids},status:'ready',expiresAt:{gt:new Date()}},select:{id:true,clientMessageId:true,objectKey:true,mimeType:true,sizeBytes:true}});
  if(attachments.length!==ids.length||new Set(attachments.map(a=>a.clientMessageId)).size!==ids.length)throw new GoJusBundleError('incomplete');
  const map=new Map(attachments.map(a=>[a.clientMessageId,a]));
  const selected=ids.map((id,order)=>{
    const a=map.get(id);
    if(!a||!/^[-A-Za-z0-9_]+$/.test(input.tenantId)||!/^[-A-Za-z0-9_]+$/.test(a.id)||a.objectKey!==`tenants/${input.tenantId}/whatsapp/${a.id}`)throw new GoJusBundleError('incomplete');
    return {...a,order,kind:(order<caseIds.length?'case':'signed') as BundleFile['kind']};
  });
  const plan=planGoJusBundle({...input,expectedIds:selected.map(a=>a.id),files:selected.map(a=>({id:a.id,...input,kind:a.kind,mime:a.mimeType,status:'received',order:a.order,sizeBytes:a.sizeBytes})),maxInputBytes:GOJUS_INPUT_LIMIT});
  if(!plan.ready)throw new GoJusBundleError(selected.reduce((n,a)=>n+a.sizeBytes,0)>GOJUS_INPUT_LIMIT?'too_large':'incomplete');
  const ordered=plan.files.map(id=>selected.find(a=>a.id===id)!);
  return {sentId:review.sentId,ordered,fingerprint:createHash('sha256').update(JSON.stringify([review.sentId,ordered])).digest('hex')};
}
function signedUrl(config:AttachmentStorageConfig,method:'GET'|'PUT'|'HEAD',key:string){
  return presignS3Url({method,host:config.accountId+'.r2.cloudflarestorage.com',path:'/'+config.bucket+'/'+key,accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey,region:'auto',expiresSeconds:180,...(method==='PUT'?{signedHeaders:{'content-type':'application/pdf'}}:{})});
}
async function boundedJson(response:Response){
  if(!response.ok||!response.body||response.headers.get('content-type')?.split(';')[0]!=='application/json')throw new GoJusBundleError('unavailable');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let length=0;
  try{while(true){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>2048)throw new GoJusBundleError('unavailable');chunks.push(item.value);}}
  finally{await reader.cancel().catch(()=>undefined);}
  return JSON.parse(Buffer.concat(chunks,length).toString('utf8'));
}
export async function generateGoJusPdf(input:Identity){
  const worker=workerConfig();const storage=resolveAttachmentStorage();
  if(!worker||!storage.ready)throw new GoJusBundleError('unavailable');
  const manifest=await selectManifest(input);
  const signal=AbortSignal.timeout(100_000);
  const key=`flip-pdf-temp/${input.tenantId}/${randomUUID()}.pdf`;
  const files=manifest.ordered.map(a=>({url:signedUrl(storage.config,'GET',a.objectKey),mime:a.mimeType,size:a.sizeBytes}));
  try{
    const response=await fetch(worker.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${worker.token}`},body:JSON.stringify({tenantId:input.tenantId,files,outputUrl:signedUrl(storage.config,'PUT',key)}),cache:'no-store',redirect:'error',signal});
    if(response.status===413)throw new GoJusBundleError('too_large');
    const result=await boundedJson(response);
    if(typeof result?.sha256!=='string'||!/^[a-f0-9]{64}$/.test(result.sha256)||!Number.isSafeInteger(result.size)||result.size<=0||result.size>GOJUS_OUTPUT_LIMIT||!Number.isSafeInteger(result.pages)||result.pages<1||result.pages>120)throw new GoJusBundleError('unavailable');
    const head=await fetch(signedUrl(storage.config,'HEAD',key),{method:'HEAD',cache:'no-store',redirect:'error',signal});
    if(!head.ok||head.headers.get('content-type')!=='application/pdf'||Number(head.headers.get('content-length'))!==result.size)throw new GoJusBundleError('unavailable');
    // Independently verify the bytes actually stored, not merely the worker's report.
    const stored=await fetch(signedUrl(storage.config,'GET',key),{method:'GET',cache:'no-store',redirect:'error',signal});
    if(!stored.ok||!stored.body||stored.headers.get('content-type')!=='application/pdf'||Number(stored.headers.get('content-length'))!==result.size)throw new GoJusBundleError('unavailable');
    const reader=stored.body.getReader();
    const digest=createHash('sha256');let size=0;let prefix=Buffer.alloc(0);
    try{while(true){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>result.size||size>GOJUS_OUTPUT_LIMIT)throw new GoJusBundleError('unavailable');if(prefix.length<5)prefix=Buffer.concat([prefix,Buffer.from(chunk.value.subarray(0,5-prefix.length))]);digest.update(chunk.value);}}
    finally{await reader.cancel().catch(()=>undefined);}
    if(size!==result.size||!prefix.equals(Buffer.from('%PDF-'))||digest.digest('hex')!==result.sha256)throw new GoJusBundleError('unavailable');
    const current=await selectManifest(input);
    if(current.fingerprint!==manifest.fingerprint)throw new GoJusBundleError('changed');
    return {url:createAttachmentDownloadUrl(storage.config,{key,downloadName:'documentacao_completa.pdf'}),hash:result.sha256 as string,count:manifest.ordered.length};
  }catch(error){
    // Best-effort cleanup, with independently verified R2 lifecycle as a backstop.
    await deleteAttachmentObject(storage.config,{key,fetchImpl:(url,init)=>fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(5000)})}).catch(()=>undefined);
    throw error;
  }
}

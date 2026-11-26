import 'server-only';
import {createHash} from 'node:crypto';
import {prisma} from '@/lib/prisma';
import {tenantHasFeature} from '@/lib/billing/tenant-features';
import {signedClosingReview} from '@/lib/closing-documents/signed-review';
import {createAttachmentDownloadUrl,resolveAttachmentStorage,type AttachmentStorageConfig} from '@/lib/storage/attachment-storage';
import {planGoJusBundle,type BundleFile} from './pre-registration-rules';
import {selectLatestCaseFiles,GOJUS_DOWNLOAD_LIMIT,GOJUS_INPUT_LIMIT} from './bundle-selection';

type Identity={tenantId:string;leadId:string;conversationId:string};
export class GoJusBundleError extends Error{
  constructor(public readonly code:'disabled'|'incomplete'|'unavailable'|'too_large'|'changed'){super(code);}
}
function workerConfig(){
  if(process.env.GOJUS_PDF_WORKER_ENABLED!=='1')return null;
  const token=process.env.GOJUS_PDF_WORKER_TOKEN||'';
  try{
    const url=new URL(process.env.GOJUS_PDF_WORKER_URL||'');
    if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||url.pathname!=='/v1/pdf'||token.length<32)return null;
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
async function boundedBytes(response:Response,max:number){
  if(!response.ok||!response.body)throw new GoJusBundleError('unavailable');
  const declared=response.headers.get('content-length');
  if(declared!==null&&(!/^\d+$/.test(declared)||Number(declared)>max))throw new GoJusBundleError('too_large');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let n=0;
  try{while(true){const next=await reader.read();if(next.done)break;n+=next.value.byteLength;if(n>max)throw new GoJusBundleError('too_large');chunks.push(next.value);}}
  finally{await reader.cancel().catch(()=>undefined);}
  return Buffer.concat(chunks,n);
}
async function readOriginal(config:AttachmentStorageConfig,key:string,size:number,signal:AbortSignal){
  const response=await fetch(createAttachmentDownloadUrl(config,{key}),{method:'GET',cache:'no-store',redirect:'error',signal});
  const bytes=await boundedBytes(response,size);
  if(bytes.length!==size)throw new GoJusBundleError('changed');
  return bytes;
}
export async function generateGoJusPdf(input:Identity){
  const worker=workerConfig();const storage=resolveAttachmentStorage();
  if(!worker||!storage.ready)throw new GoJusBundleError('unavailable');
  const manifest=await selectManifest(input);
  const signal=AbortSignal.timeout(75_000);
  const files=[];
  for(const a of manifest.ordered){
    const bytes=await readOriginal(storage.config,a.objectKey,a.sizeBytes,signal);
    files.push({mime:a.mimeType,sha256:createHash('sha256').update(bytes).digest('hex'),content:bytes.toString('base64')});
  }
  const response=await fetch(worker.url,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${worker.token}`},body:JSON.stringify({files}),cache:'no-store',redirect:'error',signal});
  if(response.status===413)throw new GoJusBundleError('too_large');
  if(response.headers.get('content-type')!=='application/pdf')throw new GoJusBundleError('unavailable');
  const pdf=await boundedBytes(response,GOJUS_DOWNLOAD_LIMIT);
  const hash=createHash('sha256').update(pdf).digest('hex');
  if(!pdf.subarray(0,5).equals(Buffer.from('%PDF-'))||response.headers.get('x-pdf-sha256')!==hash)throw new GoJusBundleError('unavailable');
  const current=await selectManifest(input);
  if(current.fingerprint!==manifest.fingerprint)throw new GoJusBundleError('changed');
  return {pdf,hash,count:manifest.ordered.length};
}

import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {presignS3Url,resolveAttachmentStorage,type AttachmentStorageConfig} from '@/lib/storage/attachment-storage';

const FIXTURE=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKUlEQVR4nO3NMQEAAAjDMMC/52ECvlRA00nqs3m9AwAAAAAAAAAAgMMWx/EDPS4YA2MAAAAASUVORK5CYII=','base64');
const FIXTURE_HASH='c00cf2cc0bdba6ec502e7330a2c4b54e792d4d0135adf2e965d4573b57ddf234';
const MAX_RESULT=512*1024;
function digest(bytes:Uint8Array){return createHash('sha256').update(bytes).digest('hex');}

/** No fallback to the production R2 variables. All object names are generated locally. */
export function qaStorage(env:NodeJS.ProcessEnv){
  if(env.FLIP_PDF_QA_R2_BUCKET!=='flip-pdf-qa')return null;
  const result=resolveAttachmentStorage({
    NODE_ENV:env.NODE_ENV,
    R2_ACCOUNT_ID:env.FLIP_PDF_QA_R2_ACCOUNT_ID,
    R2_ATTACHMENTS_BUCKET:'flip-pdf-qa',
    R2_ACCESS_KEY_ID:env.FLIP_PDF_QA_R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY:env.FLIP_PDF_QA_R2_SECRET_ACCESS_KEY,
  });
  return result.ready?result.config:null;
}
function sign(config:AttachmentStorageConfig,method:'GET'|'PUT'|'HEAD'|'DELETE',key:string,headers?:Record<string,string>){
  if(config.bucket!=='flip-pdf-qa')throw Error('qa_scope');
  return presignS3Url({method,host:config.accountId+'.r2.cloudflarestorage.com',path:'/'+config.bucket+'/'+key,accessKeyId:config.accessKeyId,secretAccessKey:config.secretAccessKey,region:'auto',expiresSeconds:180,...(headers?{signedHeaders:headers}:{})});
}
async function bounded(response:Response,max:number){
  if(!response.ok||!response.body)throw Error('response');
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>max)throw Error('limit');chunks.push(item.value);}}
  finally{await reader.cancel().catch(()=>undefined);}
  return Buffer.concat(chunks,size);
}
export async function runR2Qa(config:AttachmentStorageConfig,url:string,headers:Record<string,string>){
  if(config.bucket!=='flip-pdf-qa'||url!=='https://flip-pdf-staging.vercel.app/api/pdf'||FIXTURE.length!==98||digest(FIXTURE)!==FIXTURE_HASH)return {ok:false,step:'config',cleanup:true};
  const tenant='qa-'+randomUUID();
  const source=`tenants/${tenant}/whatsapp/${randomUUID()}`;
  const target=`flip-pdf-temp/${tenant}/${randomUUID()}.pdf`;
  const request=(u:string,init:RequestInit,ms=10000)=>fetch(u,{...init,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(ms)});
  let step='fixture_upload';let ok=false;let bytes=0;let cleanup=false;
  try{
    const put=await request(sign(config,'PUT',source,{'content-type':'image/png','content-length':String(FIXTURE.length)}),{method:'PUT',headers:{'Content-Type':'image/png','Content-Length':String(FIXTURE.length)},body:new Uint8Array(FIXTURE)});
    if(!put.ok)throw Error('put');
    await put.body?.cancel().catch(()=>undefined);
    step='worker';
    const res=await request(url,{method:'POST',headers,body:JSON.stringify({tenantId:tenant,files:[{url:sign(config,'GET',source),mime:'image/png',size:FIXTURE.length}],outputUrl:sign(config,'PUT',target,{'content-type':'application/pdf'})})},45000);
    if(res.headers.get('content-type')?.split(';')[0]!=='application/json')throw Error('type');
    const result=JSON.parse((await bounded(res,2048)).toString('utf8'));
    if(result?.pages!==1||!Number.isSafeInteger(result.size)||result.size<1||result.size>MAX_RESULT||typeof result.sha256!=='string'||!/^[a-f0-9]{64}$/.test(result.sha256))throw Error('result');
    step='head';
    const head=await request(sign(config,'HEAD',target),{method:'HEAD'});
    if(!head.ok||head.headers.get('content-type')!=='application/pdf'||head.headers.get('content-length')!==String(result.size))throw Error('head');
    step='integrity';
    const output=await bounded(await request(sign(config,'GET',target),{method:'GET'}),MAX_RESULT);
    if(output.length!==result.size||output.subarray(0,5).toString()!=='%PDF-'||digest(output)!==result.sha256)throw Error('integrity');
    const original=await bounded(await request(sign(config,'GET',source),{method:'GET'}),1024);
    if(digest(original)!==FIXTURE_HASH)throw Error('original_changed');
    bytes=output.length;ok=true;step='complete';
  }catch{/* Never disclose signed URLs or provider exceptions. */}
  finally{
    const results=await Promise.allSettled([source,target].map(async key=>{
      const deleted=await request(sign(config,'DELETE',key),{method:'DELETE'},5000);
      if(!deleted.ok&&deleted.status!==404)return false;
      await deleted.body?.cancel().catch(()=>undefined);
      const head=await request(sign(config,'HEAD',key),{method:'HEAD'},5000);
      return head.status===404;
    }));
    cleanup=results.every(r=>r.status==='fulfilled'&&r.value===true);
  }
  return ok&&cleanup?{ok:true,synthetic:true,r2Tested:true,pages:1,bytes,integrity:true,cleanup:true}:{ok:false,step:ok?'cleanup':step,cleanup};
}

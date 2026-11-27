import {NextRequest,NextResponse} from 'next/server';
import {randomBytes} from 'node:crypto';
import {stagingPdfDiagnosticAllowed,trustedPdfEndpoint,trustedPdfHeaders} from '@/lib/gojus/worker-transport';

export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=15;
const json=(data:object,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
let running=false;
let lastAttempt=0;

/** Fixed no-data diagnostic, accessible only on the protected staging deployment hostname. */
export async function GET(req:NextRequest){
  if(!stagingPdfDiagnosticAllowed(process.env,req.nextUrl.hostname))return json({error:'not_found'},404);
  const host=process.env.GOJUS_PDF_WORKER_HOST||'';
  if(host!=='flip-pdf-staging.vercel.app')return json({ok:false,step:'config'},503);
  const url=trustedPdfEndpoint(process.env.GOJUS_PDF_WORKER_URL||'',host);
  const headers=trustedPdfHeaders({workerToken:process.env.GOJUS_PDF_WORKER_TOKEN||'',oidcToken:req.headers.get('x-vercel-oidc-token'),vercelRuntime:process.env.VERCEL==='1'});
  if(!url||!headers)return json({ok:false,step:'config_or_identity'},503);
  if(running||Date.now()-lastAttempt<10_000)return json({ok:false,step:'busy'},429);
  running=true;lastAttempt=Date.now();
  const nonce=randomBytes(16).toString('hex');
  try{
    const response=await fetch(url,{method:'POST',headers,body:JSON.stringify({diagnostic:'flip-pdf-transport-v1',nonce}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(8_000)});
    if(!response.ok||!response.body||response.headers.get('content-type')?.split(';')[0]!=='application/json')return json({ok:false,step:'worker_response',status:response.status},502);
    const reader=response.body.getReader();let size=0;const parts:Uint8Array[]=[];
    try{while(true){const item=await reader.read();if(item.done)break;size+=item.value.byteLength;if(size>512)return json({ok:false,step:'invalid_response'},502);parts.push(item.value);}}
    finally{await reader.cancel().catch(()=>undefined);}
    const result=JSON.parse(Buffer.concat(parts,size).toString('utf8'));
    if(result?.ok!==true||result?.synthetic!==true||result?.nonce!==nonce)return json({ok:false,step:'invalid_response'},502);
    return json({ok:true,synthetic:true,transport:'oidc_and_worker_token',r2Tested:false});
  }catch{return json({ok:false,step:'connection'},502);}
  finally{running=false;}
}

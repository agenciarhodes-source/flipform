import {NextRequest,NextResponse} from 'next/server';
import {stagingPdfR2DiagnosticAllowed,trustedPdfEndpoint,trustedPdfHeaders} from '@/lib/gojus/worker-transport';
import {qaStorage,runR2Qa} from '@/lib/gojus/r2-qa';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=120;
const json=(data:object,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
let running=false;
let lastAttempt=0;
export async function GET(req:NextRequest){
  if(!stagingPdfR2DiagnosticAllowed(process.env,req.nextUrl.hostname)||req.nextUrl.searchParams.get('run')!=='1')return json({error:'not_found'},404);
  const host=process.env.GOJUS_PDF_WORKER_HOST||'';
  const url=trustedPdfEndpoint(process.env.GOJUS_PDF_WORKER_URL||'',host);
  const headers=trustedPdfHeaders({workerToken:process.env.GOJUS_PDF_WORKER_TOKEN||'',oidcToken:req.headers.get('x-vercel-oidc-token'),vercelRuntime:process.env.VERCEL==='1'});
  const storage=qaStorage(process.env);
  if(host!=='flip-pdf-staging.vercel.app'||!url||!headers||!storage)return json({ok:false,step:'config'},503);
  if(running||Date.now()-lastAttempt<60_000)return json({ok:false,step:'busy'},429);
  running=true;lastAttempt=Date.now();
  try{const result=await runR2Qa(storage,url,headers);return json(result,result.ok?200:502);}
  catch{return json({ok:false,step:'unavailable'},503);}
  finally{running=false;}
}

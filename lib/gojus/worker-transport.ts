/** Pure allowlist validation; credentials never accepted from request bodies. */
export function trustedPdfEndpoint(raw:string,expectedHost:string):string|null{
  if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.vercel\.app$/.test(expectedHost))return null;
  try{
    const url=new URL(raw);
    const expected=`https://${expectedHost}/api/pdf`;
    return raw===expected&&url.href===expected?expected:null;
  }catch{return null;}
}
/** Shape check only. Vercel Trusted Sources verifies issuer, signature and scope. */
export function trustedPdfHeaders(input:{workerToken:string;oidcToken:string|null;vercelRuntime:boolean}):Record<string,string>|null{
  const {workerToken,oidcToken,vercelRuntime}=input;
  if(!vercelRuntime||workerToken.length<32||workerToken.length>256||!/^[A-Za-z0-9_-]+$/.test(workerToken)||!oidcToken||oidcToken.length>8192||!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(oidcToken))return null;
  return {'Content-Type':'application/json','Authorization':`Bearer ${workerToken}`,'x-vercel-trusted-oidc-idp-token':oidcToken};
}

import assert from 'node:assert/strict';
import test from 'node:test';
import {trustedPdfEndpoint,trustedPdfHeaders} from '../lib/gojus/worker-transport';

test('PDF credentials only travel to the exact configured Vercel host and path',()=>{
  const host='flip-pdf-staging.vercel.app';
  const url='https://'+host+'/api/pdf';
  assert.equal(trustedPdfEndpoint(url,host),url);
  for(const bad of ['http://'+host+'/api/pdf',url+'?x=1',url+'#x',url+'/',url.replace('/api/pdf','/api/selftest'),url.replace(host,'else.vercel.app'),url.replace(host,host+'.evil.example'),url.replace(host,'user@'+host),url.replace(host,host+':443')])assert.equal(trustedPdfEndpoint(bad,host),null);
  assert.equal(trustedPdfEndpoint('https://other.example/api/pdf','other.example'),null);
  assert.equal(trustedPdfEndpoint(url,''),null);
});
test('platform identity and independent worker secret are both required',()=>{
  const input={workerToken:'a'.repeat(43),oidcToken:'synthetic.header.signature',vercelRuntime:true};
  assert.deepEqual(trustedPdfHeaders(input),{'Content-Type':'application/json','Authorization':'Bearer '+input.workerToken,'x-vercel-trusted-oidc-idp-token':input.oidcToken});
  assert.equal(trustedPdfHeaders({...input,oidcToken:null}),null);
  assert.equal(trustedPdfHeaders({...input,oidcToken:'not-jwt'}),null);
  assert.equal(trustedPdfHeaders({...input,vercelRuntime:false}),null);
  assert.equal(trustedPdfHeaders({...input,workerToken:'short'}),null);
  assert.equal(trustedPdfHeaders({...input,workerToken:'a'.repeat(43)+'\n'}),null);
});


test('diagnostic guard denies production, aliases and active document processing',async()=>{
  const {stagingPdfDiagnosticAllowed}=await import('../lib/gojus/worker-transport');
  const hostname='flipform-staging-abc123-agenciarhodes-2076s-projects.vercel.app';
  const env={FLIP_PDF_TRANSPORT_TEST_ENABLED:'1',VERCEL:'1',VERCEL_ENV:'production',VERCEL_URL:hostname};
  assert.equal(stagingPdfDiagnosticAllowed(env,hostname),true);
  assert.equal(stagingPdfDiagnosticAllowed({...env,GOJUS_PDF_WORKER_ENABLED:'1'},hostname),false);
  assert.equal(stagingPdfDiagnosticAllowed({...env,GOJUS_PDF_R2_LIFECYCLE_VERIFIED:'1'},hostname),false);
  assert.equal(stagingPdfDiagnosticAllowed(env,'app.flipform.com.br'),false);
  assert.equal(stagingPdfDiagnosticAllowed({...env,VERCEL_URL:'flipform-abc123-agenciarhodes-2076s-projects.vercel.app'},hostname),false);
  assert.equal(stagingPdfDiagnosticAllowed({},hostname),false);
});

import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';

export function validLogin(input,loginUrl){
  if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).sort().join(',')!=='email,password,url'||input.url!==loginUrl)return false;
  try{const u=new URL(loginUrl);if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.port||u.href!==loginUrl||!u.hostname.includes('.')||/^\d+(\.\d+)+$/.test(u.hostname)||u.hostname.endsWith('.local')||u.hostname.endsWith('.internal')||u.hostname.endsWith('.localhost')||u.hostname.endsWith('.'))return false;}catch{return false;}
  return typeof input.email==='string'&&input.email.length<=254&&/^\S+@[^\s@]+\.[^\s@]+$/.test(input.email)&&typeof input.password==='string'&&input.password.length>0&&input.password.length<=1024&&!/[\u0000-\u001f\u007f]/.test(input.password);
}
export function allowedRequest(url,origin){
  try{const u=new URL(url);return u.protocol==='https:'&&u.origin===origin&&!u.username&&!u.password;}catch{return false;}
}
export function verifiedLanding(url,expectedUrl,headingVisible,buttonVisible,loginVisible){
  return url===expectedUrl&&headingVisible===true&&buttonVisible===true&&loginVisible===false;
}
export async function testLogin(input,env=process.env){
  const loginUrl=env.GOJUS_LOGIN_URL||'';
  const successUrl=env.GOJUS_LOGIN_SUCCESS_URL||'';
  if(!validLogin(input,loginUrl)||!allowedRequest(successUrl,new URL(loginUrl).origin)||successUrl===loginUrl||new URL(successUrl).hash||new URL(successUrl).search)return 'unavailable';
  // Explicit deployment attestation: external network policy must pin the approved host
  // to public addresses and deny all other destinations, including DNS rebinding.
  if(env.GOJUS_LOGIN_EGRESS_VERIFIED!=='1')return 'unavailable';
  let browser;let submitted=false;
  try{
    browser=await chromium.launch({headless:true,timeout:10000});
    const context=await browser.newContext({acceptDownloads:false,serviceWorkers:'block',ignoreHTTPSErrors:false});
    const origin=new URL(loginUrl).origin;
    await context.route('**/*',route=>allowedRequest(route.request().url(),origin)?route.continue():route.abort());
    if(typeof context.routeWebSocket==='function')await context.routeWebSocket('**/*',socket=>socket.close());
    const page=await context.newPage();
    page.setDefaultTimeout(7000);
    await page.goto(loginUrl,{waitUntil:'domcontentloaded',timeout:10000});
    if(page.url()!==loginUrl)return 'manual_required';
    const email=page.getByLabel('E-mail',{exact:true});
    const password=page.getByLabel('Senha',{exact:true});
    const submit=page.getByRole('button',{name:'Entrar',exact:true});
    if(await email.count()!==1||await password.count()!==1||await submit.count()!==1)return 'manual_required';
    // No persistent session, no remember-me, no screenshots/traces or challenge bypass.
    await email.fill(input.email);await password.fill(input.password);
    if(page.url()!==loginUrl)return 'manual_required';
    await submit.click();submitted=true;
    await page.waitForURL(successUrl,{timeout:12000}).catch(()=>undefined);
    const heading=page.getByText('Pré-cadastro de Clientes',{exact:true});
    const button=page.getByRole('button',{name:'Pré-cadastrar cliente',exact:true});
    if(page.url()===successUrl)await button.waitFor({state:'visible',timeout:5000}).catch(()=>undefined);
    if(verifiedLanding(page.url(),successUrl,await heading.count()===1&&await heading.isVisible(),await button.count()===1&&await button.isVisible(),await password.count()>0&&await password.first().isVisible()))return 'login_ok';
    // Unknown DOM, captcha/MFA, rejection or a changed URL needs a human; no retries.
    return 'manual_required';
  }catch{return submitted?'manual_required':'unavailable';}
  finally{if(browser)await browser.close().catch(()=>undefined);}
}
function authenticated(req,token){
  const got=Buffer.from(req.headers.authorization||'');const want=Buffer.from('Bearer '+token);
  return token.length>=32&&got.length===want.length&&timingSafeEqual(got,want);
}
export function serve(env=process.env){
  let busy=false;
  const token=env.GOJUS_LOGIN_WORKER_TOKEN||'';
  if(token.length<32)throw Error('Worker configuration unavailable');
  const server=http.createServer(async(req,res)=>{
    function reply(status,result){const body=JSON.stringify({result});res.writeHead(status,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'Cache-Control':'no-store','Connection':'close'});res.end(body);}
    if(req.method!=='POST'||req.url!=='/v1/login-test'||!authenticated(req,token))return reply(403,'unavailable');
    if(req.headers['content-type']!=='application/json'||req.headers['transfer-encoding']||!/^\d+$/.test(req.headers['content-length']||'')||Number(req.headers['content-length'])>8192)return reply(400,'unavailable');
    if(busy)return reply(503,'unavailable');
    busy=true;
    try{
      const chunks=[];let size=0;
      for await(const chunk of req){size+=chunk.length;if(size>8192)return reply(400,'unavailable');chunks.push(chunk);}
      const input=JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if(!validLogin(input,env.GOJUS_LOGIN_URL||''))return reply(400,'unavailable');
      return reply(200,await testLogin(input,env));
    }catch{return reply(503,'unavailable');}finally{busy=false;}
  });
  server.requestTimeout=15000;server.headersTimeout=10000;
  server.listen(8766,'127.0.0.1');
  return server;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)serve();

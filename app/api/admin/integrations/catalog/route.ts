import { NextResponse, type NextRequest } from 'next/server';
import { withPlatformAdmin } from '@/lib/auth';
import { catalogInput } from '@/lib/integration-catalog/validation';
import { readCatalogAdmin, saveCatalogApp, CatalogConflict, CatalogInvalid } from '@/lib/integration-catalog/store';
export const dynamic='force-dynamic';
const reply=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function boundedBody(req:NextRequest) {
  if(req.headers.get('content-type')?.split(';')[0].trim()!=='application/json') throw new CatalogInvalid('Envie JSON.');
  const reader=req.body?.getReader();
  if(!reader) throw new CatalogInvalid('Dados ausentes.');
  const chunks:Uint8Array[]=[]; let size=0;
  try {
    while(true) {
      const next=await reader.read();
      if(next.done) break;
      size+=next.value.length;
      if(size>100000){await reader.cancel();throw new CatalogInvalid('Arquivo acima do limite.');}
      chunks.push(next.value);
    }
    try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new CatalogInvalid('JSON inválido.');}
  } finally {reader.releaseLock();}
}
export const GET=withPlatformAdmin(async()=>{
  try {const data=await readCatalogAdmin(); return reply(data,data.available?200:503);}
  catch{return reply({error:'Catálogo global indisponível.'},503);}
});
export const PUT=withPlatformAdmin(async(req,session)=>{
  if(req.headers.get('origin')!==req.nextUrl.origin) return reply({error:'Origem inválida.'},403);
  try {
    const parsed=catalogInput.safeParse(await boundedBody(req));
    if(!parsed.success) return reply({error:'Confira os campos e o tamanho da imagem.'},400);
    const app=await saveCatalogApp(parsed.data,session.userId);
    return reply({app});
  }catch(e){
    const code=(e as {code?:string})?.code;
    if(e instanceof CatalogConflict||code==='P2002'||code==='P2034') return reply({error:'O catálogo mudou. Atualize antes de salvar.'},409);
    if(e instanceof CatalogInvalid) return reply({error:e.message},400);
    return reply({error:'Não foi possível salvar o catálogo. Nenhuma alteração parcial foi gravada.'},503);
  }
});

import 'server-only';
import { prisma } from '@/lib/prisma';
import { Prisma } from '@prisma/client';
import { defaultApps, mergeCatalog, MAX_CATALOG_APPS } from './presentation';
import { catalogInput, validateIcon } from './validation';
import type { z } from 'zod';

const select = {id:true,label:true,description:true,category:true,sortOrder:true,planSlugs:true,iconDigest:true,revision:true} as const;
export async function readGlobalCatalog() {
  try {
    const rows=await prisma.platformCatalogApp.findMany({select,take:MAX_CATALOG_APPS+1});
    if(rows.length>MAX_CATALOG_APPS) throw new Error('CATALOG_LIMIT');
    return {apps:mergeCatalog(rows),available:true};
  } catch { return {apps:defaultApps(),available:false}; }
}
export async function readCatalogAdmin() {
  const catalog=await readGlobalCatalog();
  if(!catalog.available) return {...catalog,history:[]};
  const history=await prisma.platformCatalogAudit.findMany({orderBy:[{createdAt:'desc'},{id:'desc'}],take:50,select:{id:true,appId:true,actorId:true,revision:true,before:true,after:true,createdAt:true}});
  return {...catalog,history};
}
export class CatalogConflict extends Error {}
export class CatalogInvalid extends Error {}
type Input = z.infer<typeof catalogInput>;
export async function saveCatalogApp(input:Input, actorId:string) {
  const builtin=defaultApps().find(a=>a.id===input.id);
  if(!actorId || (!builtin && !/^custom-[a-z0-9-]{1,57}$/.test(input.id))) throw new CatalogInvalid('Identificador inválido.');
  const icon=input.iconPng===undefined ? undefined : input.iconPng===null ? {iconPng:null,iconDigest:null} : validateIcon(input.iconPng);
  if(icon===null) throw new CatalogInvalid('Envie um PNG válido, de até 256 por 256 pixels e 64 KB.');
  return prisma.$transaction(async tx=>{
    const before=await tx.platformCatalogApp.findUnique({where:{id:input.id},select});
    if((before?.revision??0)!==input.expectedRevision) throw new CatalogConflict('O catálogo mudou. Atualize antes de salvar.');
    if(!before && await tx.platformCatalogApp.count()>=MAX_CATALOG_APPS) throw new CatalogInvalid('Limite de aplicativos atingido.');
    const data={label:input.label,description:input.description,category:input.category,sortOrder:input.sortOrder,planSlugs:input.planSlugs,...(icon===undefined?{}:icon),revision:input.expectedRevision+1};
    if(before) {
      const changed=await tx.platformCatalogApp.updateMany({where:{id:input.id,revision:input.expectedRevision},data});
      if(changed.count!==1) throw new CatalogConflict('O catálogo mudou. Atualize antes de salvar.');
    } else {
      await tx.platformCatalogApp.create({data:{id:input.id,...data}});
    }
    const after=await tx.platformCatalogApp.findUniqueOrThrow({where:{id:input.id},select});
    await tx.platformCatalogAudit.create({data:{appId:input.id,actorId,revision:after.revision,before:before ? before as Prisma.InputJsonObject : Prisma.JsonNull,after:after as Prisma.InputJsonObject}});
    return after;
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
}

import { CONNECTION_CATALOG, type CatalogApp } from './catalog';

export const PLAN_SLUGS = ['free','starter','growth','pro','inbox','business','premium','premium-pro'] as const;
export const MAX_CATALOG_APPS = 64;
export const MAX_PNG_BYTES = 65536;
export type CatalogMetadata = { id:string; label:string; description:string; category:string; sortOrder:number; planSlugs:string[]; iconDigest:string|null; revision:number };
export type PresentedApp = CatalogApp & CatalogMetadata;
const categories: Record<string,string> = {
  whatsapp:'Redes sociais e atendimento',instagram:'Redes sociais e atendimento',tiktok:'Redes sociais e atendimento',
  'google-ads':'Marketing e publicidade','google-search':'Marketing e publicidade','google-business':'Marketing e publicidade','meta-ads':'Marketing e publicidade','chatgpt-ads':'Marketing e publicidade',
  gojus:'Sistemas empresariais',crm:'Sistemas empresariais',agenda:'Sistemas empresariais',erp:'Sistemas empresariais',asaas:'Sistemas empresariais',other:'Sistemas empresariais',
};
export function defaultApps(): PresentedApp[] {
  return CONNECTION_CATALOG.map((a,i)=>({...a,category:categories[a.id] || 'Outros',sortOrder:i*10,planSlugs:[...PLAN_SLUGS],iconDigest:null,revision:0}));
}
export function mergeCatalog(rows: readonly CatalogMetadata[]): PresentedApp[] {
  const defaults = new Map(defaultApps().map(a=>[a.id,a]));
  for (const row of rows) {
    const current = defaults.get(row.id);
    if (current) defaults.set(row.id,{...current,label:row.label,description:row.description,category:row.category,sortOrder:row.sortOrder,planSlugs:row.planSlugs,iconDigest:row.iconDigest,revision:row.revision});
    else if (/^custom-[a-z0-9-]{1,57}$/.test(row.id)) defaults.set(row.id,{...row,glyph:row.label.slice(0,2).toUpperCase(),tone:'neutral',premiumOnly:true});
  }
  return [...defaults.values()].sort((a,b)=>a.sortOrder-b.sortOrder || a.id.localeCompare(b.id));
}
export function visibleApps(apps: readonly PresentedApp[], planSlug:string|null, universal:boolean, inboxOnly:boolean) {
  return apps.filter(a=> (!inboxOnly || a.id==='whatsapp') && (!a.premiumOnly || universal) &&
    // Without a plan, retain only unmodified built-in legacy cards.
    (planSlug ? a.planSlugs.includes(planSlug) : a.revision===0 && !a.premiumOnly));
}
export function iconUrl(app: Pick<CatalogMetadata,'id'|'iconDigest'|'revision'>) {
  return app.iconDigest ? '/api/integrations/catalog/icon/'+encodeURIComponent(app.id)+'?v='+app.revision : null;
}

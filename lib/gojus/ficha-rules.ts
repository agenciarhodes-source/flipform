/** Pure mapping foundation. No real GoJus field labels/order are assumed before Annex 1 is validated. */
export const GOJUS_FIELD_SOURCES = ['lead.name','lead.cpf','lead.phone','lead.email','lead.address','case.area','lead.stage','case.assignee','contract.signatureDate','case.safeSummary'] as const;
export type GoJusFieldSource = typeof GOJUS_FIELD_SOURCES[number];
export type GoJusField = { key:string; screen:string; label:string; source:GoJusFieldSource; required:boolean; order:number; confirmation:string };
export type GoJusFieldMap = { version:string; verified:boolean; fields:readonly GoJusField[] };

// Intentionally unverified and empty until the office supplies the screen recording and signs off the map.
export const GOJUS_FIELD_MAP: GoJusFieldMap = { version:'pending-annex-1',verified:false,fields:[] };

export function validateGoJusFieldMap(map:GoJusFieldMap) {
  const errors:string[]=[];
  if(map.verified!==true)errors.push('Manual de telas ainda não validado.');
  if(!map.version.trim())errors.push('Versão do mapa ausente.');
  if(!map.fields.length)errors.push('Nenhum campo mapeado.');
  const keys=new Set<string>();const positions=new Set<number>();
  for(const field of map.fields) {
    if(!field.key.trim()||!field.screen.trim()||!field.label.trim()||!field.confirmation.trim())errors.push('Campo sem identificação ou conferência.');
    if(!GOJUS_FIELD_SOURCES.includes(field.source))errors.push('Origem de campo não suportada.');
    if(typeof field.required!=='boolean')errors.push('Obrigatoriedade não confirmada.');
    if(!Number.isSafeInteger(field.order)||field.order<1||positions.has(field.order))errors.push('Ordem de tela inválida ou duplicada.');
    if(keys.has(field.key))errors.push('Chave de campo duplicada.');
    keys.add(field.key);positions.add(field.order);
  }
  return {ready:errors.length===0,errors};
}

export type GoJusFieldValues = Partial<Record<GoJusFieldSource,string|null>>;
export function prepareGoJusFields(map:GoJusFieldMap,values:GoJusFieldValues) {
  const validation=validateGoJusFieldMap(map);
  // Never expose candidate data as a ready-to-copy GoJus mapping before review.
  if(!validation.ready)return {ready:false,fields:[],missing:[],errors:validation.errors};
  const fields=[...map.fields].sort((a,b)=>a.order-b.order).map(field=>{
    const value=values[field.source]?.trim()||null;
    return {...field,value,missing:field.required&&value===null};
  });
  const missing=fields.filter(field=>field.missing).map(field=>({key:field.key,label:field.label,source:field.source}));
  return {ready:missing.length===0,fields,missing,errors:[]};
}

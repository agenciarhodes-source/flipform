'use client';
import { useEffect,useState } from 'react';
import { Button } from '@/components/ui/button';
import { PLAN_SLUGS,iconUrl,type PresentedApp } from '@/lib/integration-catalog/presentation';

type Draft={id:string;expectedRevision:number;label:string;description:string;category:string;sortOrder:number;planSlugs:string[];iconPng?:string|null};
type History={id:string;appId:string;actorId:string;revision:number;createdAt:string;after:{label?:string}};
const newDraft=():Draft=>({id:'custom-',expectedRevision:0,label:'',description:'',category:'Sistemas empresariais',sortOrder:500,planSlugs:['premium','premium-pro']});
function edit(a:PresentedApp):Draft{return {id:a.id,expectedRevision:a.revision,label:a.label,description:a.description,category:a.category,sortOrder:a.sortOrder,planSlugs:[...a.planSlugs]};}
async function normalizeImage(file:File):Promise<string>{
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>2*1024*1024)throw Error('Selecione PNG, JPG ou WebP de até 2 MB.');
  const bitmap=await createImageBitmap(file);
  try{
    if(bitmap.width>4096||bitmap.height>4096)throw Error('Imagem muito grande.');
    const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;
    const ctx=canvas.getContext('2d');if(!ctx)throw Error('Não foi possível preparar a imagem.');
    const ratio=Math.min(128/bitmap.width,128/bitmap.height);
    const w=bitmap.width*ratio,h=bitmap.height*ratio;ctx.drawImage(bitmap,(128-w)/2,(128-h)/2,w,h);
    const result=canvas.toDataURL('image/png').split(',')[1];
    if(!result||result.length>87384)throw Error('Imagem final acima de 64 KB.');
    return result;
  }finally{bitmap.close();}
}
export default function CatalogAdminPage(){
  const [apps,setApps]=useState<PresentedApp[]>([]),[history,setHistory]=useState<History[]>([]),[draft,setDraft]=useState<Draft|null>(null);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  async function load(){
    setReady(false);
    try{const r=await fetch('/api/admin/integrations/catalog',{cache:'no-store'});const d=await r.json();
      if(!r.ok||!d.available)throw Error('Catálogo indisponível. Verifique a migração do banco.');
      setApps(d.apps);setHistory(d.history);setReady(true);return true;
    }catch(e){setMessage(e instanceof Error?e.message:'Falha ao carregar.');return false;}
  }
  useEffect(()=>{void load();},[]);
  function change(p:Partial<Draft>){setDraft(current=>current?{...current,...p}:current);}
  async function save(){
    if(!draft||!ready)return;setBusy(true);setMessage('');
    try{const r=await fetch('/api/admin/integrations/catalog',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(draft)});const d=await r.json();
      if(!r.ok)throw Error(d.error||'Falha ao salvar.');
      setDraft(null);if(await load())setMessage('Catálogo salvo. As empresas verão a atualização na próxima consulta.');
    }catch(e){setMessage(e instanceof Error?e.message:'Falha ao salvar.');}finally{setBusy(false);}
  }
  const current=apps.find(a=>a.id===draft?.id);
  const preview=draft?.iconPng===null?null:draft?.iconPng?'data:image/png;base64,'+draft.iconPng:current?iconUrl(current):null;
  return <main className="p-8 max-w-6xl space-y-6">
    <header><h1 className="text-2xl font-bold">Catálogo global de aplicativos</h1><p className="text-sm text-muted-foreground mt-1">Identidade visual e visibilidade dos cartões para todas as empresas. Não cria conexões, credenciais ou permissões técnicas.</p></header>
    <div className="flex flex-wrap gap-2"><Button disabled={!ready||busy} onClick={()=>setDraft(newDraft())}>Novo aplicativo</Button><Button variant="outline" disabled={busy} onClick={()=>{setDraft(null);void load();}}>Atualizar catálogo</Button></div>
    {message&&<p role="status" className="text-sm rounded-lg border p-3">{message}</p>}
    {!ready&&<p className="text-sm text-muted-foreground">Carregando ou aguardando disponibilidade do banco.</p>}
    {ready&&<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{apps.map(a=><button key={a.id} type="button" disabled={busy} onClick={()=>setDraft(edit(a))} className="rounded-xl border bg-card p-4 flex gap-3 items-center text-left hover:bg-muted"><div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">{iconUrl(a)?<img src={iconUrl(a)!} alt="" className="w-full h-full object-contain"/>:a.glyph}</div><div><p className="font-semibold">{a.label}</p><p className="text-xs text-muted-foreground">{a.category} · {a.revision===0?'Padrão':'Personalizado'}</p></div></button>)}</div>}
    {draft&&<section className="rounded-xl border bg-card p-5 space-y-4"><h2 className="text-lg font-semibold">Editar aplicativo</h2>
      <fieldset disabled={busy||!ready} className="space-y-4">
        <label className="block text-sm">Identificador (fixo após cadastro)<input className="block w-full border rounded p-2" value={draft.id} disabled={Boolean(current)} maxLength={64} onChange={e=>change({id:e.target.value})}/></label>
        <label className="block text-sm">Nome<input className="block w-full border rounded p-2" value={draft.label} maxLength={80} onChange={e=>change({label:e.target.value})}/></label>
        <label className="block text-sm">Descrição<textarea className="block w-full border rounded p-2" value={draft.description} maxLength={300} onChange={e=>change({description:e.target.value})}/></label>
        <label className="block text-sm">Categoria<input className="block w-full border rounded p-2" value={draft.category} maxLength={60} onChange={e=>change({category:e.target.value})}/></label>
        <label className="block text-sm">Ordem (0–9999)<input type="number" className="block w-full border rounded p-2" value={draft.sortOrder} min={0} max={9999} onChange={e=>change({sortOrder:Number(e.target.value)})}/></label>
        <div className="space-y-2"><p className="text-sm font-medium">Imagem do cartão</p>{preview&&<img src={preview} alt="Prévia do ícone" className="w-20 h-20 object-contain rounded border"/>}<input aria-label="Enviar imagem" type="file" accept="image/png,image/jpeg,image/webp" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);try{change({iconPng:await normalizeImage(file)});}catch(err){setMessage(err instanceof Error?err.message:'Imagem inválida.');}finally{setBusy(false);e.target.value='';}}}/><Button type="button" variant="outline" size="sm" onClick={()=>change({iconPng:null})}>Usar ícone padrão</Button></div>
        <div><p className="text-sm font-medium">Visibilidade por plano</p><p className="text-xs text-muted-foreground">Somente a exibição do cartão. As regras de acesso e o limite Premium dos conectores novos continuam obrigatórios.</p><div className="grid grid-cols-2 gap-2 mt-2">{PLAN_SLUGS.map(plan=><label key={plan} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={draft.planSlugs.includes(plan)} onChange={e=>change({planSlugs:e.target.checked?[...draft.planSlugs,plan]:draft.planSlugs.filter(p=>p!==plan)})}/>{plan}</label>)}</div></div>
      </fieldset>
      <div className="flex gap-2"><Button disabled={busy||!ready} onClick={()=>void save()}>Salvar alterações</Button><Button variant="outline" disabled={busy} onClick={()=>setDraft(null)}>Cancelar</Button></div>
    </section>}
    <section className="rounded-xl border bg-card p-5 space-y-3"><h2 className="font-semibold">Histórico recente de alterações</h2>{history.length===0?<p className="text-sm text-muted-foreground">Nenhuma alteração registrada.</p>:history.map(h=><div key={h.id} className="border-b pb-2 text-sm"><p className="font-medium">{h.after?.label||h.appId} · revisão {h.revision}</p><p className="text-xs text-muted-foreground">{new Date(h.createdAt).toLocaleString('pt-BR')} · Administrador {h.actorId}</p></div>)}</section>
  </main>;
}

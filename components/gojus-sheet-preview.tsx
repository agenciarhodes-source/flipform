'use client';
import { useEffect,useState } from 'react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
type Sheet={lead:{name:string;phone:string|null;state:string|null;city:string|null;cpfMasked:string|null;hasCpf:boolean};cases:Array<{conversationId:string;whatsapp:string|null;caseLabel:string|null;contractsComplete:boolean;contracts:Array<{name:string;status:string}>}>};
export function GoJusSheetPreview({leadId}:{leadId:string}){
  const [sheet,setSheet]=useState<Sheet|null>(null);
  const [selected,setSelected]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{setSheet(null);setSelected('');setError('');},[leadId]);
  async function prepare(){
    setBusy(true);setError('');
    try{
      const res=await fetch('/api/leads/'+encodeURIComponent(leadId)+'/gojus-sheet',{cache:'no-store'});
      if(!res.ok)throw Error('Não foi possível preparar a ficha.');
      const data:Sheet=await res.json();setSheet(data);setSelected(data.cases.length===1?data.cases[0].conversationId:'');
    }catch{setError('Não foi possível preparar a ficha.');}finally{setBusy(false);}
  }
  async function copy(value:string){
    try{await navigator.clipboard.writeText(value);toast.success('Copiado.');}catch{toast.error('Não foi possível copiar.');}
  }
  async function copyCpf(){
    try{
      const res=await fetch('/api/leads/'+encodeURIComponent(leadId)+'/cpf?reveal=1',{cache:'no-store'});
      const data=await res.json();
      if(!res.ok||typeof data.cpf!=='string')throw Error();
      await copy(data.cpf);
    }catch{toast.error('CPF indisponível.');}
  }
  const chosen=sheet?.cases.find(c=>c.conversationId===selected);
  return <section className="rounded-lg border p-3 space-y-3">
    <h3 className="font-medium">Ficha GoJus</h3>
    <p className="text-xs text-muted-foreground">Preparação manual. Mapeamento de opções, relato, PDF e envio ainda dependem de homologação.</p>
    <Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>void prepare()}>{busy?'Preparando...':'Preparar ficha GoJus'}</Button>
    {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
    {sheet&&<>
      {sheet.cases.length>1&&<label className="block text-sm">Selecione a conversa do caso<select className="mt-1 block w-full rounded border bg-background p-2" value={selected} onChange={e=>setSelected(e.target.value)}><option value="">Selecione</option>{sheet.cases.map((c,i)=><option key={c.conversationId} value={c.conversationId}>{c.caseLabel||'Caso sem tese'} · Conversa {i+1}</option>)}</select></label>}
      <div className="space-y-2">{[
        {label:'Nome do cliente',value:sheet.lead.name,required:true},
        {label:'CPF do cliente',value:sheet.lead.cpfMasked,required:true,cpf:true},
        {label:'Telefone',value:sheet.lead.phone,required:false},
        {label:'WhatsApp',value:chosen?.whatsapp,required:false},
        {label:'Relato do caso',value:null,required:true},
        {label:'Menor de idade',value:null,required:false},
        {label:'Benefício',value:null,required:true},
        {label:'Estado',value:sheet.lead.state,required:true},
        {label:'Cidade',value:sheet.lead.city,required:true},
      ].map(field=><div key={field.label} className="flex items-center justify-between gap-2 border-b pb-2 text-sm"><div><p className="font-medium">{field.label}</p><p className={field.value?'text-muted-foreground':field.required?'text-red-600':'text-muted-foreground'}>{field.value|| (field.required?'Pendente de preenchimento ou validação':'Não confirmado')}</p></div>{field.value&&<Button type="button" size="sm" variant="outline" onClick={()=>void(field.cpf?copyCpf():copy(field.value!))}>Copiar</Button>}</div>)}</div>
      <p className="text-xs text-muted-foreground">Senha do INSS: não coletada nesta ficha. Tese candidata: {chosen?.caseLabel||'não identificada'} (benefício GoJus ainda precisa ser confirmado).</p>
      {chosen&&<div><p className="font-medium text-sm">Contratos: {chosen.contractsComplete?'conferência visual completa':'pendentes de conferência'}</p>{chosen.contracts.map((c,i)=><p key={i} className="text-sm text-muted-foreground">{c.name} · {c.status==='received'?'Recebido': 'Pendente de revisão'}</p>)}</div>}
      <p className="text-xs text-muted-foreground">Não é possível lançar no GoJus nesta etapa.</p>
    </>}
  </section>;
}

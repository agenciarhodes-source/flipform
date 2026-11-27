'use client';

import { useEffect, useState } from 'react';
import { buttonVariants, Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { GoJusSheetPreview } from './gojus-sheet-preview';

type CaseView = {
  name: string;
  items: Array<{ label: string; rule: string; status: string; files: Array<{ messageId: string; href: string; status: string; note: string | null; createdAt: string }> }>;
  others: Array<{ messageId: string; detectedType: string | null; status: string; createdAt: string }>;
};

type ClosingView = {conversationId:string;sentId:string;sentAt:string;sendComplete:boolean;reviewRequired:boolean;complete:boolean;modeApproved:boolean;taskCreated:boolean;items:Array<{id:string;name:string;status:string;note:string|null;href:string|null}>};
const ICON: Record<string, string> = { received: '✅', unreadable: '⚠️', problem: '⚠️', missing: '⏳', unrecognized: '❔' };
const LABEL: Record<string, string> = { received: 'Recebido', unreadable: 'Ilegível', problem: 'Com problema', missing: 'Falta', unrecognized: 'Não reconhecido' };

/** The documents the Flip AI checked for this lead, by type of case, with a link to each file. */
export function LeadDocumentsTab({ leadId }: { leadId: string }) {
  const [cases, setCases] = useState<CaseView[] | null>(null);
  const [closing,setClosing]=useState<ClosingView[]>([]);
  const [cpfRegistered,setCpfRegistered]=useState(false);
  const [canApprove,setCanApprove]=useState(false);
  const [refresh,setRefresh]=useState(0);
  const [busy,setBusy]=useState(false);
  const [gojusSheet,setGojusSheet]=useState(false);
  async function approve(entry:ClosingView,mode:'separate'|'package') {
    if(!window.confirm('Confirmar este formato de devolução para os modelos enviados? Isso pode gerar uma tarefa para revisão humana.'))return;
    setBusy(true);
    try {
      const res=await fetch('/api/leads/'+encodeURIComponent(leadId)+'/closing-return-mode',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({conversationId:entry.conversationId,sentId:entry.sentId,mode})});
      const result=await res.json();
      if(!res.ok)throw Error(result.error||'Não foi possível confirmar.');
      toast.success('Formato confirmado.');setRefresh(n=>n+1);
    }catch(error){toast.error(error instanceof Error?error.message:'Não foi possível confirmar.');}finally{setBusy(false);}
  }
  useEffect(() => {
    let active=true;
    setCases(null); setClosing([]); setCpfRegistered(false);setCanApprove(false);setGojusSheet(false);
    fetch(`/api/leads/${encodeURIComponent(leadId)}/documents`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : { cases: [] }))
      .then((data) => {if(!active)return;setCases(Array.isArray(data.cases)?data.cases:[]);setClosing(Array.isArray(data.closing)?data.closing:[]);setCpfRegistered(data.cpfRegistered===true);setCanApprove(data.canApproveClosingMode===true);setGojusSheet(data.gojusSheet===true);})
      .catch(() => {if(active)setCases([]);});
    return ()=>{active=false;};
  }, [leadId,refresh]);

  if (cases === null) return <p className="text-sm text-muted-foreground">Carregando documentos...</p>;
  if (!cases.length && !closing.length && !gojusSheet) {
    return <p className="text-sm text-muted-foreground">Nenhum documento conferido pela IA ainda. Os documentos enviados pelo WhatsApp aparecem aqui quando a IA os confere.</p>;
  }
  return (
    <div className="space-y-4">
      {gojusSheet&&<GoJusSheetPreview key={leadId} leadId={leadId}/>}
      {closing.map(entry=><section key={entry.conversationId} className="rounded-lg border p-3 space-y-2">
        <h3 className="font-medium">Contratos assinados</h3>
        <p className="text-xs text-muted-foreground">Conferência preliminar · revisão humana necessária · CPF cadastrado: {cpfRegistered?'sim':'não'}</p>
        {!entry.sendComplete && <p className="text-sm">Envio de modelos não confirmado integralmente.</p>}
        {entry.taskCreated?<p className="text-sm font-medium">Tarefa de análise criada. Confira eventuais reenvios antes do lançamento.</p>:entry.complete?<p className="text-sm font-medium">Recebimento visual completo. Revisão humana necessária.</p>:<p className="text-sm">{entry.modeApproved?'Aguardando documentos completos.':'Formato de devolução aguardando confirmação do dono.'}</p>}
        {canApprove&&entry.sendComplete&&!entry.modeApproved&&!entry.taskCreated&&<div className="flex flex-wrap gap-2">
          {entry.items.length===3&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>void approve(entry,'separate')}>Confirmar 3 documentos separados</Button>}
          {entry.items.length===1&&<Button type="button" size="sm" variant="outline" disabled={busy} onClick={()=>void approve(entry,'package')}>Confirmar modelo único completo</Button>}
          {entry.items.length!==1&&entry.items.length!==3&&<p className="text-xs">Formato não suportado. Conferência manual necessária.</p>}
        </div>}
        <ul className="space-y-2 text-sm">{entry.items.map(item=><li key={item.id} className="flex flex-wrap items-center gap-2">
          <span aria-hidden="true">{ICON[item.status]||'⏳'}</span><span className="font-medium">{item.name}</span>
          <span className="text-xs text-muted-foreground">{item.status==='received'?'Recebido — conferência visual':LABEL[item.status]||item.status}{item.note?' · '+item.note:''}</span>
          {item.href&&<a href={item.href} target="_blank" rel="noreferrer" download className={buttonVariants({variant:'outline',size:'sm'})}>Baixar</a>}
        </li>)}</ul>
        <p className="text-xs text-muted-foreground">A validação jurídica e o lançamento no GoJus ainda dependem de conferência humana.</p>
      </section>)}
      {cases.map((entry) => {
        const done = entry.items.filter((item) => item.status === 'received').length;
        return (
          <div key={entry.name} className="rounded-lg border p-3">
            <p className="font-medium">{entry.name} <span className="text-sm text-muted-foreground">· {done} de {entry.items.length} recebidos</span></p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {entry.items.map((item) => (
                <li key={item.label} className="flex flex-wrap items-center gap-2">
                  <span aria-hidden="true">{ICON[item.status] || '⏳'}</span>
                  <span className="font-medium">{item.label}</span>
                  <span className="text-xs text-muted-foreground">{LABEL[item.status] || item.status}{item.rule ? ` · ${item.rule}` : ''}</span>
                  {item.files.map((file, index) => (
                    <a key={file.messageId} href={file.href} target="_blank" rel="noreferrer" download
                      className={buttonVariants({ variant: 'outline', size: 'sm', className: 'h-7 px-2' })} title={file.note || undefined}>
                      arquivo {index + 1}{file.status !== 'received' ? ` (${LABEL[file.status] || file.status})` : ''}
                    </a>
                  ))}
                </li>
              ))}
            </ul>
            {entry.others.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Outros arquivos: {entry.others.map((other) => other.detectedType || 'arquivo').join(', ')}
              </p>
            )}
          </div>
        );
      })}
      <p className="text-xs text-muted-foreground">O backup operacional de WhatsApp fica disponível por até 30 dias; o chat do site, por 7 dias. A disponibilidade na Meta é independente. Baixe o que precisar manter.</p>
    </div>
  );
}

'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight, LockKeyhole, ShieldCheck } from 'lucide-react';
import {useState,useRef,useEffect} from 'react';
import {toast} from 'sonner';

function GoJusLogo() {
  return <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl border bg-white p-1">
    {/* Logo cropped from the supplied GoJus login screenshot. No remote requests. */}
    <img src="/gojus-logo.svg" alt="GoJus" className="h-auto w-full" width={95} height={36} />
  </span>;
}
type LoginStatus={available:boolean;testAvailable:boolean;url:string;saved:boolean;status:string;testedAt:string|null};
export function GoJusIntegrationCard() {
  const [open,setOpen]=useState(false);
  const [status,setStatus]=useState<LoginStatus|null>(null);
  const [busy,setBusy]=useState(false);
  const email=useRef<HTMLInputElement>(null);
  const password=useRef<HTMLInputElement>(null);
  const label=status?.status==='login_ok'?'Login validado':status?.status==='manual_required'?'Revisão necessária':status?.status==='login_failed'?'Falha no login':status?.status==='unavailable'?'Teste indisponível':status?.saved?'Credencial salva':'Desconectado';
  useEffect(()=>{if(!open)return;let active=true;setStatus(null);
    fetch('/api/integrations/gojus',{cache:'no-store'}).then(async r=>r.ok?await r.json():null).then(data=>{if(active)setStatus(data);}).catch(()=>{if(active)setStatus(null);});
    return()=>{active=false;};
  },[open]);
  async function act(action:'save'|'test'|'remove'){
    if(busy||!status)return;
    if(action==='save'&&(!status.available||!email.current?.value||!password.current?.value)){toast.error('Informe o e-mail e a senha da conta autorizada.');return;}
    if(action==='test'&&(!status.saved||!status.testAvailable))return;
    if(action==='remove'&&!window.confirm('Remover a credencial local do GoJus?'))return;
    const body=action==='save'?{action,url:status.url,email:email.current?.value,password:password.current?.value}:{action};
    setBusy(true);
    try{
      const res=await fetch('/api/integrations/gojus',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store'});
      const data=await res.json();
      if(!res.ok)throw Error(data.error||'Operação indisponível.');
      setStatus(data);toast.success(action==='save'?'Credencial salva. Teste o login.':action==='remove'?'Credencial removida.':data.status==='login_ok'?'Login validado. Sessão encerrada.':'Teste concluído; confira o status.');
    }catch(e){toast.error(e instanceof Error?e.message:'Operação indisponível.');}
    finally{if(password.current)password.current.value='';if(email.current)email.current.value='';setBusy(false);}
  }
  return <section id="gojus-connection" className="scroll-mt-24 px-6 pb-6 max-w-7xl">
    <Dialog open={open} onOpenChange={v=>{if(!busy)setOpen(v);}}>
      <DialogTrigger asChild>
        <button type="button" className="flex w-full max-w-md items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <GoJusLogo />
          <span className="min-w-0 flex-1"><span className="block font-semibold">GoJus</span><span className="block text-xs text-muted-foreground">Acesso por navegador</span></span>
          <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{label}</span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true"/>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader className="pr-6 text-left">
          <div className="flex items-center gap-3">
            <GoJusLogo/>
            <div className="flex-1">
              <DialogTitle>Integração GoJus</DialogTitle>
              <DialogDescription className="mt-1">Configuração de acesso pelo navegador</DialogDescription>
            </div>
            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">{label}</span>
          </div>
        </DialogHeader>
        <div className="space-y-4 border-t pt-4">
          <p className="rounded-md border p-3 text-sm text-muted-foreground">{status?.available?'Use somente uma conta autorizada. O teste abre uma sessão temporária, encerra o navegador e não cadastra clientes.':'Configuração bloqueada até a autorização do ambiente. Não informe credenciais.'}</p>
          <fieldset disabled={!status?.available||busy} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="gojus-login-url">URL de acesso</Label><Input id="gojus-login-url" type="url" value={status?.url||""} readOnly autoComplete="off" /></div>
            <div className="space-y-2"><Label htmlFor="gojus-login-email">E-mail do robô</Label><Input id="gojus-login-email" ref={email} type="email" placeholder="E-mail da conta autorizada" autoComplete="off" /></div>
            <div className="space-y-2"><Label htmlFor="gojus-login-password">Senha</Label><div className="relative"><Input id="gojus-login-password" ref={password} type="password" placeholder="••••••••••••" autoComplete="new-password" className="pr-10"/><LockKeyhole className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true"/></div></div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Button type="button" variant="outline" disabled={!status?.saved||!status?.testAvailable||busy} onClick={()=>void act("test")}>Testar conexão</Button><Button type="button" disabled={!status?.available||busy} onClick={()=>void act("save")}>Salvar integração</Button></div>
          </fieldset>
          {status?.saved&&<Button type="button" variant="outline" size="sm" disabled={busy} onClick={()=>void act("remove")}>Remover credencial local</Button>}
          {status?.testedAt&&<p className="text-xs text-muted-foreground">Último teste: {new Date(status.testedAt).toLocaleString("pt-BR")}. Não representa sessão ativa.</p>}
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" aria-hidden="true"/> Credenciais criptografadas. Nunca são devolvidas ao navegador.</p>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}

'use client';

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ChevronRight, LockKeyhole, ShieldCheck } from 'lucide-react';

function GoJusLogo() {
  return <span className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl border bg-white p-1">
    {/* Logo cropped from the supplied GoJus login screenshot. No remote requests. */}
    <img src="/gojus-logo.svg" alt="GoJus" className="h-auto w-full" width={95} height={36} />
  </span>;
}
export function GoJusIntegrationCard() {
  return <section id="gojus-connection" className="scroll-mt-24 px-6 pb-6 max-w-7xl">
    <Dialog>
      <DialogTrigger asChild>
        <button type="button" className="flex w-full max-w-md items-center gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <GoJusLogo />
          <span className="min-w-0 flex-1"><span className="block font-semibold">GoJus</span><span className="block text-xs text-muted-foreground">Acesso por navegador</span></span>
          <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">Desconectado</span>
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
            <span className="rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground">Desconectado</span>
          </div>
        </DialogHeader>
        <div className="space-y-4 border-t pt-4">
          <p className="rounded-md border p-3 text-sm text-muted-foreground">Configuração em preparação. O armazenamento seguro e o teste de login serão habilitados somente após a homologação do robô. Não informe credenciais nesta etapa.</p>
          <fieldset disabled className="space-y-4">
            <div className="space-y-2"><Label htmlFor="gojus-login-url">URL de acesso</Label><Input id="gojus-login-url" type="url" placeholder="Endereço de login do GoJus" autoComplete="off" /></div>
            <div className="space-y-2"><Label htmlFor="gojus-login-email">E-mail do robô</Label><Input id="gojus-login-email" type="email" placeholder="E-mail da conta autorizada" autoComplete="off" /></div>
            <div className="space-y-2"><Label htmlFor="gojus-login-password">Senha</Label><div className="relative"><Input id="gojus-login-password" type="password" placeholder="••••••••••••" autoComplete="new-password" className="pr-10"/><LockKeyhole className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true"/></div></div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2"><Button type="button" variant="outline" disabled>Testar conexão</Button><Button type="button" disabled>Salvar integração</Button></div>
          </fieldset>
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="h-4 w-4" aria-hidden="true"/> Credenciais serão armazenadas de forma criptografada na etapa autorizada.</p>
        </div>
      </DialogContent>
    </Dialog>
  </section>;
}

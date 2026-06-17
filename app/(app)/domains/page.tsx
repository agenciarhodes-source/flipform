'use client';

import { useEffect, useState } from 'react';
import { Globe2, Plus, RefreshCw, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatDate } from '@/lib/utils';

type Domain = {
  id: string; domain: string; status: string; verificationStatus: string; sslStatus: string; isPrimary: boolean;
  verificationType?: string | null; verificationDomain?: string | null; verificationValue?: string | null; dnsTarget?: string | null; lastCheckedAt?: string | null;
};

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [appDomain, setAppDomain] = useState('app.flipform.com.br');
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const res = await fetch('/api/domains');
    const data = await res.json();
    setDomains(data.domains || []);
    setAppDomain(data.appDomain || 'app.flipform.com.br');
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/domains', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar domínio.');
      toast.success('Domínio cadastrado. Configure o DNS e verifique quando estiver propagado.');
      setDomain('');
      load();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const action = async (url: string, success: string, method = 'POST') => {
    const res = await fetch(url, { method });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || 'Ação não concluída.');
    toast.success(success); load();
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl lg:text-3xl font-bold">Domínios</h1>
        <p className="text-muted-foreground text-sm">Configure um subdomínio próprio para publicar automaticamente os links dos seus formulários.</p>
      </div>

      <Card className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground">Essa configuração não altera o acesso à plataforma. Seu painel continua em {appDomain}. O domínio configurado aqui será usado apenas para os links públicos dos formulários.</p>
        <p className="text-sm">Se você configurar <strong>leads.suaempresa.com.br</strong>, seus formulários serão publicados como <strong>leads.suaempresa.com.br/nome-do-formulario</strong>.</p>
        <p className="text-sm text-muted-foreground">Esse domínio será usado nos links públicos dos seus formulários. Para campanhas da Meta, recomendamos verificar esse domínio no Gerenciador de Negócios da Meta e usar o Pixel configurado em Integrações.</p>
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
          <div className="font-medium text-foreground">Cloudflare/DNS</div>
          <p>Cloudflare &gt; Seu domínio &gt; DNS &gt; Records &gt; Add record.</p>
          <p>Crie um CNAME com Nome: leads, Destino: valor informado pelo FlipForm/Vercel, TTL: Auto e Proxy status: DNS only.</p>
          <p>Use DNS only, nuvem cinza, durante a verificação do domínio. Algumas plataformas podem ter problemas para validar DNS/SSL quando o proxy da Cloudflare está ativo.</p>
        </div>
      </Card>

      <Card className="p-5">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="flex-1 min-w-72">
            <Label>Subdomínio</Label>
            <Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="leads.suaempresa.com.br" />
          </div>
          <Button onClick={add} disabled={saving || !domain.trim()}><Plus className="w-4 h-4 mr-2" />Adicionar domínio</Button>
        </div>
      </Card>

      {loading ? <div className="text-muted-foreground">Carregando...</div> : domains.length === 0 ? (
        <Card className="p-12 text-center">
          <Globe2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-heading font-semibold text-lg mb-1">Você ainda não configurou nenhum domínio.</h3>
          <p className="text-sm text-muted-foreground mb-4">Cadastre um subdomínio, como leads.suaempresa.com.br, para gerar automaticamente os links dos seus formulários com o seu próprio domínio.</p>
          <Button onClick={() => document.querySelector<HTMLInputElement>('input[placeholder="leads.suaempresa.com.br"]')?.focus()}>Adicionar domínio</Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {domains.map((d) => (
            <Card key={d.id} className="p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-heading font-semibold flex items-center gap-2"><Globe2 className="w-4 h-4" />{d.domain}{d.isPrimary && <Badge>Principal</Badge>}</div>
                  <div className="text-xs text-muted-foreground">Preview: https://{d.domain}/nome-do-formulario</div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Badge variant={d.status === 'active' ? 'default' : 'secondary'}>Status: {d.status}</Badge>
                  <Badge variant={d.verificationStatus === 'verified' ? 'default' : 'secondary'}>Verificação: {d.verificationStatus}</Badge>
                  <Badge variant={d.sslStatus === 'active' ? 'default' : 'secondary'}>SSL: {d.sslStatus}</Badge>
                </div>
              </div>
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div className="font-medium mb-2">Instruções DNS</div>
                <div className="grid md:grid-cols-3 gap-2 text-xs">
                  <div><span className="text-muted-foreground">Tipo</span><div>{d.verificationType || 'CNAME'}</div></div>
                  <div><span className="text-muted-foreground">Nome/Host</span><div>{d.verificationDomain || d.domain}</div></div>
                  <div><span className="text-muted-foreground">Valor/Destino</span><div>{d.verificationValue || d.dnsTarget || 'cname.vercel-dns.com'}</div></div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 flex-wrap text-xs text-muted-foreground">
                <span>Última verificação: {d.lastCheckedAt ? formatDate(d.lastCheckedAt) : 'Nunca'}</span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => action(`/api/domains/${d.id}/verify`, 'Verificação executada.')}><RefreshCw className="w-3 h-3 mr-1" />Verificar agora</Button>
                  <Button size="sm" variant="outline" disabled={d.isPrimary} onClick={() => action(`/api/domains/${d.id}/primary`, 'Domínio principal atualizado.')}><Star className="w-3 h-3 mr-1" />Tornar principal</Button>
                  <Button size="sm" variant="outline" onClick={() => action(`/api/domains/${d.id}`, 'Domínio excluído.', 'DELETE')}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
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

function normalizeRootDomain(value: string) {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
    return url.hostname.replace(/^www\./, '');
  } catch {
    return trimmed.replace(/^https?:\/\//, '').split('/')[0].split('?')[0].split('#')[0].replace(/^www\./, '');
  }
}

function normalizeSubdomain(value: string) {
  return value.trim().toLowerCase();
}

function splitDomain(domain: string) {
  const [subdomain, ...rootParts] = domain.split('.');
  return { subdomain, rootDomain: rootParts.join('.') };
}

export default function DomainsPage() {
  const [domains, setDomains] = useState<Domain[]>([]);
  const [appDomain, setAppDomain] = useState('app.flipform.com.br');
  const [rootDomain, setRootDomain] = useState('');
  const [subdomain, setSubdomain] = useState('leads');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const normalizedRootDomain = useMemo(() => normalizeRootDomain(rootDomain), [rootDomain]);
  const normalizedSubdomain = useMemo(() => normalizeSubdomain(subdomain || 'leads'), [subdomain]);
  const previewDomain = normalizedRootDomain && normalizedSubdomain ? `${normalizedSubdomain}.${normalizedRootDomain}` : `leads.seudominio.com.br`;

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
      const res = await fetch('/api/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rootDomain: normalizedRootDomain, subdomain: normalizedSubdomain }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar domínio.');
      toast.success('Domínio adicionado ao FlipForm. Agora configure o DNS para concluir a verificação.');
      setRootDomain('');
      setSubdomain('leads');
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
        <p className="text-muted-foreground text-sm">Configure um subdomínio próprio para gerar automaticamente os links públicos dos seus formulários.</p>
      </div>

      <Card className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground">Seu painel continua em {appDomain}. O domínio configurado aqui será usado apenas nos links públicos dos formulários.</p>
        <p className="text-sm text-muted-foreground">Esse domínio será usado nos links públicos dos seus formulários. Para campanhas da Meta, recomendamos verificar esse domínio no Gerenciador de Negócios da Meta e usar o Pixel configurado em Integrações.</p>
      </Card>

      <Card className="p-5 space-y-5">
        <div>
          <h2 className="font-heading text-lg font-semibold">Adicionar domínio de formulário</h2>
          <p className="text-sm text-muted-foreground">Informe o domínio principal da sua empresa e escolha o subdomínio que será usado para captação.</p>
          <p className="text-sm text-muted-foreground">O FlipForm irá gerar automaticamente um subdomínio para publicar seus formulários.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <div className="space-y-2">
            <Label>Domínio principal</Label>
            <Input value={rootDomain} onChange={(e) => setRootDomain(e.target.value)} placeholder="seudominio.com.br" />
          </div>
          <div className="space-y-2">
            <Label>Subdomínio</Label>
            <Input value={subdomain} onChange={(e) => setSubdomain(e.target.value)} placeholder="leads" />
            <p className="text-xs text-muted-foreground">Recomendamos usar leads para links de captação.</p>
          </div>
        </div>
        <div className="rounded-md bg-muted/40 p-3 text-sm">
          <div className="text-muted-foreground">Seu link ficará assim:</div>
          <div className="font-medium break-all">https://{previewDomain}/nome-do-formulario</div>
        </div>
        <Button onClick={add} disabled={saving || !normalizedRootDomain || !normalizedSubdomain}>
          <Plus className="w-4 h-4 mr-2" />Adicionar domínio
        </Button>
      </Card>

      {loading ? <div className="text-muted-foreground">Carregando...</div> : domains.length === 0 ? (
        <Card className="p-12 text-center">
          <Globe2 className="w-10 h-10 mx-auto text-muted-foreground mb-3" />
          <h3 className="font-heading font-semibold text-lg mb-1">Você ainda não configurou nenhum domínio.</h3>
          <p className="text-sm text-muted-foreground mb-4">Cadastre o domínio principal da sua empresa e use um subdomínio, como leads, para gerar automaticamente os links dos seus formulários.</p>
          <Button onClick={() => document.querySelector<HTMLInputElement>('input[placeholder="seudominio.com.br"]')?.focus()}>Adicionar domínio</Button>
        </Card>
      ) : (
        <div className="space-y-4">
          {domains.map((d) => {
            const parts = splitDomain(d.domain);
            const dnsType = d.verificationType || 'CNAME';
            const dnsHost = dnsType.toUpperCase() === 'CNAME' ? parts.subdomain : d.verificationDomain || parts.subdomain;
            const dnsTarget = d.verificationValue || d.dnsTarget || 'cname.vercel-dns.com';
            return (
              <Card key={d.id} className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <div className="font-heading font-semibold flex items-center gap-2"><Globe2 className="w-4 h-4" />{d.domain}{d.isPrimary && <Badge>Principal</Badge>}</div>
                    <div className="text-xs text-muted-foreground">Domínio principal informado: {parts.rootDomain}</div>
                    <div className="text-xs text-muted-foreground">Subdomínio usado: {parts.subdomain}</div>
                    <div className="text-xs text-muted-foreground">Todos os formulários publicados nesta conta usarão esse domínio automaticamente.</div>
                    <div className="text-xs text-muted-foreground">Exemplos: https://{d.domain}/orcamento · https://{d.domain}/campanha-junho · https://{d.domain}/avaliacao</div>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Badge variant={d.status === 'active' ? 'default' : 'secondary'}>Status: {d.status}</Badge>
                    <Badge variant={d.verificationStatus === 'verified' ? 'default' : 'secondary'}>Verificação: {d.verificationStatus}</Badge>
                    <Badge variant={d.sslStatus === 'active' ? 'default' : 'secondary'}>SSL: {d.sslStatus}</Badge>
                  </div>
                </div>
                <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-3">
                  <div>
                    <div className="font-medium">Próximo passo: configurar DNS</div>
                    <p className="text-xs text-muted-foreground">Para ativar esse domínio, crie o registro abaixo no provedor onde o domínio está hospedado.</p>
                  </div>
                  <div className="grid md:grid-cols-5 gap-2 text-xs">
                    <div><span className="text-muted-foreground">Tipo</span><div>{dnsType}</div></div>
                    <div><span className="text-muted-foreground">Nome/Host</span><div>{dnsHost}</div></div>
                    <div className="md:col-span-2"><span className="text-muted-foreground">Destino</span><div className="break-all">{dnsTarget}</div></div>
                    <div><span className="text-muted-foreground">TTL</span><div>Auto</div></div>
                  </div>
                  <p className="text-xs text-muted-foreground">Proxy: DNS only, se estiver usando Cloudflare.</p>
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
            );
          })}
        </div>
      )}
    </div>
  );
}

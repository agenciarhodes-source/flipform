'use client';

import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Globe2, HelpCircle, Plus, RefreshCw, Star, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn, formatDateTime } from '@/lib/utils';

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

type DomainConnectionStatus = {
  title: string;
  description: string;
  icon: typeof CheckCircle2;
  className: string;
  iconClassName: string;
};

function getDomainConnectionStatus(domain: Domain): DomainConnectionStatus {
  if (domain.status === 'error' || domain.verificationStatus === 'failed' || domain.sslStatus === 'failed') {
    return {
      title: 'Erro na conexão',
      description: 'Revise o DNS ou tente verificar novamente.',
      icon: AlertTriangle,
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
      iconClassName: 'text-destructive',
    };
  }

  if (domain.status === 'active' && domain.verificationStatus === 'verified' && domain.sslStatus === 'active') {
    return {
      title: 'Conexão ativa',
      description: 'Domínio verificado e SSL ativo.',
      icon: CheckCircle2,
      className: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-200',
      iconClassName: 'text-emerald-600 dark:text-emerald-400',
    };
  }

  if (domain.verificationStatus === 'verified' && domain.sslStatus !== 'active') {
    return {
      title: 'DNS verificado',
      description: 'Aguardando ativação do SSL.',
      icon: Clock3,
      className: 'border-sky-200 bg-sky-50 text-sky-900 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-200',
      iconClassName: 'text-sky-600 dark:text-sky-400',
    };
  }

  if (domain.verificationStatus === 'pending') {
    return {
      title: 'Aguardando DNS',
      description: 'Crie o CNAME informado e clique em Verificar agora.',
      icon: Clock3,
      className: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200',
      iconClassName: 'text-amber-600 dark:text-amber-400',
    };
  }

  return {
    title: 'Status em análise',
    description: 'Clique em Verificar agora para atualizar.',
    icon: HelpCircle,
    className: 'border-muted bg-muted/40 text-foreground',
    iconClassName: 'text-muted-foreground',
  };
}

function isDomainActive(domain: Domain) {
  return domain.status === 'active' && domain.verificationStatus === 'verified' && domain.sslStatus === 'active';
}

function isDomainError(domain: Domain) {
  return domain.status === 'error' || domain.verificationStatus === 'failed' || domain.sslStatus === 'failed';
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

  const verifyDomain = async (domain: Domain) => {
    const res = await fetch(`/api/domains/${domain.id}/verify`, { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || 'Não foi possível verificar o domínio. Revise o DNS e tente novamente.');
    if (data.domain && isDomainActive(data.domain)) toast.success('Domínio verificado com sucesso.');
    else if (data.domain && isDomainError(data.domain)) toast.error('Não foi possível verificar o domínio. Revise o DNS e tente novamente.');
    else toast.warning('Domínio ainda aguardando configuração DNS.');
    if (data.domain) setDomains((current) => current.map((item) => (item.id === data.domain.id ? data.domain : item)));
    load();
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div>
        <h1 className="font-heading text-2xl lg:text-3xl font-bold">Domínios</h1>
        <p className="text-muted-foreground text-sm">Configure um subdomínio próprio para gerar automaticamente os links públicos dos seus formulários.</p>
      </div>

      <Card className="p-5 space-y-3">
        <p className="text-sm text-muted-foreground">Seu painel continua em {appDomain}. O domínio configurado aqui será usado apenas nos links públicos dos formulários.</p>
        <p className="text-sm text-muted-foreground">Para campanhas da Meta, recomendamos verificar esse domínio no Gerenciador de Negócios da Meta e usar o Pixel configurado em Integrações.</p>
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
            const connection = getDomainConnectionStatus(d);
            const StatusIcon = connection.icon;
            const domainActive = isDomainActive(d);
            return (
              <Card key={d.id} className="p-5 space-y-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="space-y-1">
                    <div className="font-heading font-semibold flex items-center gap-2"><Globe2 className="w-4 h-4" />{d.domain}{d.isPrimary && <Badge>Principal</Badge>}</div>
                    <div className="text-xs text-muted-foreground">Domínio principal informado: {parts.rootDomain}</div>
                    <div className="text-xs text-muted-foreground">Subdomínio usado: {parts.subdomain}</div>
                    <div className="text-xs text-muted-foreground">{domainActive ? 'Todos os formulários publicados nesta conta usam esse domínio automaticamente.' : 'Após a verificação do DNS e ativação do SSL, os formulários desta conta passarão a usar esse domínio automaticamente.'}</div>
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
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <span className="text-xs text-muted-foreground">Última verificação: {d.lastCheckedAt ? formatDateTime(d.lastCheckedAt) : 'nunca'}</span>
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                    <div className={cn('flex min-w-0 items-start gap-2 rounded-md border px-3 py-2 text-sm', connection.className)} aria-label={`Conexão do domínio: ${connection.title}`}>
                      <StatusIcon className={cn('mt-0.5 h-4 w-4 shrink-0', connection.iconClassName)} aria-hidden="true" />
                      <div className="min-w-0">
                        <div className="font-medium leading-none">{connection.title}</div>
                        <div className="mt-1 text-xs opacity-80">{connection.description}</div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:justify-end">
                      <Button size="sm" variant="outline" onClick={() => verifyDomain(d)}><RefreshCw className="w-3 h-3 mr-1" />Verificar agora</Button>
                      <Button size="sm" variant="outline" disabled={d.isPrimary} onClick={() => action(`/api/domains/${d.id}/primary`, 'Domínio principal atualizado.')}><Star className="w-3 h-3 mr-1" />Tornar principal</Button>
                      <Button size="sm" variant="outline" onClick={() => action(`/api/domains/${d.id}`, 'Domínio excluído.', 'DELETE')}><Trash2 className="w-3 h-3 text-destructive" /></Button>
                    </div>
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

'use client';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Globe2, RefreshCw, Trash2, Plus, AlertTriangle } from 'lucide-react';

export default function DomainsPage() {
  const [domains, setDomains] = useState<any[]>([]);
  const [forms, setForms] = useState<any[]>([]);
  const [domain, setDomain] = useState('');
  const [loading, setLoading] = useState(true);
  const [routeDraft, setRouteDraft] = useState<Record<string, any>>({});
  const load = async () => {
    const data = await fetch('/api/form-domains').then((r) => r.json());
    setDomains(data.domains || []); setForms(data.forms || []); setLoading(false);
  };
  useEffect(() => { load(); }, []);
  const add = async () => {
    const res = await fetch('/api/form-domains', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ domain }) });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'Erro ao adicionar domínio');
    if (data.warning) toast.warning(data.warning);
    if (data.domain?.verificationReason) toast.info(data.domain.verificationReason);
    setDomain(''); toast.success('Domínio cadastrado'); load();
  };
  const verify = async (id: string) => {
    const res = await fetch(`/api/form-domains/${id}/verify`, { method: 'POST' });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'Não foi possível verificar domínio');
    toast.success(data.domain?.verificationStatus === 'verified' ? 'Domínio verificado' : 'Domínio pendente de DNS'); load();
  };
  const remove = async (id: string) => {
    if (!confirm('Excluir domínio? A remoção na Vercel deve ser feita manualmente se necessário.')) return;
    const res = await fetch(`/api/form-domains/${id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error || 'Erro ao excluir');
    toast.success('Domínio excluído'); load();
  };
  const saveRoute = async (id: string) => {
    const draft = routeDraft[id] || {};
    const res = await fetch(`/api/form-domains/${id}/routes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(draft) });
    const data = await res.json();
    if (!res.ok) return toast.error(data.error || 'Erro ao salvar rota');
    toast.success('Rota vinculada'); load();
  };
  return <div className="p-4 lg:p-8 space-y-6">
    <div><h1 className="font-heading text-2xl lg:text-3xl font-bold">Domínios de Formulário</h1><p className="text-muted-foreground text-sm">Use um subdomínio próprio para publicar os formulários criados no FlipForm.</p></div>
    <Card className="p-5 space-y-3"><div className="flex gap-2 items-start"><Globe2 className="w-5 h-5 text-blue-600 mt-1"/><div><p className="font-medium">Essa configuração não altera o acesso à plataforma.</p><p className="text-sm text-muted-foreground">Seu painel continua em app.flipform.com.br. O domínio personalizado será usado apenas para os links públicos dos formulários.</p></div></div><p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 p-3 rounded-md">Para melhor mensuração na Meta, verifique esse domínio também no Gerenciador de Negócios da Meta e associe os eventos ao Pixel configurado em Integrações.</p></Card>
    <Card className="p-5"><h2 className="font-semibold mb-3">Adicionar domínio</h2><div className="flex flex-col sm:flex-row gap-2"><Input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="leads.seudominio.com.br"/><Button onClick={add}><Plus className="w-4 h-4 mr-2"/>Adicionar domínio</Button></div></Card>
    {loading ? <p>Carregando...</p> : domains.length === 0 ? <Card className="p-10 text-center"><h3 className="font-semibold">Você ainda não cadastrou nenhum domínio de formulário.</h3><p className="text-sm text-muted-foreground mt-1">Use um subdomínio próprio, como leads.suaempresa.com.br, para publicar formulários com mais confiança e melhorar a mensuração das campanhas.</p></Card> : domains.map((d) => <Card key={d.id} className="p-5 space-y-4">
      <div className="flex flex-wrap justify-between gap-3"><div><h3 className="font-semibold">{d.domain}</h3><div className="flex gap-2 mt-2"><Badge>{d.status}</Badge><Badge variant="outline">verificação: {d.verificationStatus}</Badge><Badge variant="outline">SSL: {d.sslStatus}</Badge></div><p className="text-xs text-muted-foreground mt-2">Última verificação: {d.lastCheckedAt ? new Date(d.lastCheckedAt).toLocaleString() : 'nunca'}</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => verify(d.id)}><RefreshCw className="w-4 h-4 mr-2"/>Verificar agora</Button><Button variant="destructive" onClick={() => remove(d.id)}><Trash2 className="w-4 h-4"/></Button></div></div>
      {d.verificationReason && <p className="text-sm text-amber-700 flex gap-2"><AlertTriangle className="w-4 h-4"/>{d.verificationReason}</p>}
      {d.dnsInstructions?.length > 0 && <div className="border rounded-md p-3"><p className="font-medium mb-2">Instruções DNS</p>{d.dnsInstructions.map((r: any, i: number) => <div key={i} className="grid md:grid-cols-3 gap-2 text-sm py-1"><span>Tipo: <b>{r.type}</b></span><span>Nome/Host: <b>{r.host}</b></span><span>Valor/Destino: <b>{r.value}</b></span></div>)}<p className="text-xs text-muted-foreground mt-2">Após configurar o DNS, clique em Verificar agora.</p></div>}
      <div className="border rounded-md p-3 space-y-3"><p className="font-medium">Vincular formulário</p><div className="grid md:grid-cols-4 gap-2"><Select onValueChange={(v) => setRouteDraft({ ...routeDraft, [d.id]: { ...(routeDraft[d.id] || {}), formId: v } })}><SelectTrigger><SelectValue placeholder="Formulário" /></SelectTrigger><SelectContent>{forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}</SelectContent></Select><Input placeholder="path: campanha-x ou /" onChange={(e) => setRouteDraft({ ...routeDraft, [d.id]: { ...(routeDraft[d.id] || {}), path: e.target.value } })}/><Button onClick={() => saveRoute(d.id)}>Salvar rota</Button></div><div className="text-sm text-muted-foreground space-y-1">{d.routes?.map((r: any) => <p key={r.id}>https://{d.domain}{r.path === '/' ? '' : r.path} → {r.form?.name}</p>)}</div></div>
    </Card>)}
  </div>;
}

'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Copy, CopyPlus, Plus, ExternalLink, Edit, Trash2, Workflow, AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';
import { formatLeadSource } from '@/lib/leads';

export default function FormsPage() {
  const [forms, setForms] = useState<any[]>([]);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [filterPipeline, setFilterPipeline] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);

  const load = () => {
    const qs = filterPipeline && filterPipeline !== 'all' ? `?pipelineId=${filterPipeline}` : '';
    Promise.all([
      fetch(`/api/forms${qs}`).then((r) => r.json()),
      fetch('/api/pipelines?includeArchived=1').then((r) => r.json()),
    ]).then(([f, p]) => {
      setForms(f.forms || []);
      setPipelines(p.pipelines || []);
      setLoading(false);
    });
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filterPipeline]);

  const copyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    toast.success('Link copiado!');
  };

  const duplicateForm = async (form: any) => {
    const confirmed = window.confirm(`Duplicar o formulário “${form.name}”?`);
    if (!confirmed || duplicatingId) return;
    setDuplicatingId(form.id);
    try {
      const res = await fetch(`/api/forms/${form.id}/duplicate`, { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Não foi possível duplicar o formulário.');
      toast.success(`Formulário “${data.form.name}” duplicado com sucesso.`);
      if (data.warning) toast.warning(data.warning);
      load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível duplicar o formulário.');
    } finally {
      setDuplicatingId(null);
    }
  };

  const deleteForm = async (id: string) => {
    if (!confirm('Excluir formulário? Leads associados permanecem.')) return;
    const res = await fetch(`/api/forms/${id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Formulário excluído'); load(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro'); }
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-heading text-2xl lg:text-3xl font-bold">Formulários</h1>
          <p className="text-muted-foreground text-sm">Crie formulários e capture leads automaticamente.</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filterPipeline} onValueChange={setFilterPipeline}>
            <SelectTrigger className="w-56">
              <div className="flex items-center gap-2"><Workflow className="w-4 h-4 text-muted-foreground" /><SelectValue placeholder="Filtrar por pipeline" /></div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os pipelines</SelectItem>
              {pipelines.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}{p.isArchived ? ' (arquivado)' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {forms.some((f) => f.canEdit) && <Link href="/forms/new"><Button><Plus className="w-4 h-4 mr-2" />Novo formulário</Button></Link>}
        </div>
      </div>

      {loading ? <div className="text-muted-foreground">Carregando...</div> : forms.length === 0 ? (
        <Card className="p-12 text-center">
          <h3 className="font-heading font-semibold text-lg mb-1">Nenhum formulário ainda</h3>
          <p className="text-sm text-muted-foreground mb-4">Crie seu primeiro formulário e comece a captar leads.</p>
          <Link href="/forms/new"><Button><Plus className="w-4 h-4 mr-2" />Criar formulário</Button></Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map((f) => {
            const pipelineArchived = f.pipeline?.isArchived;
            const stageArchived = f.initialStage?.isArchived;
            const hasIssue = pipelineArchived || stageArchived;
            return (
              <Card key={f.id} className="p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-heading font-semibold truncate">{f.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{f.publicTitle}</div>
                  </div>
                  <Badge variant={f.isActive ? 'default' : 'secondary'} className={f.isActive ? 'bg-emerald-500' : ''}>
                    {f.isActive ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>

                {f.pipeline && (
                  <div className="rounded-md bg-muted/40 p-2 mb-3 text-xs space-y-1">
                    <div className="flex items-center gap-1.5">
                      <Workflow className="w-3 h-3 text-muted-foreground" />
                      <span className="font-medium">{f.pipeline.name}</span>
                      {pipelineArchived && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 h-4 px-1">arquivado</Badge>}
                    </div>
                    {f.initialStage && (
                      <div className="flex items-center gap-1.5 ml-4">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: f.initialStage.color }} />
                        <span>{f.initialStage.name}</span>
                        {stageArchived && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 h-4 px-1">arquivada</Badge>}
                      </div>
                    )}
                  </div>
                )}

                {hasIssue && (
                  <div className="rounded-md bg-amber-50 border border-amber-200 p-2 mb-3 text-xs text-amber-800 flex items-start gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{pipelineArchived ? 'Pipeline arquivado.' : 'Etapa inicial arquivada.'} Submissões públicas estão temporariamente bloqueadas.</span>
                  </div>
                )}

                <div className="text-xs text-muted-foreground mb-3">Origem: <span className="font-medium text-foreground">{formatLeadSource(f.leadSource || 'formulario')}</span></div>
                <div className="flex gap-4 text-xs text-muted-foreground mb-4">
                  <span>{f._count.fields} campos</span>
                  <span>{f._count.leads} leads</span>
                  <span>{formatDate(f.createdAt)}</span>
                </div>
                <div className="rounded-md bg-muted/40 p-2 mb-3 text-xs break-all space-y-1.5">
                  {f.publicUrlState === 'custom_pending' ? (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Link ativo:</span>
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">Domínio pendente</Badge>
                      </div>
                      <div className="font-medium">{f.publicUrl}</div>
                      {f.customDomainUrl && (
                        <div className="text-muted-foreground">
                          Domínio personalizado pendente: <span className="font-medium text-foreground">{f.customDomainUrl}</span>
                        </div>
                      )}
                      <div className="text-muted-foreground">O domínio personalizado ainda está aguardando verificação em Domínios.</div>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-medium">{f.publicUrl}</div>
                        {f.publicUrlState === 'custom_active' && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">Domínio ativo</Badge>}
                      </div>
                      <div className="text-muted-foreground">{f.publicUrlLabel || 'Link padrão do FlipForm.'}</div>
                    </>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="outline" onClick={() => copyLink(f.publicUrl)} className="flex-1">
                    <Copy className="w-3 h-3 mr-1.5" />Link
                  </Button>
                  <Link href={f.publicUrl || `/f/${f.slug}`} target="_blank"><Button size="sm" variant="outline"><ExternalLink className="w-3 h-3" /></Button></Link>
                  {f.canDuplicate && (
                    <Button size="sm" variant="outline" title="Duplicar formulário" aria-label={`Duplicar formulário ${f.name}`} onClick={() => duplicateForm(f)} disabled={duplicatingId === f.id}>
                      {duplicatingId === f.id ? <Loader2 className="w-3 h-3 animate-spin" /> : <CopyPlus className="w-3 h-3" />}
                    </Button>
                  )}
                  {f.canEdit && <Link href={`/forms/${f.id}/edit`}><Button size="sm" variant="outline"><Edit className="w-3 h-3" /></Button></Link>}
                  {f.canDelete && <Button size="sm" variant="outline" onClick={() => deleteForm(f.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

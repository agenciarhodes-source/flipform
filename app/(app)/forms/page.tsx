'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Plus, ExternalLink, Edit, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/utils';

export default function FormsPage() {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [origin, setOrigin] = useState('');

  useEffect(() => { setOrigin(window.location.origin); }, []);

  const load = () => {
    fetch('/api/forms').then((r) => r.json()).then((d) => { setForms(d.forms); setLoading(false); });
  };
  useEffect(() => { load(); }, []);

  const copyLink = (slug: string) => {
    navigator.clipboard.writeText(`${origin}/f/${slug}`);
    toast.success('Link copiado!');
  };

  const deleteForm = async (id: string) => {
    if (!confirm('Excluir formulário? Leads associados permanecem.')) return;
    await fetch(`/api/forms/${id}`, { method: 'DELETE' });
    toast.success('Formulário excluído');
    load();
  };

  return (
    <div className="p-4 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl lg:text-3xl font-bold">Formulários</h1>
          <p className="text-muted-foreground text-sm">Crie formulários e capture leads automaticamente.</p>
        </div>
        <Link href="/forms/new"><Button><Plus className="w-4 h-4 mr-2" />Novo formulário</Button></Link>
      </div>

      {loading ? <div className="text-muted-foreground">Carregando...</div> : forms.length === 0 ? (
        <Card className="p-12 text-center">
          <h3 className="font-heading font-semibold text-lg mb-1">Nenhum formulário ainda</h3>
          <p className="text-sm text-muted-foreground mb-4">Crie seu primeiro formulário e comece a captar leads.</p>
          <Link href="/forms/new"><Button><Plus className="w-4 h-4 mr-2" />Criar formulário</Button></Link>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {forms.map((f) => (
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
              <div className="flex gap-4 text-xs text-muted-foreground mb-4">
                <span>{f._count.fields} campos</span>
                <span>{f._count.leads} leads</span>
                <span>{formatDate(f.createdAt)}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button size="sm" variant="outline" onClick={() => copyLink(f.slug)} className="flex-1">
                  <Copy className="w-3 h-3 mr-1.5" />Link
                </Button>
                <Link href={`/f/${f.slug}`} target="_blank"><Button size="sm" variant="outline"><ExternalLink className="w-3 h-3" /></Button></Link>
                <Link href={`/forms/${f.id}/edit`}><Button size="sm" variant="outline"><Edit className="w-3 h-3" /></Button></Link>
                <Button size="sm" variant="outline" onClick={() => deleteForm(f.id)}><Trash2 className="w-3 h-3 text-destructive" /></Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

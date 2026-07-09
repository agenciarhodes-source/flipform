'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowDown, ArrowUp, Save, Shuffle, UserPlus } from 'lucide-react';

type FormItem = { id: string; name: string; isActive: boolean; publicTitle?: string };
type Agent = { userId: string; name: string; email: string };
type RotationMember = Agent & { orderIndex: number; isActive: boolean };

export function SalesRotationClient({ canManage }: { canManage: boolean }) {
  const [forms, setForms] = useState<FormItem[]>([]);
  const [formId, setFormId] = useState('');
  const [agents, setAgents] = useState<Agent[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [members, setMembers] = useState<RotationMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/forms').then((r) => r.json()).then((data) => {
      const activeForms = (data.forms || []).filter((form: FormItem) => form.isActive);
      setForms(activeForms);
      if (activeForms[0]) setFormId(activeForms[0].id);
    }).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!formId) return;
    setLoading(true);
    fetch(`/api/forms/${formId}/assignment-rotation`).then(async (r) => {
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Erro ao carregar rodízio');
      setEnabled(Boolean(data.isEnabled));
      setAgents(data.availableAgents || []);
      setMembers((data.members || []).filter((m: RotationMember) => m.isActive));
    }).catch((error) => toast.error(error.message)).finally(() => setLoading(false));
  }, [formId]);

  const selectedIds = useMemo(() => new Set(members.map((m) => m.userId)), [members]);
  const orderedMembers = members.map((member, index) => ({ ...member, orderIndex: index }));

  const toggleAgent = (agent: Agent, checked: boolean) => {
    if (!canManage) return;
    if (checked) setMembers((current) => current.some((m) => m.userId === agent.userId) ? current : [...current, { ...agent, orderIndex: current.length, isActive: true }]);
    else setMembers((current) => current.filter((m) => m.userId !== agent.userId));
  };

  const move = (userId: string, direction: -1 | 1) => {
    if (!canManage) return;
    setMembers((current) => {
      const index = current.findIndex((m) => m.userId === userId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const copy = [...current];
      [copy[index], copy[nextIndex]] = [copy[nextIndex], copy[index]];
      return copy;
    });
  };

  const save = async () => {
    if (!formId || !canManage) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/forms/${formId}/assignment-rotation`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isEnabled: enabled, strategy: 'round_robin', members: orderedMembers.map((m, index) => ({ userId: m.userId, orderIndex: index, isActive: true })) }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar rodízio');
      toast.success('Rodízio de leads salvo.');
    } catch (error: any) { toast.error(error.message); } finally { setSaving(false); }
  };

  return <div className="p-4 lg:p-8 space-y-6">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div><h1 className="font-heading text-2xl lg:text-3xl font-bold">Rodízio de leads</h1><p className="text-muted-foreground text-sm">Defina como os leads dos formulários serão distribuídos entre os vendedores.</p></div>
      <Badge variant={enabled ? 'default' : 'outline'} className={enabled ? 'w-fit bg-emerald-600' : 'w-fit'}>{enabled ? 'Rodízio entre vendedores ativo' : 'Sem distribuição automática'}</Badge>
    </div>

    <Card className="p-5 bg-blue-50/50 border-blue-100"><div className="flex gap-3"><Shuffle className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" /><div><p className="font-medium">O formulário é único.</p><p className="text-sm text-muted-foreground">A cada novo lead recebido, o sistema envia automaticamente para o próximo vendedor da ordem definida: Lead 1 → vendedor 1, Lead 2 → vendedor 2, Lead 3 → vendedor 3 e então recomeça.</p></div></div></Card>

    <div className="grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
      <Card className="p-5 space-y-5">
        <div className="space-y-2"><label className="text-sm font-medium">Formulário</label><Select value={formId} onValueChange={setFormId}><SelectTrigger><SelectValue placeholder="Selecione um formulário" /></SelectTrigger><SelectContent>{forms.map((form) => <SelectItem key={form.id} value={form.id}>{form.name}</SelectItem>)}</SelectContent></Select>{!forms.length && !loading && <p className="text-sm text-muted-foreground">Nenhum formulário ativo encontrado.</p>}</div>
        <div className="space-y-2"><label className="text-sm font-medium">Modo de distribuição</label><div className="grid gap-2 sm:grid-cols-2"><button type="button" disabled={!canManage} onClick={() => setEnabled(false)} className={`rounded-lg border p-3 text-left text-sm ${!enabled ? 'border-blue-500 bg-blue-50' : 'bg-white'}`}><strong>Sem distribuição automática</strong><br /><span className="text-muted-foreground">Leads entram sem responsável automático.</span></button><button type="button" disabled={!canManage} onClick={() => setEnabled(true)} className={`rounded-lg border p-3 text-left text-sm ${enabled ? 'border-blue-500 bg-blue-50' : 'bg-white'}`}><strong>Rodízio entre vendedores</strong><br /><span className="text-muted-foreground">Distribui conforme a ordem abaixo.</span></button></div></div>
        <div className="space-y-3"><h2 className="font-heading font-semibold">Vendedores disponíveis</h2>{agents.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center"><p className="font-medium">Nenhum vendedor cadastrado ainda.</p><p className="text-sm text-muted-foreground mb-3">Adicione vendedores em Usuários & Permissões para configurar o rodízio.</p><Link href="/users"><Button><UserPlus className="w-4 h-4 mr-2" />Adicionar vendedor</Button></Link></div> : agents.map((agent) => <label key={agent.userId} className="flex items-center gap-3 rounded-lg border p-3"><input type="checkbox" disabled={!canManage} checked={selectedIds.has(agent.userId)} onChange={(event) => toggleAgent(agent, event.currentTarget.checked)} className="h-4 w-4 rounded border" /><span><span className="font-medium">{agent.name}</span><span className="text-muted-foreground"> — {agent.email}</span></span></label>)}</div>
      </Card>
      <Card className="p-5 space-y-4"><div><h2 className="font-heading font-semibold">Ordem do rodízio</h2><p className="text-xs text-muted-foreground">Use as setas para definir quem recebe antes.</p></div>{orderedMembers.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Selecione vendedores para montar a ordem.</div> : orderedMembers.map((member, index) => <div key={member.userId} className="flex items-center justify-between gap-2 rounded-lg border p-3"><div><span className="font-semibold">{index + 1}. {member.name}</span><div className="text-xs text-muted-foreground">{member.email}</div></div><div className="flex gap-1"><Button type="button" size="icon" variant="outline" disabled={!canManage || index === 0} onClick={() => move(member.userId, -1)}><ArrowUp className="w-4 h-4" /></Button><Button type="button" size="icon" variant="outline" disabled={!canManage || index === orderedMembers.length - 1} onClick={() => move(member.userId, 1)}><ArrowDown className="w-4 h-4" /></Button></div></div>)}<div className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground"><strong>Exemplo visual:</strong><br />Lead 1 → {orderedMembers[0]?.name || 'Vendedor 1'}<br />Lead 2 → {orderedMembers[1]?.name || 'Vendedor 2'}<br />Lead 3 → {orderedMembers[2]?.name || orderedMembers[0]?.name || 'Vendedor 3'}<br />Lead 4 → {orderedMembers[0]?.name || 'Vendedor 1'}</div><Button className="w-full" onClick={save} disabled={!canManage || saving || !formId || loading}><Save className="w-4 h-4 mr-2" />{saving ? 'Salvando...' : 'Salvar rodízio'}</Button>{!canManage && <p className="text-xs text-muted-foreground">Seu papel permite visualizar, mas não alterar o rodízio.</p>}</Card>
    </div>
  </div>;
}

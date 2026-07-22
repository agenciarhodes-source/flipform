'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { MANUAL_LEAD_SOURCES } from '@/lib/leads';
import { CityCombobox } from '@/components/city-combobox';
import { getBrazilStates, normalizeBrazilCity } from '@/lib/brazil-locations';
import { todayDateOnly } from '@/lib/date-only';

type Stage = { id: string; name: string; orderIndex: number; isArchived?: boolean };
type Pipeline = { id: string; name: string; isArchived?: boolean; stages: Stage[] };
type User = { userId: string; name: string; role: string; status: string };

const initialForm = () => ({ name: '', phone: '', email: '', source: '', pipelineId: '', stageId: '', assignedTo: 'none', temperature: 'cold', saleValue: '', notes: '', state: '', city: '', entryDate: todayDateOnly() });

function digits(value: string) { return value.replace(/\D/g, ''); }
function cents(value: string) {
  const onlyDigits = digits(value);
  return onlyDigits ? Number(onlyDigits) : null;
}

export function ManualLeadDialog({ open, onOpenChange, pipelines, defaultPipelineId, defaultStageId, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; pipelines: Pipeline[]; defaultPipelineId?: string | null; defaultStageId?: string | null; onCreated: (lead: any) => void }) {
  const [form, setForm] = useState(initialForm);
  const [users, setUsers] = useState<User[]>([]);
  const [saving, setSaving] = useState(false);
  const [duplicate, setDuplicate] = useState<any>(null);

  const activePipelines = useMemo(() => pipelines.filter((p) => !p.isArchived), [pipelines]);
  const selectedPipeline = activePipelines.find((p) => p.id === form.pipelineId);
  const stages = (selectedPipeline?.stages || []).filter((s) => !s.isArchived).sort((a, b) => a.orderIndex - b.orderIndex);

  useEffect(() => {
    if (!open) return;
    const pipelineId = defaultPipelineId || (activePipelines.length === 1 ? activePipelines[0].id : activePipelines[0]?.id || '');
    const pipeline = activePipelines.find((p) => p.id === pipelineId) || activePipelines[0];
    const stageId = defaultStageId || pipeline?.stages?.filter((s) => !s.isArchived).sort((a, b) => a.orderIndex - b.orderIndex)[0]?.id || '';
    setForm({ ...initialForm(), pipelineId: pipeline?.id || '', stageId });
    setDuplicate(null);
    fetch('/api/users').then((r) => r.ok ? r.json() : { users: [] }).then((d) => setUsers(d.users || [])).catch(() => setUsers([]));
  }, [open, defaultPipelineId, defaultStageId, activePipelines]);

  useEffect(() => {
    if (!selectedPipeline) return;
    if (!stages.some((stage) => stage.id === form.stageId)) setForm((current) => ({ ...current, stageId: stages[0]?.id || '' }));
  }, [form.pipelineId, selectedPipeline]);

  const submit = async (forceCreate = false) => {
    setSaving(true);
    setDuplicate(null);
    try {
      const res = await fetch('/api/leads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, phone: form.phone, email: form.email, source: form.source,
          pipelineId: form.pipelineId, stageId: form.stageId, assignedTo: form.assignedTo === 'none' ? null : form.assignedTo,
          temperature: form.temperature, saleValueCents: cents(form.saleValue), notes: form.notes, state: form.state || null, city: form.city || null, entryDate: form.entryDate, forceCreate,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) { setDuplicate(data.duplicate || true); toast.warning(data.error || 'Já existe um lead com este contato.'); return; }
      if (!res.ok) throw new Error(data.error || 'Não foi possível criar o lead.');
      toast.success('Lead criado com sucesso.');
      onOpenChange(false);
      onCreated(data.lead);
    } catch (e: any) {
      toast.error(e.message || 'Não foi possível criar o lead.');
    } finally { setSaving(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Adicionar lead manualmente</DialogTitle><DialogDescription>Informe a origem obrigatória, contato, pipeline e etapa inicial.</DialogDescription></DialogHeader>
      {duplicate && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-center justify-between gap-3"><span>Já existe um lead com este contato.</span><Button type="button" size="sm" variant="outline" onClick={() => submit(true)} disabled={saving}>Criar mesmo assim</Button></div>}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Nome *</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Origem do lead *</Label><Select value={form.source} onValueChange={(source) => setForm({ ...form, source })}><SelectTrigger><SelectValue placeholder="Selecione a origem" /></SelectTrigger><SelectContent>{MANUAL_LEAD_SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Data de entrada do lead *</Label><Input type="date" value={form.entryDate} max={todayDateOnly()} onChange={(e) => setForm({ ...form, entryDate: e.target.value })} required /></div>
        <div className="space-y-1.5"><Label>Telefone</Label><Input placeholder="+55 (00) 9 0000-0000" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>E-mail</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Pipeline *</Label><Select value={form.pipelineId} onValueChange={(pipelineId) => setForm({ ...form, pipelineId })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{activePipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Etapa *</Label><Select value={form.stageId} onValueChange={(stageId) => setForm({ ...form, stageId })}><SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger><SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Responsável</Label><Select value={form.assignedTo} onValueChange={(assignedTo) => setForm({ ...form, assignedTo })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem responsável</SelectItem>{users.filter((u) => u.status === 'active').map((u) => <SelectItem key={u.userId} value={u.userId}>{u.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Temperatura</Label><Select value={form.temperature} onValueChange={(temperature) => setForm({ ...form, temperature })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cold">Frio</SelectItem><SelectItem value="warm">Morno</SelectItem><SelectItem value="hot">Quente</SelectItem></SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Valor vendido</Label><Input placeholder="R$ 0,00" value={form.saleValue} onChange={(e) => setForm({ ...form, saleValue: e.target.value })} /></div>
        <div className="space-y-1.5"><Label>Estado</Label><Select value={form.state || 'none'} onValueChange={(nextState) => { const state = nextState === 'none' ? '' : nextState; setForm((current) => ({ ...current, state, city: state && normalizeBrazilCity(state, current.city) ? current.city : '' })); }}><SelectTrigger><SelectValue placeholder="Selecione o estado" /></SelectTrigger><SelectContent><SelectItem value="none">Sem estado</SelectItem>{getBrazilStates().map((s) => <SelectItem key={s.uf} value={s.uf}>{s.name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-1.5"><Label>Cidade</Label><CityCombobox state={form.state} value={form.city} onValueChange={(city) => setForm((current) => ({ ...current, city }))} allowEmpty /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Observações</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
      </div>
      <DialogFooter><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="button" onClick={() => submit(false)} disabled={saving}>{saving ? 'Salvando...' : 'Salvar lead'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}

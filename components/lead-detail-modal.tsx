'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateTime } from '@/lib/utils';
import { formatCurrencyBRLFromCents, parseBRLToCents } from '@/lib/currency-brl';
import { Mail, Phone, User, Flame, Snowflake, Thermometer, Trash2 } from 'lucide-react';
import { TasksTab } from '@/components/tasks-tab';

interface Stage { id: string; name: string; color: string; }

export function LeadDetailModal({ leadId, stages, onClose, onChange }: { leadId: string; stages: Stage[]; onClose: () => void; onChange: () => void }) {
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [noteContent, setNoteContent] = useState('');
  const [saleValueInput, setSaleValueInput] = useState('');
  const [savingSaleValue, setSavingSaleValue] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/leads/${leadId}`).then((r) => r.json());
    setLead(res.lead);
    setSaleValueInput(formatCurrencyBRLFromCents(res.lead?.saleValueCents ?? null));
    setLoading(false);
  };
  useEffect(() => { load(); }, [leadId]);

  const moveTo = async (stageId: string) => {
    await fetch(`/api/leads/${leadId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stageId }) });
    toast.success('Etapa atualizada');
    await load();
    onChange();
  };

  const updateTemp = async (temperature: string) => {
    await fetch(`/api/leads/${leadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ temperature }) });
    toast.success('Temperatura atualizada');
    load(); onChange();
  };

  const saveSaleValue = async () => {
    try {
      const saleValueCents = saleValueInput.trim() ? parseBRLToCents(saleValueInput) : null;
      setSavingSaleValue(true);
      const res = await fetch(`/api/leads/${leadId}/sale-value`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saleValueCents }) });
      if (!res.ok) throw new Error('save_failed');
      const data = await res.json();
      setLead((current: any) => ({ ...current, ...data.lead }));
      setSaleValueInput(formatCurrencyBRLFromCents(data.lead.saleValueCents ?? null));
      toast.success('Valor vendido atualizado.');
      await load();
      onChange();
    } catch {
      toast.error('Não foi possível salvar o valor vendido.');
    } finally {
      setSavingSaleValue(false);
    }
  };

  const addNote = async () => {
    if (!noteContent.trim()) return;
    const res = await fetch(`/api/leads/${leadId}/notes`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content: noteContent }) });
    if (res.ok) {
      toast.success('Nota adicionada');
      setNoteContent('');
      load();
    }
  };

  const deleteLead = async () => {
    if (!confirm('Excluir este lead?')) return;
    await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
    toast.success('Lead excluído');
    onChange();
    onClose();
  };

  const finalStageId = stages.at(-1)?.id;
  const isFinalStage = Boolean(finalStageId && lead?.stageId === finalStageId) || lead?.status === 'won';

  if (loading || !lead) {
    return (
      <Dialog open onOpenChange={onClose}>
        <DialogContent className="max-w-3xl"><div className="p-6 text-center text-muted-foreground">Carregando...</div></DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-0">
        <DialogHeader className="p-6 pb-3 border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <DialogTitle className="font-heading text-xl flex items-center gap-2">
                {lead.name}
                <Badge style={{ backgroundColor: lead.stage.color }} className="text-white border-0">{lead.stage.name}</Badge>
              </DialogTitle>
              <div className="flex gap-3 text-xs text-muted-foreground mt-2">
                {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>}
                {lead.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}
                {lead.assignedUser && <span className="flex items-center gap-1"><User className="w-3 h-3" />{lead.assignedUser.name}</span>}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={deleteLead} title="Excluir lead"><Trash2 className="w-4 h-4 text-destructive" /></Button>
          </div>
        </DialogHeader>

        <Tabs defaultValue="info" className="px-6">
          <TabsList className="my-4">
            <TabsTrigger value="info">Dados</TabsTrigger>
            <TabsTrigger value="answers">Respostas</TabsTrigger>
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="notes">Notas ({lead.notes.length})</TabsTrigger>
            <TabsTrigger value="tasks">Tarefas ({lead.tasks?.filter((t: any) => t.status === 'pending').length || 0})</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="pb-6 space-y-4">
            <section className="space-y-3 rounded-xl border bg-white p-4">
              <h3 className="font-heading text-sm font-semibold">Informações do lead</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><div className="text-muted-foreground">Origem</div><div className="font-medium capitalize">{lead.source}</div></div>
              <div><div className="text-muted-foreground">Status</div><div className="font-medium capitalize">{lead.status}</div></div>
              <div><div className="text-muted-foreground">Criado em</div><div className="font-medium">{formatDateTime(lead.createdAt)}</div></div>
              <div><div className="text-muted-foreground">Última atualização</div><div className="font-medium">{formatDateTime(lead.updatedAt)}</div></div>
            </div>
            </section>

            <section className="space-y-3 rounded-xl border bg-emerald-50/40 p-4 ring-1 ring-emerald-100">
              <div>
                <h3 className="font-heading text-sm font-semibold">Comercial</h3>
                <p className="text-xs text-muted-foreground">Informe o valor vendido para contabilizar na receita do Dashboard.</p>
              </div>
              <label className="block space-y-2">
                <span className="text-sm font-medium">Valor vendido</span>
                <input
                  className="w-full rounded-md border bg-white px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-500"
                  inputMode="decimal"
                  placeholder="R$ 0,00"
                  value={saleValueInput}
                  onChange={(event) => setSaleValueInput(event.target.value)}
                  onBlur={() => { try { setSaleValueInput(formatCurrencyBRLFromCents(parseBRLToCents(saleValueInput))); } catch {} }}
                />
              </label>
              <p className={`rounded-lg px-3 py-2 text-xs ${isFinalStage ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
                {isFinalStage ? 'Este valor já está sendo contabilizado na receita.' : 'Este valor só entra como receita quando o lead estiver na etapa final do funil.'}
              </p>
              <div className="flex items-center justify-between gap-3">
                <div className="text-xs text-muted-foreground">{lead.saleValueUpdatedAt ? `Atualizado em ${formatDateTime(lead.saleValueUpdatedAt)}` : 'Nenhum valor salvo ainda.'}</div>
                <Button size="sm" onClick={saveSaleValue} disabled={savingSaleValue}>{savingSaleValue ? 'Salvando...' : 'Salvar valor'}</Button>
              </div>
            </section>

            <section className="rounded-xl border bg-white p-4">
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div>
                <div className="text-sm font-medium mb-2">Mover para etapa</div>
                <Select value={lead.stageId} onValueChange={moveTo}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{stages.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <div className="text-sm font-medium mb-2">Temperatura</div>
                <div className="flex gap-2">
                  <Button size="sm" variant={lead.temperature === 'cold' ? 'default' : 'outline'} onClick={() => updateTemp('cold')}><Snowflake className="w-3 h-3 mr-1" />Frio</Button>
                  <Button size="sm" variant={lead.temperature === 'warm' ? 'default' : 'outline'} onClick={() => updateTemp('warm')}><Thermometer className="w-3 h-3 mr-1" />Morno</Button>
                  <Button size="sm" variant={lead.temperature === 'hot' ? 'default' : 'outline'} onClick={() => updateTemp('hot')}><Flame className="w-3 h-3 mr-1" />Quente</Button>
                </div>
              </div>
            </div>
            </section>
          </TabsContent>

          <TabsContent value="answers" className="pb-6 space-y-3">
            {lead.answers.length === 0 ? (
              <div className="text-sm text-muted-foreground py-8 text-center">Sem respostas de formulário.</div>
            ) : lead.answers.map((a: any) => (
              <div key={a.id} className="border rounded-md p-3">
                <div className="text-xs text-muted-foreground mb-1">{a.questionLabel}</div>
                <div className="font-medium">{typeof a.answer === 'object' ? JSON.stringify(a.answer) : String(a.answer)}</div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="history" className="pb-6 space-y-2">
            {lead.saleValueAuditLogs?.map((log: any) => (
              <div key={log.id} className="flex items-start gap-3 text-sm border-l-2 border-emerald-200 pl-3 py-1">
                <div className="flex-1">
                  <div className="font-medium">{log.metadata?.message || 'Valor vendido atualizado.'}</div>
                  <div className="text-xs text-muted-foreground">Auditoria comercial • {formatDateTime(log.createdAt)}</div>
                </div>
              </div>
            ))}
            {lead.history.map((h: any) => (
              <div key={h.id} className="flex items-start gap-3 text-sm border-l-2 border-brand-200 pl-3 py-1">
                <div className="flex-1">
                  <div className="font-medium">
                    {h.fromStage ? `${h.fromStage.name} → ${h.toStage.name}` : `Criado em ${h.toStage.name}`}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {h.changer?.name || 'Sistema'} • {formatDateTime(h.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="notes" className="pb-6 space-y-3">
            <div className="space-y-2">
              <Textarea placeholder="Adicionar nota interna..." value={noteContent} onChange={(e) => setNoteContent(e.target.value)} />
              <Button size="sm" onClick={addNote}>Adicionar nota</Button>
            </div>
            {lead.notes.map((n: any) => (
              <div key={n.id} className="border rounded-md p-3 bg-muted/30">
                <div className="text-sm whitespace-pre-wrap">{n.content}</div>
                <div className="text-xs text-muted-foreground mt-2">{n.user.name} • {formatDateTime(n.createdAt)}</div>
              </div>
            ))}
          </TabsContent>

          <TabsContent value="tasks" className="pb-6">
            <TasksTab leadId={leadId} onChange={() => { load(); onChange(); }} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

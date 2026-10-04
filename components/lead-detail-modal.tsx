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
import { Mail, Phone, User, Flame, Snowflake, Thermometer, Trash2, Pencil, MessageCircle, Sparkles } from 'lucide-react';
import { TasksTab } from '@/components/tasks-tab';
import { CityCombobox } from '@/components/city-combobox';
import { getBrazilStates, normalizeBrazilCity, normalizeBrazilState, formatLeadLocation } from '@/lib/brazil-locations';
import { dateLikeToDateOnly, formatDateOnlyBR, todayDateOnly } from '@/lib/date-only';

interface Stage { id: string; name: string; color: string; }

const qualificationLabels: Record<string, string> = {
  qualified: 'Qualificado',
  nurture: 'Em maturação',
  disqualified: 'Não qualificado',
  insufficient: 'Informação insuficiente',
};
const journeyLabels: Record<string, string> = {
  discovery: 'Descoberta',
  consideration: 'Consideração',
  decision: 'Decisão',
  post_sale: 'Pós-venda',
  unknown: 'Ainda indefinido',
};

const intentLabels: Record<string, string> = {
  information: 'Buscando informação',
  qualification: 'Em qualificação',
  objection: 'Objeção ativa',
  scheduling: 'Quer agendar',
  purchase: 'Intenção de avançar',
  support: 'Suporte',
  handoff: 'Quer atendimento humano',
  other: 'Outra intenção',
};
const objectionLabels: Record<string, string> = {
  none: 'Nenhuma',
  price: 'Preço',
  trust: 'Confiança',
  timing: 'Momento/prazo',
  documentation: 'Documentação',
  eligibility: 'Elegibilidade/perfil',
  competitor: 'Concorrente/alternativa',
  uncertainty: 'Indecisão',
  other: 'Outra',
};
const nextActionLabels: Record<string, string> = {
  answer_directly: 'Responder diretamente',
  ask_one_question: 'Fazer uma pergunta curta',
  handle_objection: 'Tratar objeção',
  request_contact: 'Solicitar contato',
  schedule: 'Avançar para agenda/visita',
  handoff: 'Encaminhar para atendimento humano',
};
const temperatureLabels: Record<string, string> = {
  hot: 'Quente',
  warm: 'Morno',
  cold: 'Frio',
};

const handoffPriorityLabels: Record<string, string> = {
  high: 'Prioridade alta',
  normal: 'Prioridade normal',
  low: 'Prioridade baixa',
};

export function LeadDetailModal({ leadId, stages, onClose, onChange }: { leadId: string; stages: Stage[]; onClose: () => void; onChange: () => void }) {
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [noteContent, setNoteContent] = useState('');
  const [purchases, setPurchases] = useState<any[]>([]);
  const [purchaseSummary, setPurchaseSummary] = useState<any>(null);
  const [purchaseForm, setPurchaseForm] = useState({ amount: '', purchaseDate: todayDateOnly(), orderNumber: '', paymentMethod: '', notes: '' });
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [locationForm, setLocationForm] = useState({ state: '', city: '' });
  const [savingLocation, setSavingLocation] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/leads/${leadId}`).then((r) => r.json());
    setLead(res.lead);
    setLocationForm({ state: normalizeBrazilState(res.lead?.state || '') || res.lead?.state || '', city: res.lead?.city || '' });
    try { const purchasesRes = await fetch(`/api/leads/${leadId}/purchases`).then((r) => r.json()); setPurchases(purchasesRes.purchases || []); setPurchaseSummary(purchasesRes.summary || null); } catch { toast.error('Não foi possível carregar as compras deste lead.'); }
    setLoading(false);
  };
  useEffect(() => { load(); }, [leadId]);

  const moveTo = async (stageId: string) => {
    await fetch(`/api/leads/${leadId}/move`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stageId }) });
    toast.success('Etapa atualizada');
    await load();
    onChange();
  };


  const updateAssignee = async (assignedTo: string) => {
    const res = await fetch(`/api/leads/${leadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assignedTo: assignedTo === 'none' ? null : assignedTo }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { toast.error(data.error || 'Não foi possível alterar o responsável.'); return; }
    toast.success('Responsável atualizado');
    load(); onChange();
  };

  const updateTemp = async (temperature: string) => {
    await fetch(`/api/leads/${leadId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ temperature }) });
    toast.success('Temperatura atualizada');
    load(); onChange();
  };

  const saveLocation = async () => {
    try {
      setSavingLocation(true);
      const res = await fetch(`/api/leads/${leadId}/location`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: locationForm.state || null, city: locationForm.city || null }) });
      if (!res.ok) throw new Error('save_failed');
      const data = await res.json();
      setLead((current: any) => ({ ...current, ...data.lead }));
      toast.success('Localização atualizada.');
      await load(); onChange();
    } catch { toast.error('Não foi possível atualizar a localização.'); } finally { setSavingLocation(false); }
  };

  const resetPurchaseForm = () => { setEditingPurchaseId(null); setPurchaseForm({ amount: '', purchaseDate: todayDateOnly(), orderNumber: '', paymentMethod: '', notes: '' }); };
  const savePurchase = async () => {
    try {
      const amountCents = parseBRLToCents(purchaseForm.amount);
      if (amountCents <= 0) throw new Error('invalid_amount');
      const url = editingPurchaseId ? `/api/leads/${leadId}/purchases/${editingPurchaseId}` : `/api/leads/${leadId}/purchases`;
      const res = await fetch(url, { method: editingPurchaseId ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountCents, purchaseDate: purchaseForm.purchaseDate, orderNumber: purchaseForm.orderNumber, paymentMethod: purchaseForm.paymentMethod || undefined, notes: purchaseForm.notes }) });
      if (!res.ok) throw new Error('save_failed');
      toast.success(editingPurchaseId ? 'Compra atualizada com sucesso.' : 'Compra registrada com sucesso.');
      resetPurchaseForm(); await load(); onChange();
    } catch { toast.error('Não foi possível registrar a compra.'); }
  };
  const editPurchase = (purchase: any) => { setEditingPurchaseId(purchase.id); setPurchaseForm({ amount: formatCurrencyBRLFromCents(purchase.amountCents), purchaseDate: dateLikeToDateOnly(purchase.purchaseDate), orderNumber: purchase.orderNumber || '', paymentMethod: purchase.paymentMethod || '', notes: purchase.notes || '' }); };
  const deletePurchase = async (purchaseId: string) => {
    if (!confirm('Remover esta compra?')) return;
    try { const res = await fetch(`/api/leads/${leadId}/purchases/${purchaseId}`, { method: 'DELETE' }); if (!res.ok) throw new Error('delete_failed'); toast.success('Compra removida com sucesso.'); await load(); onChange(); } catch { toast.error('Não foi possível remover a compra.'); }
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
    const res = await fetch(`/api/leads/${leadId}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(data.error || 'Não foi possível excluir o lead.');
      return;
    }
    toast.success('Lead excluído');
    onChange();
    onClose();
  };

  const openWhatsAppConversation = async () => {
    try {
      const response = await fetch(`/api/inbox/leads/${encodeURIComponent(leadId)}/whatsapp-conversation`, {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404 || response.status === 422) {
          toast.info(data.error || 'Ainda não há conversa do WhatsApp para este lead.');
          return;
        }
        throw new Error(data.error || 'Não foi possível abrir a conversa do WhatsApp.');
      }
      if (!data.conversationId) throw new Error('A conversa do WhatsApp não foi encontrada.');
      window.location.assign(`/inbox?conversationId=${encodeURIComponent(data.conversationId)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível abrir a conversa do WhatsApp.');
    }
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
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <DialogTitle className="font-heading text-xl flex flex-wrap items-center gap-2">
                {lead.name}
                <Badge style={{ backgroundColor: lead.stage.color }} className="text-white border-0">{lead.stage.name}</Badge>
                {isFinalStage && <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Fechamento</Badge>}
                {lead.canContactWhatsApp && lead.phone && (
                  <Button
                    size="icon"
                    variant="outline"
                    title="Abrir conversa no WhatsApp"
                    className="h-8 w-8 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-800"
                    onClick={() => void openWhatsAppConversation()}
                    aria-label={`Abrir conversa do WhatsApp de ${lead.name}`}
                  >
                    <MessageCircle className="h-4 w-4" />
                  </Button>
                )}
              </DialogTitle>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>}
                {lead.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}
                {lead.assignedUser && <span className="flex items-center gap-1"><User className="w-3 h-3" />{lead.assignedUser.name}</span>}
                {(lead.state || lead.city) && <span>{formatLeadLocation(lead.city, lead.state)}</span>}
              </div>
            </div>
            {lead.canDelete && <Button variant="ghost" size="icon" onClick={deleteLead} title="Excluir lead"><Trash2 className="w-4 h-4 text-destructive" /></Button>}
          </div>
        </DialogHeader>

        <Tabs defaultValue="info" className="px-6">
          <TabsList className="my-4 h-auto flex-wrap">
            <TabsTrigger value="info">Dados</TabsTrigger>
            <TabsTrigger value="answers">Respostas</TabsTrigger>
            {(lead.flipAiHumanHandoff || lead.flipAiLiveIntelligence || lead.flipAiQualifications?.length > 0) && (
              <TabsTrigger value="flip-ai"><Sparkles className="mr-1 h-3.5 w-3.5" />Flip AI</TabsTrigger>
            )}
            <TabsTrigger value="history">Histórico</TabsTrigger>
            <TabsTrigger value="notes">Notas ({lead.notes.length})</TabsTrigger>
            <TabsTrigger value="tasks">Tarefas ({lead.tasks?.filter((t: any) => t.status === 'pending').length || 0})</TabsTrigger>
            <TabsTrigger value="financial">Financeiro</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="pb-6 space-y-4">
            <section className="space-y-3 rounded-xl border bg-white p-4">
              <h3 className="font-heading text-sm font-semibold">Informações do lead</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><div className="text-muted-foreground">Origem</div><div className="font-medium capitalize">{lead.source}</div></div>
              <div><div className="text-muted-foreground">Status</div><div className="font-medium capitalize">{isFinalStage ? 'Ganho' : lead.status}</div></div>
              <div><div className="text-muted-foreground">Data de entrada</div><div className="font-medium">{formatDateTime(lead.enteredAt)}</div></div>
              <div><div className="text-muted-foreground">Cadastrado no sistema</div><div className="font-medium">{formatDateTime(lead.createdAt)}</div></div>
              <div><div className="text-muted-foreground">Última atualização</div><div className="font-medium">{formatDateTime(lead.updatedAt)}</div></div>
              <div className="col-span-2"><div className="text-muted-foreground mb-2">Responsável</div>{lead.activeAgents?.length ? <Select value={lead.assignedTo || 'none'} onValueChange={updateAssignee}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Sem responsável</SelectItem>{lead.activeAgents.map((agent: any) => <SelectItem key={agent.userId} value={agent.userId}>{agent.name} — {agent.email}</SelectItem>)}</SelectContent></Select> : <div className="font-medium">{lead.assignedUser?.name || 'Sem responsável'}</div>}</div>
            </div>
            </section>

            <section className="space-y-3 rounded-xl border bg-white p-4">
              <h3 className="font-heading text-sm font-semibold">Localização</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-sm font-medium mb-2">Estado</div><Select value={locationForm.state || 'none'} onValueChange={(nextState) => { const state = nextState === 'none' ? '' : nextState; setLocationForm((current) => ({ state, city: state && normalizeBrazilCity(state, current.city) ? current.city : '' })); }}><SelectTrigger><SelectValue placeholder="Selecione o estado" /></SelectTrigger><SelectContent><SelectItem value="none">Sem estado</SelectItem>{getBrazilStates().map((s) => <SelectItem key={s.uf} value={s.uf}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                <div><div className="text-sm font-medium mb-2">Cidade</div><CityCombobox state={locationForm.state} value={locationForm.city} onValueChange={(city) => setLocationForm((current) => ({ ...current, city }))} allowEmpty /></div>
              </div>
              <Button size="sm" onClick={saveLocation} disabled={savingLocation}>{savingLocation ? 'Salvando...' : 'Salvar localização'}</Button>
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

          <TabsContent value="flip-ai" className="pb-6 space-y-4">
            {lead.flipAiHumanHandoff && (
              <section className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-emerald-700" />
                      <h3 className="font-heading text-sm font-semibold">Resumo para atendimento</h3>
                      <Badge variant="outline">
                        {handoffPriorityLabels[lead.flipAiHumanHandoff.priority] || lead.flipAiHumanHandoff.priority}
                      </Badge>
                      {lead.flipAiHumanHandoff.recommended && (
                        <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                          Encaminhamento recomendado
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Atualizado em {formatDateTime(lead.flipAiHumanHandoff.updatedAt)} • sem nova chamada de IA
                    </div>
                  </div>
                </div>

                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumo executivo</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{lead.flipAiHumanHandoff.summary}</p>
                </div>

                <div className="rounded-lg border border-emerald-200 bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Como retomar</div>
                  <p className="mt-1 text-sm font-medium">{lead.flipAiHumanHandoff.resumeGuidance}</p>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border bg-white p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Informações já disponíveis</div>
                    {lead.flipAiHumanHandoff.knownFacts?.length ? (
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {lead.flipAiHumanHandoff.knownFacts.map((fact: string, index: number) => <li key={index}>{fact}</li>)}
                      </ul>
                    ) : (
                      <p className="mt-2 text-muted-foreground">Ainda não há informações estruturadas suficientes.</p>
                    )}
                  </div>
                  <div className="rounded-lg border bg-white p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Encaminhamento</div>
                    <p className="mt-2"><strong>Motivo:</strong> {lead.flipAiHumanHandoff.reason}</p>
                    <p className="mt-2"><strong>Próxima ação:</strong> {lead.flipAiHumanHandoff.nextAction}</p>
                  </div>
                </div>

                {lead.flipAiHumanHandoff.reasons?.length > 0 && (
                  <div>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sinais relevantes</div>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                      {lead.flipAiHumanHandoff.reasons.map((reason: string, index: number) => <li key={index}>{reason}</li>)}
                    </ul>
                  </div>
                )}

                <div className="rounded-lg border border-emerald-200 bg-white p-3 text-xs text-muted-foreground">
                  Este resumo reaproveita o estado da conversa, decisões JEV e qualificação já existentes.
                  Ele não move o lead, não atribui vendedor e não envia mensagem automaticamente.
                </div>
              </section>
            )}

            {lead.flipAiLiveIntelligence && (
              <section className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-blue-700" />
                      <h3 className="font-heading text-sm font-semibold">Inteligência em tempo real</h3>
                      <Badge variant="outline">
                        {qualificationLabels[lead.flipAiLiveIntelligence.classification] || lead.flipAiLiveIntelligence.classification}
                      </Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      Atualizado em {formatDateTime(lead.flipAiLiveIntelligence.updatedAt)} • política {lead.flipAiLiveIntelligence.policyVersion}
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    JEV • confiança {Math.round(Number(lead.flipAiLiveIntelligence.confidence || 0) * 100)}%
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-lg border bg-white p-3">
                    <div className="text-xs text-muted-foreground">Score</div>
                    <div className="text-2xl font-bold">{lead.flipAiLiveIntelligence.score}</div>
                    <div className="text-xs text-muted-foreground">
                      {lead.flipAiLiveIntelligence.scoreDelta == null
                        ? 'Primeira leitura'
                        : `${lead.flipAiLiveIntelligence.scoreDelta >= 0 ? '+' : ''}${lead.flipAiLiveIntelligence.scoreDelta} desde a leitura anterior`}
                    </div>
                  </div>
                  <div className="rounded-lg border bg-white p-3">
                    <div className="text-xs text-muted-foreground">Temperatura sugerida</div>
                    <div className="text-xl font-bold">{temperatureLabels[lead.flipAiLiveIntelligence.temperature] || lead.flipAiLiveIntelligence.temperature}</div>
                    <div className="text-xs text-muted-foreground">Não altera o CRM automaticamente</div>
                  </div>
                  <div className="rounded-lg border bg-white p-3">
                    <div className="text-xs text-muted-foreground">Fit</div>
                    <div className="text-2xl font-bold">{lead.flipAiLiveIntelligence.fitScore}</div>
                    <div className="text-xs text-muted-foreground">peso 40%</div>
                  </div>
                  <div className="rounded-lg border bg-white p-3">
                    <div className="text-xs text-muted-foreground">Intenção</div>
                    <div className="text-2xl font-bold">{lead.flipAiLiveIntelligence.intentScore}</div>
                    <div className="text-xs text-muted-foreground">peso 30%</div>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border bg-white p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Leitura atual</div>
                    <div className="mt-2 space-y-1">
                      <div><strong>Intenção:</strong> {intentLabels[lead.flipAiLiveIntelligence.intent] || lead.flipAiLiveIntelligence.intent}</div>
                      <div><strong>Objeção:</strong> {objectionLabels[lead.flipAiLiveIntelligence.objection] || lead.flipAiLiveIntelligence.objection}</div>
                      <div><strong>Jornada:</strong> {journeyLabels[lead.flipAiLiveIntelligence.journeyStage] || lead.flipAiLiveIntelligence.journeyStage}</div>
                      <div><strong>Urgência:</strong> {lead.flipAiLiveIntelligence.urgencyScore}/100</div>
                      <div><strong>Prontidão:</strong> {lead.flipAiLiveIntelligence.readinessScore}/100</div>
                    </div>
                  </div>
                  <div className="rounded-lg border bg-white p-3 text-sm">
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próxima ação sugerida</div>
                    <p className="mt-2 font-medium">
                      {nextActionLabels[lead.flipAiLiveIntelligence.nextAction] || lead.flipAiLiveIntelligence.nextAction}
                    </p>
                    {lead.flipAiLiveIntelligence.needsHuman && (
                      <p className="mt-2 text-amber-700">O JEV sinalizou necessidade de atendimento humano.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border border-blue-200 bg-white p-3 text-xs text-muted-foreground">
                  O score é calculado pelo FlipForm com regra determinística: Fit 40% + Intenção 30% + Urgência 15% + Prontidão 10% + Confiança 5%.
                  Esta leitura não move etapa, não altera temperatura do CRM e não executa ações automaticamente.
                </div>
              </section>
            )}

            {lead.flipAiQualifications?.map((qualification: any) => (
              <section key={qualification.id} className="space-y-4 rounded-xl border border-violet-200 bg-violet-50/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-violet-700" />
                      <h3 className="font-heading text-sm font-semibold">{qualification.agent?.name || 'Flip AI'}</h3>
                      <Badge variant="outline">{qualificationLabels[qualification.classification] || qualification.classification}</Badge>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">{formatDateTime(qualification.createdAt)}</div>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Consciência {qualification.awarenessLevel}/5 • {journeyLabels[qualification.journeyStage] || qualification.journeyStage}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border bg-white p-3">
                    <div className="text-xs text-muted-foreground">Fit Score</div>
                    <div className="text-2xl font-bold">{qualification.fitScore}</div>
                  </div>
                  <div className="rounded-lg border bg-white p-3">
                    <div className="text-xs text-muted-foreground">Intent Score</div>
                    <div className="text-2xl font-bold">{qualification.intentScore}</div>
                  </div>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Resumo</div>
                  <p className="mt-1 whitespace-pre-wrap text-sm">{qualification.summary}</p>
                </div>
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Motivos</div>
                  <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
                    {qualification.reasons.map((reason: string, index: number) => <li key={index}>{reason}</li>)}
                  </ul>
                </div>
                <div className="rounded-lg border border-violet-200 bg-white p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Próxima ação</div>
                  <p className="mt-1 text-sm font-medium">{qualification.nextAction}</p>
                </div>
                <details className="rounded-lg border bg-white">
                  <summary className="cursor-pointer px-3 py-2 text-sm font-medium">Histórico da conversa</summary>
                  <div className="space-y-2 border-t p-3">
                    {[...(qualification.conversation?.messages || [])].reverse().map((message: any) => (
                      <div key={message.id} className={`max-w-[88%] rounded-lg px-3 py-2 text-sm ${message.direction === 'outbound' ? 'ml-auto bg-violet-100' : 'bg-muted'}`}>
                        <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                          {message.direction === 'outbound' ? qualification.agent?.name || 'Flip AI' : 'Lead'} • {formatDateTime(message.createdAt)}
                        </div>
                        <div className="whitespace-pre-wrap">{message.text}</div>
                      </div>
                    ))}
                  </div>
                </details>
              </section>
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

          <TabsContent value="financial" className="pb-6 space-y-4">
            {isFinalStage && (!purchaseSummary || purchaseSummary.purchaseCount === 0) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Este lead está fechado, mas ainda não possui compra registrada.</div>}
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div className="rounded-xl border bg-white p-3"><div className="text-xs text-muted-foreground">Total comprado</div><div className="text-xl font-bold">{formatCurrencyBRLFromCents(purchaseSummary?.totalAmountCents || 0)}</div></div>
              <div className="rounded-xl border bg-white p-3"><div className="text-xs text-muted-foreground">Compras</div><div className="text-xl font-bold">{purchaseSummary?.purchaseCount || 0}</div></div>
              <div className="rounded-xl border bg-white p-3"><div className="text-xs text-muted-foreground">Ticket médio</div><div className="text-xl font-bold">{formatCurrencyBRLFromCents(purchaseSummary?.averageTicketCents || 0)}</div></div>
              <div className="rounded-xl border bg-white p-3"><div className="text-xs text-muted-foreground">Primeira compra</div><div className="font-medium">{purchaseSummary?.firstPurchaseAt ? formatDateOnlyBR(purchaseSummary.firstPurchaseAt) : '—'}</div></div>
              <div className="rounded-xl border bg-white p-3"><div className="text-xs text-muted-foreground">Última compra</div><div className="font-medium">{purchaseSummary?.lastPurchaseAt ? formatDateOnlyBR(purchaseSummary.lastPurchaseAt) : '—'}</div></div>
              <div className="rounded-xl border bg-white p-3"><div className="text-xs text-muted-foreground">Status</div><div className="font-medium">{purchaseSummary?.customerType === 'recurring_customer' ? 'Cliente recorrente' : purchaseSummary?.customerType === 'new_customer' ? 'Cliente novo' : 'Sem compras registradas'}</div></div>
            </section>
            <section className="rounded-xl border bg-white p-4 space-y-3">
              <h3 className="font-heading text-sm font-semibold">{editingPurchaseId ? 'Editar compra' : '+ Adicionar compra'}</h3>
              <div className="grid gap-3 md:grid-cols-2"><input className="rounded-md border px-3 py-2 text-sm" placeholder="Valor da compra" value={purchaseForm.amount} onChange={(e) => setPurchaseForm({ ...purchaseForm, amount: e.target.value })} onBlur={() => { try { setPurchaseForm({ ...purchaseForm, amount: formatCurrencyBRLFromCents(parseBRLToCents(purchaseForm.amount)) }); } catch {} }} /><input type="date" className="rounded-md border px-3 py-2 text-sm" value={purchaseForm.purchaseDate} onChange={(e) => setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })} /><input className="rounded-md border px-3 py-2 text-sm" placeholder="Número do pedido" value={purchaseForm.orderNumber} onChange={(e) => setPurchaseForm({ ...purchaseForm, orderNumber: e.target.value })} /><select className="rounded-md border px-3 py-2 text-sm" value={purchaseForm.paymentMethod} onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentMethod: e.target.value })}><option value="">Forma de pagamento</option><option value="pix">Pix</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="cash">Dinheiro</option><option value="boleto">Boleto</option><option value="bank_transfer">Transferência</option><option value="other">Outro</option></select></div>
              <Textarea placeholder="Observação" value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} />
              <div className="flex gap-2"><Button size="sm" onClick={savePurchase}>{editingPurchaseId ? 'Salvar compra' : 'Registrar venda'}</Button>{editingPurchaseId && <Button size="sm" variant="outline" onClick={resetPurchaseForm}>Cancelar</Button>}</div>
            </section>
            <section className="space-y-2">{purchases.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma compra registrada ainda.</div> : purchases.map((purchase, index) => <div key={purchase.id} className="rounded-xl border bg-white p-3 text-sm"><div className="flex items-start justify-between gap-2"><div><div className="font-medium">{formatDateOnlyBR(purchase.purchaseDate)} — {formatCurrencyBRLFromCents(purchase.amountCents)} {purchase.orderNumber ? `— Pedido #${purchase.orderNumber}` : ''} {purchase.paymentMethod ? `— ${purchase.paymentMethod}` : ''}</div><div className="text-xs text-muted-foreground">{purchases.length - index}ª compra{purchase.notes ? ` • ${purchase.notes}` : ''}</div></div><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => editPurchase(purchase)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => deletePurchase(purchase.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div></div></div>)}</section>
          </TabsContent>

        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
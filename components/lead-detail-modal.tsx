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
import { Mail, Phone, User, Flame, Snowflake, Thermometer, Trash2, Pencil } from 'lucide-react';
import { TasksTab } from '@/components/tasks-tab';
import { getBrazilStates, getCitiesByState, formatLeadLocation } from '@/lib/brazil-locations';

interface Stage { id: string; name: string; color: string; }

export function LeadDetailModal({ leadId, stages, onClose, onChange }: { leadId: string; stages: Stage[]; onClose: () => void; onChange: () => void }) {
  const [lead, setLead] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [noteContent, setNoteContent] = useState('');
  const [saleValueInput, setSaleValueInput] = useState('');
  const [savingSaleValue, setSavingSaleValue] = useState(false);
  const [purchases, setPurchases] = useState<any[]>([]);
  const [purchaseSummary, setPurchaseSummary] = useState<any>(null);
  const [purchaseForm, setPurchaseForm] = useState({ amount: '', purchaseDate: new Date().toISOString().slice(0, 10), orderNumber: '', paymentMethod: '', notes: '' });
  const [editingPurchaseId, setEditingPurchaseId] = useState<string | null>(null);
  const [locationForm, setLocationForm] = useState({ state: '', city: '' });
  const [savingLocation, setSavingLocation] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await fetch(`/api/leads/${leadId}`).then((r) => r.json());
    setLead(res.lead);
    setSaleValueInput(formatCurrencyBRLFromCents(res.lead?.saleValueCents ?? null));
    setLocationForm({ state: res.lead?.state || '', city: res.lead?.city || '' });
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

  const resetPurchaseForm = () => { setEditingPurchaseId(null); setPurchaseForm({ amount: '', purchaseDate: new Date().toISOString().slice(0, 10), orderNumber: '', paymentMethod: '', notes: '' }); };
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
  const editPurchase = (purchase: any) => { setEditingPurchaseId(purchase.id); setPurchaseForm({ amount: formatCurrencyBRLFromCents(purchase.amountCents), purchaseDate: String(purchase.purchaseDate).slice(0, 10), orderNumber: purchase.orderNumber || '', paymentMethod: purchase.paymentMethod || '', notes: purchase.notes || '' }); };
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
                {isFinalStage && <Badge className="border-emerald-200 bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Fechamento</Badge>}
              </DialogTitle>
              <div className="flex gap-3 text-xs text-muted-foreground mt-2">
                {lead.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{lead.email}</span>}
                {lead.phone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{lead.phone}</span>}
                {lead.assignedUser && <span className="flex items-center gap-1"><User className="w-3 h-3" />{lead.assignedUser.name}</span>}
                {(lead.state || lead.city) && <span>{formatLeadLocation(lead.city, lead.state)}</span>}
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
            <TabsTrigger value="financial">Financeiro</TabsTrigger>
          </TabsList>

          <TabsContent value="info" className="pb-6 space-y-4">
            <section className="space-y-3 rounded-xl border bg-white p-4">
              <h3 className="font-heading text-sm font-semibold">Informações do lead</h3>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><div className="text-muted-foreground">Origem</div><div className="font-medium capitalize">{lead.source}</div></div>
              <div><div className="text-muted-foreground">Status</div><div className="font-medium capitalize">{isFinalStage ? 'Ganho' : lead.status}</div></div>
              <div><div className="text-muted-foreground">Criado em</div><div className="font-medium">{formatDateTime(lead.createdAt)}</div></div>
              <div><div className="text-muted-foreground">Última atualização</div><div className="font-medium">{formatDateTime(lead.updatedAt)}</div></div>
            </div>
            </section>

            <section className="space-y-3 rounded-xl border bg-white p-4">
              <h3 className="font-heading text-sm font-semibold">Localização</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><div className="text-sm font-medium mb-2">Estado</div><Select value={locationForm.state || 'none'} onValueChange={(state) => setLocationForm({ state: state === 'none' ? '' : state, city: '' })}><SelectTrigger><SelectValue placeholder="Selecione o estado" /></SelectTrigger><SelectContent><SelectItem value="none">Sem estado</SelectItem>{getBrazilStates().map((s) => <SelectItem key={s.uf} value={s.uf}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                <div><div className="text-sm font-medium mb-2">Cidade</div><Select value={locationForm.city || 'none'} disabled={!locationForm.state} onValueChange={(city) => setLocationForm({ ...locationForm, city: city === 'none' ? '' : city })}><SelectTrigger><SelectValue placeholder="Selecione a cidade" /></SelectTrigger><SelectContent><SelectItem value="none">Sem cidade</SelectItem>{getCitiesByState(locationForm.state).map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
              </div>
              <Button size="sm" onClick={saveLocation} disabled={savingLocation}>{savingLocation ? 'Salvando...' : 'Salvar localização'}</Button>
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

          <TabsContent value="financial" className="pb-6 space-y-4">
            {isFinalStage && (!purchaseSummary || purchaseSummary.purchaseCount === 0) && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Este lead está fechado, mas ainda não possui compra registrada.</div>}
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <div className="rounded-xl border bg-white p-3"><div className="text-xs text-muted-foreground">Total comprado</div><div className="text-xl font-bold">{formatCurrencyBRLFromCents(purchaseSummary?.totalAmountCents || 0)}</div></div>
              <div className="rounded-xl border bg-white p-3"><div className="text-xs text-muted-foreground">Compras</div><div className="text-xl font-bold">{purchaseSummary?.purchaseCount || 0}</div></div>
              <div className="rounded-xl border bg-white p-3"><div className="text-xs text-muted-foreground">Ticket médio</div><div className="text-xl font-bold">{formatCurrencyBRLFromCents(purchaseSummary?.averageTicketCents || 0)}</div></div>
              <div className="rounded-xl border bg-white p-3"><div className="text-xs text-muted-foreground">Primeira compra</div><div className="font-medium">{purchaseSummary?.firstPurchaseAt ? new Date(purchaseSummary.firstPurchaseAt).toLocaleDateString('pt-BR') : '—'}</div></div>
              <div className="rounded-xl border bg-white p-3"><div className="text-xs text-muted-foreground">Última compra</div><div className="font-medium">{purchaseSummary?.lastPurchaseAt ? new Date(purchaseSummary.lastPurchaseAt).toLocaleDateString('pt-BR') : '—'}</div></div>
              <div className="rounded-xl border bg-white p-3"><div className="text-xs text-muted-foreground">Status</div><div className="font-medium">{purchaseSummary?.customerType === 'recurring_customer' ? 'Cliente recorrente' : purchaseSummary?.customerType === 'new_customer' ? 'Cliente novo' : 'Sem compras registradas'}</div></div>
            </section>
            <section className="rounded-xl border bg-white p-4 space-y-3">
              <h3 className="font-heading text-sm font-semibold">{editingPurchaseId ? 'Editar compra' : '+ Adicionar compra'}</h3>
              <div className="grid gap-3 md:grid-cols-2"><input className="rounded-md border px-3 py-2 text-sm" placeholder="Valor da compra" value={purchaseForm.amount} onChange={(e) => setPurchaseForm({ ...purchaseForm, amount: e.target.value })} onBlur={() => { try { setPurchaseForm({ ...purchaseForm, amount: formatCurrencyBRLFromCents(parseBRLToCents(purchaseForm.amount)) }); } catch {} }} /><input type="date" className="rounded-md border px-3 py-2 text-sm" value={purchaseForm.purchaseDate} onChange={(e) => setPurchaseForm({ ...purchaseForm, purchaseDate: e.target.value })} /><input className="rounded-md border px-3 py-2 text-sm" placeholder="Número do pedido" value={purchaseForm.orderNumber} onChange={(e) => setPurchaseForm({ ...purchaseForm, orderNumber: e.target.value })} /><select className="rounded-md border px-3 py-2 text-sm" value={purchaseForm.paymentMethod} onChange={(e) => setPurchaseForm({ ...purchaseForm, paymentMethod: e.target.value })}><option value="">Forma de pagamento</option><option value="pix">Pix</option><option value="credit_card">Cartão de crédito</option><option value="debit_card">Cartão de débito</option><option value="cash">Dinheiro</option><option value="boleto">Boleto</option><option value="bank_transfer">Transferência</option><option value="other">Outro</option></select></div>
              <Textarea placeholder="Observação" value={purchaseForm.notes} onChange={(e) => setPurchaseForm({ ...purchaseForm, notes: e.target.value })} />
              <div className="flex gap-2"><Button size="sm" onClick={savePurchase}>{editingPurchaseId ? 'Salvar compra' : 'Registrar venda'}</Button>{editingPurchaseId && <Button size="sm" variant="outline" onClick={resetPurchaseForm}>Cancelar</Button>}</div>
            </section>
            <section className="space-y-2">{purchases.length === 0 ? <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma compra registrada ainda.</div> : purchases.map((purchase, index) => <div key={purchase.id} className="rounded-xl border bg-white p-3 text-sm"><div className="flex items-start justify-between gap-2"><div><div className="font-medium">{new Date(purchase.purchaseDate).toLocaleDateString('pt-BR')} — {formatCurrencyBRLFromCents(purchase.amountCents)} {purchase.orderNumber ? `— Pedido #${purchase.orderNumber}` : ''} {purchase.paymentMethod ? `— ${purchase.paymentMethod}` : ''}</div><div className="text-xs text-muted-foreground">{purchases.length - index}ª compra{purchase.notes ? ` • ${purchase.notes}` : ''}</div></div><div className="flex gap-1"><Button size="icon" variant="ghost" onClick={() => editPurchase(purchase)}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" onClick={() => deletePurchase(purchase.id)}><Trash2 className="h-3.5 w-3.5 text-destructive" /></Button></div></div></div>)}</section>
          </TabsContent>

        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

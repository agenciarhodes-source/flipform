'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCorners } from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Phone, Mail, User as UserIcon, Flame, Snowflake, Thermometer, Workflow, ListChecks, AlertTriangle, CheckCircle2, Clock, ChevronLeft, ChevronRight, Plus, MessageCircle, CalendarDays } from 'lucide-react';
import Link from 'next/link';
import { LeadDetailModal } from '@/components/lead-detail-modal';
import { timeAgo } from '@/lib/utils';
import { ManualLeadDialog } from '@/components/manual-lead-dialog';
import { formatLeadSource } from '@/lib/leads';

interface Stage { id: string; name: string; color: string; orderIndex: number; isArchived?: boolean; }
interface Pipeline { id: string; name: string; isDefault: boolean; isArchived: boolean; stages: Stage[]; }
interface TaskIndicator { pending: number; overdue: number; dueToday: number; total: number; }
interface Lead {
  id: string; name: string; email: string | null; phone: string | null;
  stageId: string; source: string; temperature: 'cold' | 'warm' | 'hot'; tags: string[];
  createdAt: string; assignedUser: { id: string; name: string } | null;
}

function TempIcon({ t }: { t: Lead['temperature'] }) {
  if (t === 'hot') return <Flame className="w-3.5 h-3.5 text-red-500" />;
  if (t === 'warm') return <Thermometer className="w-3.5 h-3.5 text-amber-500" />;
  return <Snowflake className="w-3.5 h-3.5 text-sky-500" />;
}

function TaskBadge({ ind }: { ind: TaskIndicator | undefined }) {
  if (!ind || ind.total === 0) return null;
  if (ind.pending === 0) {
    return (
      <div title="Todas as tarefas concluídas" className="flex items-center gap-0.5 text-[10px] text-emerald-600 bg-emerald-50 border border-emerald-200 rounded px-1.5 py-0.5">
        <CheckCircle2 className="w-3 h-3" />
        <span>{ind.total}</span>
      </div>
    );
  }
  if (ind.overdue > 0) {
    return (
      <div title={`${ind.overdue} tarefa(s) vencida(s)`} className="flex items-center gap-0.5 text-[10px] text-red-600 bg-red-50 border border-red-200 rounded px-1.5 py-0.5 font-medium">
        <AlertTriangle className="w-3 h-3" />
        <span>{ind.pending}</span>
      </div>
    );
  }
  if (ind.dueToday > 0) {
    return (
      <div title={`${ind.dueToday} tarefa(s) vencendo hoje`} className="flex items-center gap-0.5 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
        <Clock className="w-3 h-3" />
        <span>{ind.pending}</span>
      </div>
    );
  }
  return (
    <div title={`${ind.pending} tarefa(s) pendente(s)`} className="flex items-center gap-0.5 text-[10px] text-blue-700 bg-blue-50 border border-blue-200 rounded px-1.5 py-0.5">
      <ListChecks className="w-3 h-3" />
      <span>{ind.pending}</span>
    </div>
  );
}

function LeadCard({ lead, taskInd, onClick, onOpenConversation }: { lead: Lead; taskInd?: TaskIndicator; onClick: () => void; onOpenConversation: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => { if (!isDragging) onClick(); }}
      className={`bg-card border rounded-md p-3 mb-2 cursor-grab active:cursor-grabbing hover:shadow-sm transition ${isDragging ? 'opacity-50' : ''} ${taskInd && taskInd.overdue > 0 ? 'border-l-2 border-l-red-500' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm truncate flex-1">{lead.name}</div>
        <TempIcon t={lead.temperature} />
      </div>
      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
        {lead.email && <div className="flex items-center gap-1.5 truncate"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{lead.email}</span></div>}
        {lead.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{lead.phone}</div>}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60 gap-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Badge variant="secondary" className="text-[10px] py-0 h-4">{formatLeadSource(lead.source)}</Badge>
          <TaskBadge ind={taskInd} />
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {lead.phone && (
            <button
              type="button"
              title="Abrir conversa no WhatsApp"
              aria-label={`Abrir conversa do WhatsApp de ${lead.name}`}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation();
                onOpenConversation();
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md text-emerald-700 transition-colors hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <MessageCircle className="h-4 w-4" />
            </button>
          )}
          {lead.assignedUser && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><UserIcon className="w-3 h-3" />{lead.assignedUser.name.split(' ')[0]}</div>}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">{timeAgo(lead.createdAt)}</div>
    </div>
  );
}

function Column({ stage, leads, taskInds, onCardClick, onOpenConversation }: { stage: Stage; leads: Lead[]; taskInds: Record<string, TaskIndicator>; onCardClick: (id: string) => void; onOpenConversation: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div className="flex-none w-[360px] min-w-[360px] max-w-[360px] h-full shrink-0 flex flex-col bg-muted/40 rounded-md">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
          <span className="text-sm font-semibold">{stage.name}</span>
        </div>
        <Badge variant="secondary" className="text-xs h-5">{leads.length}</Badge>
      </div>
      <div ref={setNodeRef} className={`flex-1 min-h-0 p-2 overflow-y-auto scrollbar-thin transition ${isOver ? 'bg-brand-50/60' : ''}`}>
        {leads.map((l) => <LeadCard key={l.id} lead={l} taskInd={taskInds[l.id]} onClick={() => onCardClick(l.id)} onOpenConversation={() => onOpenConversation(l.id)} />)}
        {leads.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">Sem leads</div>}
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [taskInds, setTaskInds] = useState<Record<string, TaskIndicator>>({});
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState<'7d' | '30d' | 'custom'>('30d');
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 29);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [endDate, setEndDate] = useState(() => {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  });
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [horizontalOffset, setHorizontalOffset] = useState(0);
  const [maxOffset, setMaxOffset] = useState(0);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

  const loadPipelines = async () => {
    const data = await fetch('/api/pipelines').then((r) => r.json());
    const list: Pipeline[] = data.pipelines || [];
    setPipelines(list);
    if (list.length && !pipelineId) {
      const def = list.find((p) => p.isDefault && !p.isArchived) || list.find((p) => !p.isArchived) || list[0];
      if (def) setPipelineId(def.id);
    }
  };

  const loadLeads = async () => {
    if (!pipelineId) { setLoading(false); return; }
    if (period === 'custom' && (!startDate || !endDate || startDate > endDate)) {
      setLeads([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const params = new URLSearchParams({ pipelineId, period });
    if (search) params.set('q', search);
    if (period === 'custom') {
      params.set('startDate', startDate);
      params.set('endDate', endDate);
    }
    try {
      const response = await fetch(`/api/leads?${params.toString()}`);
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível filtrar os leads.');
      setLeads(data.leads || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível filtrar os leads.');
    } finally {
      setLoading(false);
    }
  };

  const openWhatsAppConversation = async (leadId: string) => {
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

  useEffect(() => { loadPipelines(); }, []);
  useEffect(() => {
    const p = pipelines.find((x) => x.id === pipelineId);
    setStages((p?.stages || []).filter((s) => !s.isArchived));
  }, [pipelineId, pipelines]);
  useEffect(() => {
    const t = setTimeout(loadLeads, 300);
    return () => clearTimeout(t);
  /* eslint-disable-next-line */ }, [pipelineId, search, period, startDate, endDate]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;
    const board = boardScrollRef.current;
    if (!board) return;
    console.log('[kanban-scroll-debug]', {
      scrollWidth: board.scrollWidth,
      clientWidth: board.clientWidth,
      isScrollable: board.scrollWidth > board.clientWidth,
    });
  }, [stages.length, leads.length, pipelineId]);

  const onDragStart = (e: DragStartEvent) => setActiveId(e.active.id as string);
  const onDragEnd = async (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    const leadId = active.id as string;
    const newStageId = over.id as string;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stageId === newStageId) return;
    // Optimistic update
    setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stageId: newStageId } : l)));
    try {
      const res = await fetch(`/api/leads/${leadId}/move`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stageId: newStageId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Falha ao mover');
      }
      toast.success('Lead movido');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao mover lead');
      loadLeads();
    }
  };

  const activeLead = leads.find((l) => l.id === activeId);

  return (
    <div className="h-[calc(100vh-4rem)] flex min-h-0 flex-col overflow-hidden">
      <div className="p-4 lg:p-6 border-b bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          <Select value={pipelineId || ''} onValueChange={(v) => setPipelineId(v)}>
            <SelectTrigger className="w-64 font-semibold">
              <div className="flex items-center gap-2"><Workflow className="w-4 h-4 text-muted-foreground" /><SelectValue placeholder="Selecione um pipeline" /></div>
            </SelectTrigger>
            <SelectContent>
              {pipelines.filter((p) => !p.isArchived).map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}{p.isDefault ? ' • padrão' : ''}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground hidden lg:block">Arraste cards entre etapas para atualizar o status.</p>
          <div className="hidden lg:flex items-center gap-1">
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => boardScrollRef.current?.scrollBy({ left: -380, behavior: 'smooth' })}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button type="button" variant="outline" size="icon" className="h-8 w-8" onClick={() => boardScrollRef.current?.scrollBy({ left: 380, behavior: 'smooth' })}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <div className="flex items-center gap-2">
            <Select value={period} onValueChange={(value) => setPeriod(value as '7d' | '30d' | 'custom')}>
              <SelectTrigger className="w-[150px]" aria-label="Período do Kanban">
                <div className="flex items-center gap-2"><CalendarDays className="w-4 h-4 text-muted-foreground" /><SelectValue /></div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {period === 'custom' && (
              <div className="flex items-center gap-2">
                <Input aria-label="Data inicial do Kanban" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="w-[150px]" />
                <span className="text-xs text-muted-foreground">até</span>
                <Input aria-label="Data final do Kanban" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="w-[150px]" />
              </div>
            )}
          </div>
          <Button type="button" onClick={() => setManualOpen(true)} disabled={!pipelineId}><Plus className="w-4 h-4 mr-1" />Novo lead</Button>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar lead por nome, e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        </div>
      </div>
      <div className="border-b bg-muted/20 px-4 py-2 text-xs text-muted-foreground lg:px-6">
        Filtro por data de entrada do lead no funil · {period === '7d' ? 'últimos 7 dias' : period === '30d' ? 'últimos 30 dias' : `${startDate || '—'} até ${endDate || '—'}`}
      </div>
      <div className="w-full flex-1 min-h-0 overflow-hidden p-4 lg:p-6">
        {loading ? (
          <div className="text-muted-foreground">Carregando...</div>
        ) : stages.length === 0 ? (
          <div className="rounded-md border border-dashed p-12 text-center max-w-md mx-auto">
            <Workflow className="w-10 h-10 mx-auto text-muted-foreground/40 mb-3" />
            <h3 className="font-heading font-semibold mb-1">Pipeline sem etapas ativas</h3>
            <p className="text-sm text-muted-foreground mb-3">Configure as etapas em <Link href="/pipelines" className="text-primary underline">Pipelines</Link>.</p>
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="flex h-full min-h-0 flex-col">
            {stages.length > 4 && (
              <p className="text-xs text-muted-foreground mb-2">Role horizontalmente para ver mais etapas →</p>
            )}
            <div ref={boardScrollRef} className="kanban-scroll-area h-full w-full min-h-0 overflow-x-auto overflow-y-hidden pb-4" onWheel={(e) => {
              if (!e.shiftKey) return;
              e.preventDefault();
              boardScrollRef.current?.scrollBy({ left: e.deltaY > 0 ? 380 : -380, behavior: 'smooth' });
            }}>
              <div className="kanban-columns flex h-full gap-4 items-stretch pr-6" style={{ minWidth: `${stages.length * 380}px` }}>
                {stages.map((s) => (
                <Column
                  key={s.id}
                  stage={s}
                  leads={leads.filter((l) => l.stageId === s.id)}
                  taskInds={taskInds}
                  onCardClick={(id) => setSelectedLeadId(id)}
                  onOpenConversation={(id) => void openWhatsAppConversation(id)}
                />
                ))}
              </div>
            </div>
            </div>
            <DragOverlay>
              {activeLead && (
                <div className="bg-card border rounded-md p-3 shadow-lg w-72 rotate-2">
                  <div className="font-medium text-sm">{activeLead.name}</div>
                  <div className="text-xs text-muted-foreground mt-1">{activeLead.email}</div>
                </div>
              )}
            </DragOverlay>
          </DndContext>
        )}
      </div>
      <ManualLeadDialog open={manualOpen} onOpenChange={setManualOpen} pipelines={pipelines} defaultPipelineId={pipelineId} onCreated={loadLeads} />
      {selectedLeadId && (
        <LeadDetailModal
          leadId={selectedLeadId}
          stages={stages}
          onClose={() => setSelectedLeadId(null)}
          onChange={loadLeads}
        />
      )}
    </div>
  );
}
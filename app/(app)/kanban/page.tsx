'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { DndContext, DragEndEvent, DragOverlay, DragStartEvent, PointerSensor, useSensor, useSensors, closestCorners } from '@dnd-kit/core';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Phone, Mail, User as UserIcon, Flame, Snowflake, Thermometer } from 'lucide-react';
import { LeadDetailModal } from '@/components/lead-detail-modal';
import { timeAgo } from '@/lib/utils';

interface Stage { id: string; name: string; color: string; orderIndex: number; }
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

function LeadCard({ lead, onClick }: { lead: Lead; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: lead.id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(e) => { if (!isDragging) onClick(); }}
      className={`bg-card border rounded-md p-3 mb-2 cursor-grab active:cursor-grabbing hover:shadow-sm transition ${isDragging ? 'opacity-50' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-sm truncate flex-1">{lead.name}</div>
        <TempIcon t={lead.temperature} />
      </div>
      <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
        {lead.email && <div className="flex items-center gap-1.5 truncate"><Mail className="w-3 h-3 shrink-0" /><span className="truncate">{lead.email}</span></div>}
        {lead.phone && <div className="flex items-center gap-1.5"><Phone className="w-3 h-3" />{lead.phone}</div>}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/60">
        <Badge variant="secondary" className="text-[10px] py-0 h-4 capitalize">{lead.source}</Badge>
        <div className="flex items-center gap-1">
          {lead.assignedUser && <div className="flex items-center gap-1 text-[10px] text-muted-foreground"><UserIcon className="w-3 h-3" />{lead.assignedUser.name.split(' ')[0]}</div>}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground mt-1">{timeAgo(lead.createdAt)}</div>
    </div>
  );
}

function Column({ stage, leads, onCardClick }: { stage: Stage; leads: Lead[]; onCardClick: (id: string) => void }) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <div className="w-72 shrink-0 flex flex-col bg-muted/40 rounded-md">
      <div className="px-3 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: stage.color }} />
          <span className="text-sm font-semibold">{stage.name}</span>
        </div>
        <Badge variant="secondary" className="text-xs h-5">{leads.length}</Badge>
      </div>
      <div ref={setNodeRef} className={`flex-1 p-2 overflow-y-auto scrollbar-thin min-h-[200px] transition ${isOver ? 'bg-brand-50/60' : ''}`}>
        {leads.map((l) => <LeadCard key={l.id} lead={l} onClick={() => onCardClick(l.id)} />)}
        {leads.length === 0 && <div className="text-xs text-muted-foreground text-center py-8">Sem leads</div>}
      </div>
    </div>
  );
}

export default function KanbanPage() {
  const [stages, setStages] = useState<Stage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const load = async () => {
    const [pipRes, leadsRes] = await Promise.all([
      fetch('/api/pipelines').then((r) => r.json()),
      fetch(`/api/leads${search ? `?q=${encodeURIComponent(search)}` : ''}`).then((r) => r.json()),
    ]);
    const def = pipRes.pipelines.find((p: any) => p.isDefault) || pipRes.pipelines[0];
    if (def) setStages(def.stages);
    setLeads(leadsRes.leads);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);
  useEffect(() => { const t = setTimeout(load, 300); return () => clearTimeout(t); }, [search]);

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
      if (!res.ok) throw new Error('Falha ao mover');
      toast.success('Lead movido');
    } catch {
      toast.error('Erro ao mover lead');
      load();
    }
  };

  const activeLead = leads.find((l) => l.id === activeId);

  return (
    <div className="h-full flex flex-col">
      <div className="p-4 lg:p-6 border-b bg-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl lg:text-2xl font-bold">Funil de Vendas</h1>
          <p className="text-xs text-muted-foreground">Arraste cards entre etapas para atualizar o status.</p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Buscar lead por nome, e-mail..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
      </div>
      <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 lg:p-6">
        {loading ? (
          <div className="text-muted-foreground">Carregando...</div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCorners} onDragStart={onDragStart} onDragEnd={onDragEnd}>
            <div className="flex gap-4 h-full">
              {stages.map((s) => (
                <Column
                  key={s.id}
                  stage={s}
                  leads={leads.filter((l) => l.stageId === s.id)}
                  onCardClick={(id) => setSelectedLeadId(id)}
                />
              ))}
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
      {selectedLeadId && (
        <LeadDetailModal
          leadId={selectedLeadId}
          stages={stages}
          onClose={() => setSelectedLeadId(null)}
          onChange={load}
        />
      )}
    </div>
  );
}

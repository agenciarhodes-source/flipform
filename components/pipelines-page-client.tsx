'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DndContext, DragEndEvent, PointerSensor, useSensor, useSensors, closestCenter } from '@dnd-kit/core';
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Plus, Copy, Trash2, Archive, ArchiveRestore, Star, GripVertical, Edit3, MoreHorizontal, X, Check, ArrowLeft, Layers, Workflow, AlertTriangle } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator } from '@/components/ui/dropdown-menu';
import { can } from '@/lib/rbac';
import type { SessionPayload } from '@/lib/auth';

interface Stage { id: string; name: string; color: string; orderIndex: number; isArchived: boolean; _count?: { leads: number; formsAsInitial: number } }
interface Pipeline {
  id: string; name: string; isDefault: boolean; isArchived: boolean; stages: Stage[];
  _count: { leads: number; forms: number };
}

const SUGGESTED_COLORS = ['#3B82F6', '#8B5CF6', '#06B6D4', '#F59E0B', '#EC4899', '#10B981', '#EF4444', '#64748B'];

export function PipelinesPageClient({ session }: { session: SessionPayload }) {
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const canCreate = can(session.role, 'PIPELINES_CREATE');
  const canEdit = can(session.role, 'PIPELINES_EDIT');
  const canDelete = can(session.role, 'PIPELINES_DELETE');

  const load = async () => {
    setLoading(true);
    const data = await fetch(`/api/pipelines?includeArchived=${includeArchived ? '1' : '0'}`).then((r) => r.json());
    setPipelines(data.pipelines || []);
    if (!selectedId && data.pipelines?.length) setSelectedId(data.pipelines[0].id);
    setLoading(false);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [includeArchived]);

  const selected = pipelines.find((p) => p.id === selectedId) || null;

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Lista de pipelines */}
      <aside className="w-full lg:w-72 lg:border-r bg-card overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <div>
            <h2 className="font-heading font-bold">Pipelines</h2>
            <p className="text-xs text-muted-foreground">{pipelines.length} cadastrado(s)</p>
          </div>
          {canCreate && <Button size="sm" onClick={() => setCreateOpen(true)}><Plus className="w-4 h-4" /></Button>}
        </div>
        <div className="p-3 flex items-center justify-between text-xs">
          <label className="flex items-center gap-2 text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} className="rounded" />
            Mostrar arquivados
          </label>
        </div>
        <div className="p-2 space-y-1">
          {loading ? <div className="p-3 text-sm text-muted-foreground">Carregando...</div> :
            pipelines.length === 0 ? <div className="p-6 text-center text-sm text-muted-foreground">Nenhum pipeline.</div> :
            pipelines.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedId(p.id)}
                className={`w-full text-left p-3 rounded-md border transition ${selectedId === p.id ? 'border-brand-500 bg-brand-50' : 'border-transparent hover:bg-muted'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Workflow className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                    <span className="font-medium text-sm truncate">{p.name}</span>
                  </div>
                  {p.isDefault && <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 h-5 px-1.5 gap-1"><Star className="w-2.5 h-2.5" fill="currentColor" />Padrão</Badge>}
                  {p.isArchived && <Badge variant="outline" className="bg-slate-100 text-slate-600 h-5 px-1.5">Arquivado</Badge>}
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span>{p.stages.filter((s) => !s.isArchived).length} etapas</span>
                  <span>{p._count.leads} leads</span>
                  <span>{p._count.forms} forms</span>
                </div>
              </button>
            ))
          }
        </div>
      </aside>

      {/* Editor */}
      <div className="flex-1 overflow-y-auto">
        {selected ? (
          <PipelineEditor
            key={selected.id}
            pipeline={selected}
            canEdit={canEdit}
            canDelete={canDelete}
            onChange={load}
          />
        ) : (
          <div className="h-full flex items-center justify-center p-8">
            <div className="text-center text-muted-foreground">
              <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Selecione um pipeline à esquerda.</p>
            </div>
          </div>
        )}
      </div>

      {createOpen && <CreatePipelineDialog onClose={() => setCreateOpen(false)} onCreated={(p) => { setCreateOpen(false); setSelectedId(p.id); load(); }} />}
    </div>
  );
}

function PipelineEditor({ pipeline, canEdit, canDelete, onChange }: { pipeline: Pipeline; canEdit: boolean; canDelete: boolean; onChange: () => void }) {
  const [name, setName] = useState(pipeline.name);
  const [editingName, setEditingName] = useState(false);
  const [stages, setStages] = useState<Stage[]>(pipeline.stages.filter((s) => !s.isArchived));
  const [showArchived, setShowArchived] = useState(false);
  const [addingStage, setAddingStage] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  useEffect(() => {
    setName(pipeline.name);
    setStages(showArchived ? pipeline.stages : pipeline.stages.filter((s) => !s.isArchived));
  }, [pipeline, showArchived]);

  const saveName = async () => {
    if (name.trim() === pipeline.name || name.trim().length < 2) { setEditingName(false); setName(pipeline.name); return; }
    const res = await fetch(`/api/pipelines/${pipeline.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
    if (res.ok) { toast.success('Pipeline atualizado'); setEditingName(false); onChange(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro'); }
  };

  const setDefault = async () => {
    const res = await fetch(`/api/pipelines/${pipeline.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isDefault: true }) });
    if (res.ok) { toast.success('Definido como padrão'); onChange(); }
  };

  const duplicate = async () => {
    const res = await fetch(`/api/pipelines/${pipeline.id}/duplicate`, { method: 'POST' });
    if (res.ok) { toast.success('Pipeline duplicado'); onChange(); }
  };

  const archive = async () => {
    const res = await fetch(`/api/pipelines/${pipeline.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isArchived: !pipeline.isArchived }) });
    if (res.ok) { toast.success(pipeline.isArchived ? 'Pipeline reativado' : 'Pipeline arquivado'); onChange(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro'); }
  };

  const removePipeline = async () => {
    if (!confirm(`Excluir o pipeline "${pipeline.name}"? Esta ação não pode ser desfeita.`)) return;
    const res = await fetch(`/api/pipelines/${pipeline.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Pipeline excluído'); onChange(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro'); }
  };

  const onDragEnd = async (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const visible = stages.filter((s) => !s.isArchived);
    const oldIdx = visible.findIndex((s) => s.id === active.id);
    const newIdx = visible.findIndex((s) => s.id === over.id);
    if (oldIdx < 0 || newIdx < 0) return;
    const reordered = arrayMove(visible, oldIdx, newIdx);
    const merged = [...reordered, ...stages.filter((s) => s.isArchived)];
    setStages(merged.map((s, i) => ({ ...s, orderIndex: i })));
    const ids = reordered.map((s) => s.id);
    const res = await fetch(`/api/pipelines/${pipeline.id}/stages/reorder`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stageIds: ids }),
    });
    if (!res.ok) { toast.error('Erro ao reordenar'); onChange(); }
  };

  const visibleStages = showArchived ? stages : stages.filter((s) => !s.isArchived);

  return (
    <div className="p-4 lg:p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {editingName ? (
            <div className="flex items-center gap-2">
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus className="max-w-md text-xl font-bold" />
              <Button size="sm" onClick={saveName}><Check className="w-4 h-4" /></Button>
              <Button size="sm" variant="ghost" onClick={() => { setEditingName(false); setName(pipeline.name); }}><X className="w-4 h-4" /></Button>
            </div>
          ) : (
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-heading text-2xl lg:text-3xl font-bold">{pipeline.name}</h1>
              {canEdit && <Button size="sm" variant="ghost" onClick={() => setEditingName(true)}><Edit3 className="w-3.5 h-3.5" /></Button>}
              {pipeline.isDefault && <Badge className="bg-amber-100 text-amber-700 border-amber-200 gap-1"><Star className="w-3 h-3" fill="currentColor" />Padrão</Badge>}
              {pipeline.isArchived && <Badge variant="outline" className="bg-slate-100">Arquivado</Badge>}
            </div>
          )}
          <p className="text-sm text-muted-foreground mt-1">
            {pipeline._count.leads} leads vinculados • {pipeline._count.forms} formulários usando este pipeline
          </p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {canEdit && !pipeline.isDefault && <DropdownMenuItem onClick={setDefault}><Star className="w-3.5 h-3.5 mr-2" />Definir como padrão</DropdownMenuItem>}
            {canEdit && <DropdownMenuItem onClick={duplicate}><Copy className="w-3.5 h-3.5 mr-2" />Duplicar</DropdownMenuItem>}
            {canEdit && <DropdownMenuItem onClick={archive}>{pipeline.isArchived ? <><ArchiveRestore className="w-3.5 h-3.5 mr-2" />Reativar</> : <><Archive className="w-3.5 h-3.5 mr-2" />Arquivar</>}</DropdownMenuItem>}
            {canDelete && !pipeline.isDefault && (<>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={removePipeline}><Trash2 className="w-3.5 h-3.5 mr-2" />Excluir</DropdownMenuItem>
            </>)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Card className="p-5">
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div>
            <h3 className="font-heading font-semibold">Etapas do funil</h3>
            <p className="text-xs text-muted-foreground">Arraste para reordenar. Clique para editar.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="rounded" />
              Mostrar arquivadas
            </label>
            {canEdit && <Button size="sm" onClick={() => setAddingStage(true)}><Plus className="w-4 h-4 mr-1" />Etapa</Button>}
          </div>
        </div>

        {visibleStages.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground border border-dashed rounded-md">
            Nenhuma etapa. Crie a primeira para começar.
          </div>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={visibleStages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {visibleStages.map((s) => <StageRow key={s.id} pipelineId={pipeline.id} stage={s} canEdit={canEdit} onChange={onChange} />)}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </Card>

      {addingStage && (
        <AddStageDialog
          pipelineId={pipeline.id}
          onClose={() => setAddingStage(false)}
          onCreated={() => { setAddingStage(false); onChange(); }}
        />
      )}
    </div>
  );
}

function StageRow({ pipelineId, stage, canEdit, onChange }: { pipelineId: string; stage: Stage; canEdit: boolean; onChange: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: stage.id, disabled: !canEdit });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color);

  const save = async () => {
    if (!name.trim()) return;
    const res = await fetch(`/api/pipelines/${pipelineId}/stages/${stage.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), color }),
    });
    if (res.ok) { toast.success('Etapa atualizada'); setEditing(false); onChange(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro'); }
  };
  const archive = async () => {
    const res = await fetch(`/api/pipelines/${pipelineId}/stages/${stage.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isArchived: !stage.isArchived }),
    });
    if (res.ok) { toast.success(stage.isArchived ? 'Etapa reativada' : 'Etapa arquivada'); onChange(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro'); }
  };
  const remove = async () => {
    if (!confirm(`Excluir etapa "${stage.name}"?`)) return;
    const res = await fetch(`/api/pipelines/${pipelineId}/stages/${stage.id}`, { method: 'DELETE' });
    if (res.ok) { toast.success('Etapa excluída'); onChange(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro'); }
  };

  const leadsCount = stage._count?.leads || 0;

  return (
    <div ref={setNodeRef} style={style} className={`border rounded-md p-3 bg-card ${stage.isArchived ? 'opacity-60' : ''}`}>
      <div className="flex items-center gap-3">
        {canEdit && <button {...attributes} {...listeners} className="text-muted-foreground hover:text-foreground cursor-grab active:cursor-grabbing"><GripVertical className="w-4 h-4" /></button>}
        {editing ? (
          <>
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-8 h-8 rounded border cursor-pointer" />
            <Input value={name} onChange={(e) => setName(e.target.value)} className="flex-1" autoFocus onKeyDown={(e) => e.key === 'Enter' && save()} />
            <div className="flex gap-1">
              {SUGGESTED_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`w-5 h-5 rounded ${color === c ? 'ring-2 ring-offset-1 ring-foreground' : ''}`} style={{ backgroundColor: c }} />
              ))}
            </div>
            <Button size="sm" onClick={save}><Check className="w-3 h-3" /></Button>
            <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setName(stage.name); setColor(stage.color); }}><X className="w-3 h-3" /></Button>
          </>
        ) : (
          <>
            <div className="w-4 h-4 rounded" style={{ backgroundColor: stage.color }} />
            <span className="font-medium flex-1">{stage.name}</span>
            <Badge variant="secondary" className="text-xs h-5">{leadsCount} {leadsCount === 1 ? 'lead' : 'leads'}</Badge>
            {stage.isArchived && <Badge variant="outline" className="bg-slate-100 text-slate-600 h-5">Arquivada</Badge>}
            {canEdit && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild><Button variant="ghost" size="icon"><MoreHorizontal className="w-4 h-4" /></Button></DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => setEditing(true)}><Edit3 className="w-3.5 h-3.5 mr-2" />Editar</DropdownMenuItem>
                  <DropdownMenuItem onClick={archive}>{stage.isArchived ? <><ArchiveRestore className="w-3.5 h-3.5 mr-2" />Reativar</> : <><Archive className="w-3.5 h-3.5 mr-2" />Arquivar</>}</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={remove}><Trash2 className="w-3.5 h-3.5 mr-2" />Excluir</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function AddStageDialog({ pipelineId, onClose, onCreated }: { pipelineId: string; onClose: () => void; onCreated: () => void }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('#3B82F6');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    const res = await fetch(`/api/pipelines/${pipelineId}/stages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name.trim(), color }),
    });
    setLoading(false);
    if (res.ok) { toast.success('Etapa criada'); onCreated(); }
    else { const d = await res.json(); toast.error(d.error || 'Erro'); }
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-heading">Nova etapa</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Apresentação" autoFocus /></div>
          <div>
            <Label>Cor</Label>
            <div className="flex gap-2 mt-2 flex-wrap">
              {SUGGESTED_COLORS.map((c) => (
                <button key={c} type="button" onClick={() => setColor(c)} className={`w-9 h-9 rounded-md ${color === c ? 'ring-2 ring-offset-2 ring-foreground' : ''}`} style={{ backgroundColor: c }} />
              ))}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="w-9 h-9 rounded-md cursor-pointer" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={!name || loading}>{loading ? 'Criando...' : 'Criar etapa'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreatePipelineDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (p: any) => void }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async () => {
    if (name.trim().length < 2) return;
    setLoading(true);
    const res = await fetch('/api/pipelines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: name.trim() }) });
    setLoading(false);
    const data = await res.json();
    if (res.ok) { toast.success('Pipeline criado'); onCreated(data.pipeline); }
    else toast.error(data.error || 'Erro');
  };
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-heading">Novo pipeline</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>Nome do pipeline</Label><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Funil de Outbound" autoFocus /></div>
          <p className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2 flex items-start gap-2">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            O pipeline será criado com 3 etapas padrão (Novo lead, Em andamento, Ganho). Você pode customizar depois.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={submit} disabled={name.trim().length < 2 || loading}>{loading ? 'Criando...' : 'Criar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

'use client';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/utils';
import {
  CheckCircle2, Circle, Trash2, Pencil, Plus, Calendar, AlertTriangle, Clock,
  ChevronUp, ChevronsUp, ChevronDown, User as UserIcon,
} from 'lucide-react';

export interface TaskItem {
  id: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'completed' | 'overdue';
  assignedTo: string | null;
  createdBy: string | null;
  completedAt: string | null;
  createdAt: string;
  assignee: { id: string; name: string } | null;
  creator: { id: string; name: string } | null;
}

interface TenantUser { userId: string; name: string; email: string; role: string; }

function priorityClasses(p: TaskItem['priority']) {
  if (p === 'high') return 'bg-red-100 text-red-700 border-red-200';
  if (p === 'medium') return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function priorityLabel(p: TaskItem['priority']) {
  if (p === 'high') return 'Alta';
  if (p === 'medium') return 'Média';
  return 'Baixa';
}

function PriorityIcon({ p }: { p: TaskItem['priority'] }) {
  if (p === 'high') return <ChevronsUp className="w-3 h-3" />;
  if (p === 'medium') return <ChevronUp className="w-3 h-3" />;
  return <ChevronDown className="w-3 h-3" />;
}

function isOverdue(t: TaskItem): boolean {
  if (t.status !== 'pending' || !t.dueDate) return false;
  return new Date(t.dueDate) < new Date();
}

function isDueToday(t: TaskItem): boolean {
  if (t.status !== 'pending' || !t.dueDate) return false;
  const due = new Date(t.dueDate);
  const now = new Date();
  return due.getFullYear() === now.getFullYear() && due.getMonth() === now.getMonth() && due.getDate() === now.getDate();
}

// "2025-06-30T18:00" para input datetime-local
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// "2025-06-30T18:00" -> ISO com timezone
function fromLocalInput(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (isNaN(d.getTime())) return null;
  return d.toISOString();
}

interface TaskFormData {
  title: string;
  description: string;
  dueDate: string; // local input
  priority: TaskItem['priority'];
  assignedTo: string | 'none';
}

const EMPTY_FORM: TaskFormData = {
  title: '',
  description: '',
  dueDate: '',
  priority: 'medium',
  assignedTo: 'none',
};

export function TasksTab({
  leadId,
  onChange,
}: {
  leadId: string;
  onChange?: () => void;
}) {
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [users, setUsers] = useState<TenantUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TaskItem | null>(null);
  const [form, setForm] = useState<TaskFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [tasksRes, usersRes] = await Promise.all([
        fetch(`/api/leads/${leadId}/tasks`).then((r) => r.json()),
        fetch('/api/users').then((r) => r.json()),
      ]);
      setTasks(tasksRes.tasks || []);
      setUsers(usersRes.users || []);
    } catch (e) {
      toast.error('Erro ao carregar tarefas');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [leadId]);

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormOpen(true);
  };

  const openEdit = (task: TaskItem) => {
    setEditing(task);
    setForm({
      title: task.title,
      description: task.description ?? '',
      dueDate: toLocalInput(task.dueDate),
      priority: task.priority,
      assignedTo: task.assignedTo ?? 'none',
    });
    setFormOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('Informe um título');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description.trim() || null,
        dueDate: fromLocalInput(form.dueDate),
        priority: form.priority,
        assignedTo: form.assignedTo === 'none' ? null : form.assignedTo,
      };
      const url = editing
        ? `/api/leads/${leadId}/tasks/${editing.id}`
        : `/api/leads/${leadId}/tasks`;
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao salvar tarefa');
      toast.success(editing ? 'Tarefa atualizada' : 'Tarefa criada');
      setFormOpen(false);
      await load();
      onChange?.();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao salvar tarefa');
    } finally {
      setSaving(false);
    }
  };

  const toggleComplete = async (task: TaskItem) => {
    const newStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      const res = await fetch(`/api/leads/${leadId}/tasks/${task.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro');
      toast.success(newStatus === 'completed' ? 'Tarefa concluída' : 'Tarefa reaberta');
      await load();
      onChange?.();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao alterar status');
    }
  };

  const remove = async (task: TaskItem) => {
    if (!confirm(`Excluir a tarefa "${task.title}"?`)) return;
    try {
      const res = await fetch(`/api/leads/${leadId}/tasks/${task.id}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir');
      toast.success('Tarefa excluída');
      await load();
      onChange?.();
    } catch (e: any) {
      toast.error(e.message || 'Erro ao excluir');
    }
  };

  const pending = tasks.filter((t) => t.status === 'pending');
  const completed = tasks.filter((t) => t.status === 'completed');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {pending.length} pendente{pending.length !== 1 ? 's' : ''} • {completed.length} concluída{completed.length !== 1 ? 's' : ''}
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" /> Nova tarefa
        </Button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground text-center py-8">Carregando tarefas...</div>
      ) : tasks.length === 0 ? (
        <div className="border border-dashed rounded-md p-8 text-center">
          <Clock className="w-8 h-8 mx-auto text-muted-foreground/40 mb-2" />
          <div className="font-medium">Nenhuma tarefa criada para este lead</div>
          <div className="text-xs text-muted-foreground mt-1">Crie tarefas de follow-up, ligações ou propostas.</div>
        </div>
      ) : (
        <div className="space-y-2">
          {[...pending, ...completed].map((t) => {
            const overdue = isOverdue(t);
            const today = isDueToday(t);
            return (
              <div
                key={t.id}
                className={`group border rounded-md p-3 transition ${
                  t.status === 'completed' ? 'bg-muted/30 opacity-75' : overdue ? 'border-red-300 bg-red-50/40' : today ? 'border-amber-300 bg-amber-50/40' : 'bg-card'
                }`}
              >
                <div className="flex items-start gap-3">
                  <button
                    onClick={() => toggleComplete(t)}
                    className="mt-0.5 shrink-0 hover:scale-110 transition"
                    title={t.status === 'completed' ? 'Reabrir' : 'Concluir'}
                  >
                    {t.status === 'completed' ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                    ) : (
                      <Circle className="w-5 h-5 text-muted-foreground hover:text-emerald-500" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className={`font-medium text-sm ${t.status === 'completed' ? 'line-through text-muted-foreground' : ''}`}>
                        {t.title}
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                        <button onClick={() => openEdit(t)} className="p-1 hover:bg-muted rounded" title="Editar">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => remove(t)} className="p-1 hover:bg-muted rounded text-destructive" title="Excluir">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {t.description && (
                      <div className={`text-xs mt-1 whitespace-pre-wrap ${t.status === 'completed' ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
                        {t.description}
                      </div>
                    )}
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      <Badge variant="outline" className={`text-[10px] py-0 h-5 ${priorityClasses(t.priority)}`}>
                        <PriorityIcon p={t.priority} />
                        <span className="ml-0.5">{priorityLabel(t.priority)}</span>
                      </Badge>
                      {t.dueDate && (
                        <Badge variant="outline" className={`text-[10px] py-0 h-5 ${overdue ? 'bg-red-100 text-red-700 border-red-200' : today ? 'bg-amber-100 text-amber-700 border-amber-200' : 'bg-blue-50 text-blue-700 border-blue-200'}`}>
                          {overdue ? <AlertTriangle className="w-3 h-3" /> : <Calendar className="w-3 h-3" />}
                          <span className="ml-0.5">{formatDateTime(t.dueDate)}</span>
                        </Badge>
                      )}
                      {t.assignee && (
                        <Badge variant="secondary" className="text-[10px] py-0 h-5">
                          <UserIcon className="w-3 h-3 mr-0.5" />
                          {t.assignee.name}
                        </Badge>
                      )}
                      {t.status === 'completed' && t.completedAt && (
                        <span className="text-[10px] text-muted-foreground">
                          Concluída em {formatDateTime(t.completedAt)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={formOpen} onOpenChange={(o) => !saving && setFormOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium">Título *</label>
              <Input
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Ex.: Ligar para confirmar reunião"
                maxLength={200}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Descrição</label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Detalhes da tarefa..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Vencimento</label>
                <Input
                  type="datetime-local"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Prioridade</label>
                <Select value={form.priority} onValueChange={(v: any) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Baixa</SelectItem>
                    <SelectItem value="medium">Média</SelectItem>
                    <SelectItem value="high">Alta</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Responsável</label>
              <Select value={form.assignedTo} onValueChange={(v) => setForm({ ...form, assignedTo: v })}>
                <SelectTrigger><SelectValue placeholder="Sem responsável" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem responsável</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.userId} value={u.userId}>{u.name} <span className="text-xs text-muted-foreground">({u.role})</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving ? 'Salvando...' : editing ? 'Salvar alterações' : 'Criar tarefa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

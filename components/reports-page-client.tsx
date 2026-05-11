'use client';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { StatCard } from '@/components/stat-card';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import {
  Users, Trophy, TrendingUp, AlertCircle, Clock, Target, Download, Filter, Loader2, Inbox,
  ListChecks, AlertTriangle, CheckCircle2,
} from 'lucide-react';

const COLORS = ['#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#06B6D4', '#F97316'];

interface Option { id: string; name: string; }
interface ReportOptions {
  pipelines: { id: string; name: string; isArchived: boolean }[];
  forms: { id: string; name: string; slug: string; isActive: boolean }[];
  users: { id: string; name: string; email: string; role: string }[];
  sources: { value: string; count: number }[];
}

interface SummaryData {
  range: { from: string; to: string };
  totals: { total: number; novos: number; ganhos: number; perdidos: number; abertos: number; conversionRate: number; avgFirstMoveHours: number; avgCycleHours: number };
  tasks: { pending: number; overdue: number; completedInRange: number };
}

const RANGES = [
  { v: 'today', l: 'Hoje' },
  { v: '7d', l: '7 dias' },
  { v: '30d', l: '30 dias' },
  { v: '90d', l: '90 dias' },
  { v: 'custom', l: 'Customizado' },
];

interface ReportsPageClientProps {
  canExport: boolean;
}

export function ReportsPageClient({ canExport }: ReportsPageClientProps) {
  const [range, setRange] = useState<string>('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pipelineId, setPipelineId] = useState<string>('all');
  const [formId, setFormId] = useState<string>('all');
  const [source, setSource] = useState<string>('all');
  const [assignedTo, setAssignedTo] = useState<string>('all');

  const [options, setOptions] = useState<ReportOptions | null>(null);
  const [summary, setSummary] = useState<SummaryData | null>(null);
  const [byDay, setByDay] = useState<any[]>([]);
  const [byStage, setByStage] = useState<any[]>([]);
  const [bySource, setBySource] = useState<any[]>([]);
  const [byForm, setByForm] = useState<any[]>([]);
  const [byAgent, setByAgent] = useState<any[]>([]);
  const [byTaskAgent, setByTaskAgent] = useState<any[]>([]);
  const [lostReasons, setLostReasons] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    p.set('range', range);
    if (range === 'custom') {
      if (from) p.set('from', from);
      if (to) p.set('to', to);
    }
    if (pipelineId !== 'all') p.set('pipelineId', pipelineId);
    if (formId !== 'all') p.set('formId', formId);
    if (source !== 'all') p.set('source', source);
    if (assignedTo !== 'all') p.set('assignedTo', assignedTo);
    return p.toString();
  }, [range, from, to, pipelineId, formId, source, assignedTo]);

  // Carregar opções uma vez
  useEffect(() => {
    fetch('/api/reports/options').then((r) => r.json()).then(setOptions).catch(() => setOptions(null));
  }, []);

  // Carregar dados quando filtros mudam
  useEffect(() => {
    setLoading(true);
    const url = (ep: string) => `/api/reports/${ep}?${qs}`;
    // Helper resiliente: nunca rejeita; em erro de rede, devolve fallback.
    const safeFetch = async <T,>(ep: string, fallback: T): Promise<T> => {
      try {
        const r = await fetch(url(ep));
        if (!r.ok) return fallback;
        return await r.json();
      } catch {
        return fallback;
      }
    };
    Promise.all([
      safeFetch<SummaryData | null>('summary', null),
      safeFetch<{ data: any[] }>('leads-by-day', { data: [] }),
      safeFetch<{ data: any[] }>('leads-by-stage', { data: [] }),
      safeFetch<{ data: any[] }>('leads-by-source', { data: [] }),
      safeFetch<{ data: any[] }>('leads-by-form', { data: [] }),
      safeFetch<{ data: any[] }>('agent-performance', { data: [] }),
      safeFetch<{ data: any[] }>('task-performance', { data: [] }),
      safeFetch<{ data: any[] }>('lost-reasons', { data: [] }),
    ]).then(([s, d, st, sr, fr, ag, tag, lr]) => {
      setSummary(s);
      setByDay(d?.data || []);
      setByStage(st?.data || []);
      setBySource(sr?.data || []);
      setByForm(fr?.data || []);
      setByAgent(ag?.data || []);
      setByTaskAgent(tag?.data || []);
      setLostReasons(lr?.data || []);
      setLoading(false);
    });
  }, [qs]);

  const downloadCSV = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/reports/export?${qs}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Erro ao exportar');
      }
      const blob = await res.blob();
      const cd = res.headers.get('content-disposition') || '';
      const match = cd.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : 'flipform-leads.csv';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success('CSV exportado com sucesso');
    } catch (e: any) {
      toast.error(e.message || 'Erro ao exportar CSV');
    } finally {
      setExporting(false);
    }
  };

  const fmtHours = (h: number) => {
    if (!h || h === 0) return '—';
    if (h < 24) return `${h}h`;
    return `${(h / 24).toFixed(1)} d`;
  };

  return (
    <div className="p-4 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl lg:text-3xl font-bold">Relatórios</h1>
          <p className="text-muted-foreground text-sm">Análise de performance comercial e operacional.</p>
        </div>
        {canExport && (
          <Button onClick={downloadCSV} disabled={exporting || loading} data-testid="export-csv-btn">
            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
            Exportar CSV
          </Button>
        )}
      </div>

      {/* Filtros */}
      <Card className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Filter className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Filtros</span>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          <div>
            <label className="text-xs text-muted-foreground">Período</label>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RANGES.map((r) => <SelectItem key={r.v} value={r.v}>{r.l}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {range === 'custom' && (
            <>
              <div>
                <label className="text-xs text-muted-foreground">De</label>
                <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Até</label>
                <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </div>
            </>
          )}
          <div>
            <label className="text-xs text-muted-foreground">Pipeline</label>
            <Select value={pipelineId} onValueChange={setPipelineId}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os pipelines</SelectItem>
                {options?.pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}{p.isArchived ? ' (arquivado)' : ''}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Formulário</label>
            <Select value={formId} onValueChange={setFormId}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os formulários</SelectItem>
                {options?.forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Origem</label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue placeholder="Todas" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as origens</SelectItem>
                {options?.sources.map((s) => <SelectItem key={s.value} value={s.value}>{s.value} ({s.count})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Responsável</label>
            <Select value={assignedTo} onValueChange={setAssignedTo}>
              <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os responsáveis</SelectItem>
                {options?.users.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {loading ? (
        <div className="text-center py-12 text-muted-foreground"><Loader2 className="w-6 h-6 animate-spin inline mr-2" />Carregando relatórios...</div>
      ) : (
        <>
          {/* Cards de resumo */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total de leads" value={summary?.totals.total ?? 0} icon={Users} />
            <StatCard label="Ganhos" value={summary?.totals.ganhos ?? 0} icon={Trophy} tone="success" />
            <StatCard label="Perdidos" value={summary?.totals.perdidos ?? 0} icon={AlertCircle} tone="danger" />
            <StatCard label="Taxa de conversão" value={`${summary?.totals.conversionRate ?? 0}%`} icon={TrendingUp} tone="success" />
            <StatCard label="Em aberto" value={summary?.totals.abertos ?? 0} icon={Target} tone="warning" />
            <StatCard label="Tempo médio até 1ª ação" value={fmtHours(summary?.totals.avgFirstMoveHours ?? 0)} icon={Clock} />
            <StatCard label="Tempo médio no funil" value={fmtHours(summary?.totals.avgCycleHours ?? 0)} icon={Clock} />
            <StatCard label="Tarefas pendentes" value={summary?.tasks.pending ?? 0} icon={ListChecks} />
          </div>

          {/* Cards de tarefas */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <StatCard label="Tarefas pendentes (filtrado)" value={summary?.tasks.pending ?? 0} icon={ListChecks} />
            <StatCard label="Tarefas vencidas" value={summary?.tasks.overdue ?? 0} icon={AlertTriangle} tone="danger" />
            <StatCard label="Tarefas concluídas no período" value={summary?.tasks.completedInRange ?? 0} icon={CheckCircle2} tone="success" />
          </div>

          {/* Gráficos */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-1">Leads por dia</h3>
              <p className="text-xs text-muted-foreground mb-4">Entrada de leads + status</p>
              {byDay.length === 0 || byDay.every((d) => d.total === 0) ? (
                <EmptyChart text="Sem leads no período" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <LineChart data={byDay}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="total" name="Total" stroke="#2563EB" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="ganhos" name="Ganhos" stroke="#10B981" strokeWidth={2} dot={{ r: 2 }} />
                    <Line type="monotone" dataKey="perdidos" name="Perdidos" stroke="#EF4444" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-1">Funil — leads por etapa</h3>
              <p className="text-xs text-muted-foreground mb-4">Distribuição atual no funil</p>
              {byStage.length === 0 || byStage.every((s) => s.count === 0) ? (
                <EmptyChart text="Sem dados de etapas" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={byStage.filter((s: any) => !s.isArchived)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {byStage.filter((s: any) => !s.isArchived).map((s, i) => <Cell key={i} fill={s.color} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-1">Leads por origem</h3>
              <p className="text-xs text-muted-foreground mb-4">De onde vieram os leads</p>
              {bySource.length === 0 ? (
                <EmptyChart text="Sem origens registradas" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={bySource} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80} innerRadius={40} label>
                      {bySource.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Legend />
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-1">Performance por responsável</h3>
              <p className="text-xs text-muted-foreground mb-4">Leads atribuídos por usuário</p>
              {byAgent.length === 0 ? (
                <EmptyChart text="Sem responsáveis atribuídos" />
              ) : (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={byAgent} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={120} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="total" name="Total" fill="#2563EB" radius={[0, 6, 6, 0]} />
                    <Bar dataKey="won" name="Ganhos" fill="#10B981" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </div>

          {/* Tabelas analíticas */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-3">Performance por agente</h3>
              <DataTable
                columns={[
                  { key: 'name', label: 'Responsável' },
                  { key: 'total', label: 'Total' },
                  { key: 'won', label: 'Ganhos' },
                  { key: 'lost', label: 'Perdidos' },
                  { key: 'conversionRate', label: 'Conversão', format: (v) => `${v}%` },
                ]}
                rows={byAgent}
                emptyText="Sem dados"
              />
            </Card>

            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-3">Performance por formulário</h3>
              <DataTable
                columns={[
                  { key: 'name', label: 'Formulário' },
                  { key: 'total', label: 'Total' },
                  { key: 'won', label: 'Ganhos' },
                  { key: 'conversionRate', label: 'Conversão', format: (v) => `${v}%` },
                ]}
                rows={byForm}
                emptyText="Sem leads de formulário no período"
              />
            </Card>

            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-3">Performance por origem</h3>
              <DataTable
                columns={[
                  { key: 'source', label: 'Origem' },
                  { key: 'count', label: 'Leads' },
                ]}
                rows={bySource}
                emptyText="Sem dados"
              />
            </Card>

            <Card className="p-5">
              <h3 className="font-heading font-semibold mb-3">Motivos de perda</h3>
              <DataTable
                columns={[
                  { key: 'reason', label: 'Motivo' },
                  { key: 'count', label: 'Quantidade' },
                ]}
                rows={lostReasons}
                emptyText="Sem leads perdidos no período"
              />
            </Card>

            <Card className="p-5 lg:col-span-2">
              <h3 className="font-heading font-semibold mb-3">Tarefas por responsável</h3>
              <DataTable
                columns={[
                  { key: 'name', label: 'Responsável' },
                  { key: 'total', label: 'Total' },
                  { key: 'pending', label: 'Pendentes' },
                  { key: 'overdue', label: 'Vencidas' },
                  { key: 'completed', label: 'Concluídas' },
                ]}
                rows={byTaskAgent}
                emptyText="Sem tarefas no período"
              />
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function EmptyChart({ text }: { text: string }) {
  return (
    <div className="h-[240px] flex flex-col items-center justify-center text-muted-foreground">
      <Inbox className="w-10 h-10 mb-2 opacity-30" />
      <span className="text-sm">{text}</span>
    </div>
  );
}

interface Column { key: string; label: string; format?: (v: any) => string; }
function DataTable({ columns, rows, emptyText }: { columns: Column[]; rows: any[]; emptyText: string }) {
  if (!rows || rows.length === 0) {
    return <div className="text-center py-6 text-sm text-muted-foreground">{emptyText}</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b">
            {columns.map((c) => (
              <th key={c.key} className="text-left py-2 px-2 text-xs font-medium text-muted-foreground uppercase tracking-wide">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
              {columns.map((c) => (
                <td key={c.key} className="py-2 px-2">{c.format ? c.format(r[c.key]) : (r[c.key] ?? '—')}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

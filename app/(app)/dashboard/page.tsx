'use client';
import { useEffect, useState } from 'react';
import { StatCard } from '@/components/stat-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Users, UserPlus, Trophy, TrendingUp, Target, AlertCircle, ArrowRight, ListChecks, AlertTriangle, CheckCircle2, User as UserIconLucide } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import Link from 'next/link';

interface Dashboard {
  indicators: { total: number; novos: number; ganhos: number; perdidos: number; emAtendimento: number; qualificados: number; conversionRate: number };
  leadsBySource: { source: string; count: number }[];
  leadsByStage: { name: string; color: string; count: number }[];
  leadsByAssignee: { name: string; count: number }[];
  leadsByDay: { date: string; count: number }[];
}

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [taskStats, setTaskStats] = useState<{ pending: number; overdue: number; completedToday: number; mine: number } | null>(null);
  const [range, setRange] = useState<'today' | '7d' | '30d'>('30d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      fetch(`/api/dashboard?range=${range}`).then((r) => r.json()),
      fetch('/api/tasks/stats').then((r) => r.json()),
    ]).then(([d, ts]) => {
      setData(d);
      setTaskStats(ts);
      setLoading(false);
    });
  }, [range]);

  return (
    <div className="p-4 lg:p-8 space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl lg:text-3xl font-bold">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Visão geral dos seus leads e funil.</p>
        </div>
        <div className="flex gap-1 p-1 bg-muted rounded-md">
          {[{ k: 'today', l: 'Hoje' }, { k: '7d', l: '7 dias' }, { k: '30d', l: '30 dias' }].map((r) => (
            <button key={r.k} onClick={() => setRange(r.k as any)} className={`px-3 py-1.5 text-xs font-medium rounded ${range === r.k ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground'}`}>{r.l}</button>
          ))}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Total de leads" value={data?.indicators.total ?? '—'} icon={Users} />
        <StatCard label="Novos no período" value={data?.indicators.novos ?? '—'} icon={UserPlus} tone="default" />
        <StatCard label="Ganhos" value={data?.indicators.ganhos ?? '—'} icon={Trophy} tone="success" />
        <StatCard label="Taxa de conversão" value={`${data?.indicators.conversionRate ?? 0}%`} icon={TrendingUp} tone="success" />
        <StatCard label="Em atendimento" value={data?.indicators.emAtendimento ?? '—'} icon={Target} tone="warning" />
        <StatCard label="Qualificados" value={data?.indicators.qualificados ?? '—'} icon={Target} />
        <StatCard label="Perdidos" value={data?.indicators.perdidos ?? '—'} icon={AlertCircle} tone="danger" />
        <Card className="p-5 bg-gradient-to-br from-brand-600 to-brand-800 text-white">
          <div className="text-sm font-medium opacity-80">Ação rápida</div>
          <div className="font-heading text-lg font-bold mt-1">Criar formulário</div>
          <Link href="/forms/new" className="inline-flex items-center gap-1 text-sm mt-3 hover:gap-2 transition-all">
            Começar <ArrowRight className="w-4 h-4" />
          </Link>
        </Card>
      </div>

      {/* Tarefas */}
      <div>
        <h2 className="font-heading font-semibold text-lg mb-3 flex items-center gap-2">
          <ListChecks className="w-5 h-5 text-muted-foreground" /> Tarefas
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard label="Tarefas pendentes" value={taskStats?.pending ?? '—'} icon={ListChecks} />
          <StatCard label="Tarefas vencidas" value={taskStats?.overdue ?? '—'} icon={AlertTriangle} tone="danger" />
          <StatCard label="Concluídas hoje" value={taskStats?.completedToday ?? '—'} icon={CheckCircle2} tone="success" />
          <StatCard label="Minhas tarefas" value={taskStats?.mine ?? '—'} icon={UserIconLucide} tone="warning" />
        </div>
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-5">
          <h3 className="font-heading font-semibold mb-1">Leads por dia</h3>
          <p className="text-xs text-muted-foreground mb-4">Entrada de leads no período selecionado</p>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data?.leadsByDay || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#2563EB" strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-heading font-semibold mb-1">Leads por etapa</h3>
          <p className="text-xs text-muted-foreground mb-4">Distribuição no funil</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.leadsByStage || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                {(data?.leadsByStage || []).map((s, i) => <Cell key={i} fill={s.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-heading font-semibold mb-1">Leads por origem</h3>
          <p className="text-xs text-muted-foreground mb-4">De onde vieram seus leads</p>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data?.leadsBySource || []} dataKey="count" nameKey="source" cx="50%" cy="50%" outerRadius={80} label>
                {(data?.leadsBySource || []).map((_, i) => <Cell key={i} fill={['#2563EB','#10B981','#F59E0B','#8B5CF6','#EC4899'][i % 5]} />)}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-5">
          <h3 className="font-heading font-semibold mb-1">Produtividade por atendente</h3>
          <p className="text-xs text-muted-foreground mb-4">Leads atribuídos por usuário</p>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data?.leadsByAssignee || []} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 12 }} width={100} />
              <Tooltip />
              <Bar dataKey="count" fill="#10B981" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

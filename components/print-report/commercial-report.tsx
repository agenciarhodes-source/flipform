'use client';

import { useEffect, useState } from 'react';
import {
  BarList, DailyColumns, formatHours, formatInt, formatPercent, KpiGrid, ReportDocument, ReportSection, ReportTable,
} from './report-kit';

const RANGE_LABELS: Record<string, string> = { today: 'Hoje', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', '90d': 'Últimos 90 dias', custom: 'Personalizado' };

/** The Reports page as a printable commercial report, with the filters it had when it was opened. */
export function CommercialReport({ tenantName, tenantLogoUrl }: { tenantName: string; tenantLogoUrl: string | null }) {
  const [report, setReport] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Array<[string, string]>>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const qs = params.toString();
    const get = async (endpoint: string) => {
      const response = await fetch(`/api/reports/${endpoint}?${qs}`, { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Não foi possível carregar o relatório.');
      return body;
    };
    Promise.all([
      get('summary'), get('leads-by-day'), get('leads-by-stage'), get('leads-by-source'), get('leads-by-form'),
      get('agent-performance'), get('task-performance'), get('lost-reasons'), get('options'),
    ]).then(([summary, byDay, byStage, bySource, byForm, byAgent, byTask, lost, options]) => {
      const range = params.get('range') || '30d';
      const pipeline = options?.pipelines?.find((item: any) => item.id === params.get('pipelineId'));
      const form = options?.forms?.find((item: any) => item.id === params.get('formId'));
      const user = options?.users?.find((item: any) => item.id === params.get('assignedTo'));
      setFilters([
        ['Período', range === 'custom' ? `${params.get('from') || '?'} a ${params.get('to') || '?'}` : RANGE_LABELS[range] || range],
        ['Pipeline', pipeline?.name || 'Todos'],
        ['Formulário', form?.name || 'Todos'],
        ['Origem', params.get('source') || 'Todas'],
        ['Responsável', user?.name || 'Todos'],
      ]);
      setReport({
        summary,
        byDay: byDay?.data || [],
        byStage: byStage?.data || [],
        bySource: bySource?.data || [],
        byForm: byForm?.data || [],
        byAgent: byAgent?.data || [],
        byTask: byTask?.data || [],
        lost: lost?.data || [],
      });
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o relatório.'));
  }, []);

  const totals = report?.summary?.totals || {};
  const tasks = report?.summary?.tasks || {};

  return (
    <ReportDocument
      tenantName={tenantName}
      tenantLogoUrl={tenantLogoUrl}
      title="Relatório comercial"
      subtitle="Performance comercial e operacional do período"
      filters={filters}
      loading={!report && !error}
      error={error}
    >
      <ReportSection title="Resumo do período">
        <KpiGrid items={[
          { label: 'Total de leads', value: formatInt(totals.total), tone: 'blue' },
          { label: 'Ganhos', value: formatInt(totals.ganhos), tone: 'green' },
          { label: 'Perdidos', value: formatInt(totals.perdidos), tone: 'red' },
          { label: 'Em aberto', value: formatInt(totals.abertos), tone: 'amber' },
          { label: 'Taxa de conversão', value: formatPercent(totals.conversionRate), tone: 'green' },
          { label: 'Tempo até 1ª ação', value: formatHours(totals.avgFirstMoveHours) },
          { label: 'Tempo médio no funil', value: formatHours(totals.avgCycleHours) },
          { label: 'Tarefas vencidas', value: formatInt(tasks.overdue), tone: 'red', hint: `${formatInt(tasks.pending)} pendentes • ${formatInt(tasks.completedInRange)} concluídas` },
        ]} />
      </ReportSection>

      <ReportSection title="Leads por dia" description="Azul: entradas do dia. Verde: quantos desses foram ganhos.">
        <DailyColumns days={(report?.byDay || []).map((day: any) => ({ label: day.label, value: day.total || 0, secondary: day.ganhos || 0 }))} />
      </ReportSection>

      <div className="grid grid-cols-2 gap-6">
        <ReportSection title="Funil por etapa">
          <BarList rows={(report?.byStage || []).filter((stage: any) => !stage.isArchived).map((stage: any) => ({ label: stage.name, value: stage.count || 0, color: stage.color || undefined }))} />
        </ReportSection>
        <ReportSection title="Origem dos leads">
          <BarList rows={(report?.bySource || []).slice(0, 8).map((row: any) => ({ label: row.source, value: row.count || 0 }))} />
        </ReportSection>
      </div>

      <ReportSection title="Desempenho por responsável">
        <ReportTable
          columns={[{ label: 'Responsável' }, { label: 'Leads', align: 'right' }, { label: 'Ganhos', align: 'right' }, { label: 'Perdidos', align: 'right' }, { label: 'Conversão', align: 'right' }]}
          rows={(report?.byAgent || []).map((row: any) => [row.name, formatInt(row.total), formatInt(row.won), formatInt(row.lost), formatPercent(row.conversionRate)])}
        />
      </ReportSection>

      <ReportSection title="Desempenho por formulário">
        <ReportTable
          columns={[{ label: 'Formulário' }, { label: 'Leads', align: 'right' }, { label: 'Ganhos', align: 'right' }, { label: 'Conversão', align: 'right' }]}
          rows={(report?.byForm || []).map((row: any) => [row.name, formatInt(row.total), formatInt(row.won), formatPercent(row.conversionRate)])}
        />
      </ReportSection>

      <div className="grid grid-cols-2 gap-6">
        <ReportSection title="Tarefas por responsável">
          <ReportTable
            columns={[{ label: 'Responsável' }, { label: 'Pendentes', align: 'right' }, { label: 'Vencidas', align: 'right' }, { label: 'Concluídas', align: 'right' }]}
            rows={(report?.byTask || []).map((row: any) => [row.name, formatInt(row.pending), formatInt(row.overdue), formatInt(row.completed)])}
          />
        </ReportSection>
        <ReportSection title="Motivos de perda">
          <BarList rows={(report?.lost || []).slice(0, 8).map((row: any) => ({ label: row.reason, value: row.count || 0 }))} emptyText="Nenhum lead perdido no período." />
        </ReportSection>
      </div>
    </ReportDocument>
  );
}

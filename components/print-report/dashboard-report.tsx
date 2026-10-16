'use client';

import { useEffect, useState } from 'react';
import {
  BarList, DailyColumns, formatHours, formatInt, formatMoneyCents, formatPercent, KpiGrid,
  FunnelDrawing, ReportDocument, ReportSection, ReportTable,
} from './report-kit';

const PERIOD_LABELS: Record<string, string> = { today: 'Hoje', '7d': 'Últimos 7 dias', '30d': 'Últimos 30 dias', custom: 'Personalizado' };

/** The Dashboard as an executive report, with the same filters the Dashboard had when it was opened. */
export function DashboardReport({ tenantName, tenantLogoUrl }: { tenantName: string; tenantLogoUrl: string | null }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState<URLSearchParams | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setQuery(params);
    fetch(`/api/dashboard?${params.toString()}`, { cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Não foi possível carregar os dados do Dashboard.');
        setData(body);
      })
      .catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar os dados do Dashboard.'));
  }, []);

  const filters: Array<[string, string]> = [];
  if (query) {
    const period = query.get('period') || '30d';
    filters.push(['Período', period === 'custom'
      ? `${query.get('startDate') || '?'} a ${query.get('endDate') || '?'}`
      : PERIOD_LABELS[period] || period]);
  }
  if (data?.filters) {
    const pipeline = data.filters.pipelines?.find((item: any) => item.id === data.filters.pipelineId);
    const form = data.filters.forms?.find((item: any) => item.id === data.filters.formId);
    const agent = data.filters.agents?.find((item: any) => item.userId === data.filters.assignedTo);
    filters.push(['Pipeline', pipeline?.name || 'Todos']);
    filters.push(['Formulário', form?.name || 'Todos']);
    filters.push(['Vendedor', agent?.name || 'Todos']);
    if (data.filters.state) filters.push(['Local', [data.filters.city, data.filters.state].filter(Boolean).join(' / ')]);
  }

  const summary = data?.summary || {};
  const executive = data?.executive || {};
  const financial = executive.financial || {};
  const funnelStages: any[] = data?.funnel?.stages || [];

  return (
    <ReportDocument
      tenantName={tenantName}
      tenantLogoUrl={tenantLogoUrl}
      title="Relatório executivo"
      subtitle="Leads, funil, financeiro e desempenho da equipe"
      filters={filters}
      loading={!data && !error}
      error={error}
    >
      <ReportSection title="Indicadores principais">
        <KpiGrid items={[
          { label: 'Novos leads', value: formatInt(summary.newLeads), tone: 'blue',
            hint: summary.variationVsPrevious == null ? undefined : `${summary.variationVsPrevious > 0 ? '+' : ''}${summary.variationVsPrevious}% vs. período anterior` },
          { label: 'Em andamento', value: formatInt(summary.inProgress) },
          { label: 'Qualificados', value: formatInt(summary.qualified) },
          { label: 'Ganhos', value: formatInt(summary.won), tone: 'green' },
          { label: 'Taxa de conversão', value: formatPercent(executive.conversionRate?.current), tone: 'green' },
          { label: 'Receita', value: formatMoneyCents(executive.revenue?.currentCents), tone: 'green' },
          { label: 'Negócios abertos', value: formatInt(executive.openDeals?.current) },
          { label: 'Tempo até fechar', value: executive.averageTimeToClose?.currentSeconds == null ? '—' : formatHours(executive.averageTimeToClose.currentSeconds / 3600) },
        ]} />
      </ReportSection>

      <ReportSection title="Leads por dia" description="Entrada de leads em cada dia do período.">
        <DailyColumns days={(data?.leadsByDay || []).map((day: any) => ({ label: day.label, value: day.real || 0 }))} />
      </ReportSection>

      {funnelStages.length ? (
        <ReportSection title="Funil do pipeline" description="Leads em cada etapa, na ordem do pipeline selecionado.">
          <FunnelDrawing stages={funnelStages.map((stage: any) => ({ name: stage.name, count: stage.count || 0, color: stage.color || undefined }))} />
        </ReportSection>
      ) : null}

      <ReportSection title="Origem dos leads">
        <BarList rows={(data?.sources || []).slice(0, 8).map((source: any) => ({ label: source.source, value: source.count || 0 }))} />
      </ReportSection>

      <ReportSection title="Financeiro do período" description="Vendas registradas no FlipForm.">
        <KpiGrid items={[
          { label: 'Compras', value: formatInt(financial.purchases?.current), tone: 'green' },
          { label: 'Clientes', value: formatInt(financial.buyingCustomers?.current) },
          { label: 'Ticket médio', value: formatMoneyCents(financial.averageTicket?.currentCents) },
          { label: 'Receita recorrente', value: formatMoneyCents(financial.recurringRevenue?.currentCents) },
        ]} />
      </ReportSection>

      <ReportSection title="Desempenho da equipe">
        <ReportTable
          columns={[
            { label: 'Vendedor' }, { label: 'Recebidos', align: 'right' }, { label: 'Em andamento', align: 'right' },
            { label: 'Ganhos', align: 'right' }, { label: 'Conversão', align: 'right' }, { label: 'Receita', align: 'right' },
          ]}
          rows={(data?.teamPerformance || []).map((row: any) => [
            row.name, formatInt(row.leadsReceived), formatInt(row.inProgress), formatInt(row.won),
            formatPercent(row.conversionRate), formatMoneyCents(row.revenueCents),
          ])}
        />
      </ReportSection>

      <ReportSection title="Formulários">
        <ReportTable
          columns={[{ label: 'Formulário' }, { label: 'Leads', align: 'right' }, { label: 'Qualificação', align: 'right' }, { label: 'Conversão', align: 'right' }]}
          rows={(data?.formsPerformance || []).map((row: any) => [
            row.name, formatInt(row.totalLeads), formatPercent(row.qualificationRate), formatPercent(row.conversionRate),
          ])}
        />
      </ReportSection>

      <div className="grid grid-cols-2 gap-6">
        <ReportSection title="Leads por estado">
          <BarList rows={(data?.geo?.byState || []).slice(0, 8).map((row: any) => ({ label: row.label || row.state, value: row.leads || 0 }))} />
        </ReportSection>
        <ReportSection title="Tarefas">
          <KpiGrid items={[
            { label: 'Pendentes', value: formatInt(data?.tasks?.pending) },
            { label: 'Vencidas', value: formatInt(data?.tasks?.overdue), tone: 'red' },
            { label: 'Concluídas hoje', value: formatInt(data?.tasks?.completedToday), tone: 'green' },
            { label: 'Minhas', value: formatInt(data?.tasks?.mine) },
          ]} />
        </ReportSection>
      </div>
    </ReportDocument>
  );
}

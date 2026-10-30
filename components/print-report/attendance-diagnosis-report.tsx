'use client';

import { useEffect, useState } from 'react';
import { KpiGrid, ReportDocument, ReportSection } from './report-kit';
import { diagnosisKpis, diagnosisParagraphs } from '@/components/reports/attendance-diagnosis-board';
import type { StoredDiagnosis } from '@/lib/reports/attendance-diagnosis-rules';

/** The diagnosis on an A4 sheet, ready to save as PDF. */
export function AttendanceDiagnosisReport({ tenantName, tenantLogoUrl }: { tenantName: string; tenantLogoUrl: string | null }) {
  const [diagnosis, setDiagnosis] = useState<StoredDiagnosis | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/reports/attendance-diagnosis', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('Sem permissão para ver o diagnóstico.'))))
      .then((data) => {
        if (!data.diagnosis) throw new Error('Ainda não há diagnóstico. Gere um na tela do Diagnóstico de atendimento.');
        setDiagnosis(data.diagnosis);
      })
      .catch((failure) => setError(failure instanceof Error ? failure.message : 'Não foi possível montar o relatório.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <ReportDocument
      tenantName={tenantName}
      tenantLogoUrl={tenantLogoUrl}
      title={diagnosis?.title || 'Diagnóstico de atendimento'}
      subtitle={diagnosis?.overall || 'Como a equipe está atendendo os clientes.'}
      filters={[
        ['Período', diagnosis ? `últimos ${diagnosis.days} dias` : '—'],
        ['Pessoas avaliadas', diagnosis ? String(diagnosis.team.attendants) : '—'],
      ]}
      loading={loading}
      error={error}
    >
      {diagnosis && (
        <>
          <KpiGrid items={diagnosisKpis(diagnosis).slice(0, 4).map((item) => ({ label: item.label, value: item.value, tone: 'blue' as const }))} />
          <ReportSection title="Diagnóstico" description="Escrito pelo Flip a partir das conversas atendidas pela equipe no WhatsApp e no Instagram, sem dados de clientes.">
            <div className="space-y-3 text-[12.5px] leading-6 text-slate-800">
              {diagnosisParagraphs(diagnosis.text).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
            </div>
          </ReportSection>
        </>
      )}
    </ReportDocument>
  );
}

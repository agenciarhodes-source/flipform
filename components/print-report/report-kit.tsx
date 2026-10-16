'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { Printer } from 'lucide-react';

/** A4 report: designed for paper and PDF, opened in its own tab and printed with the browser. */

export const REPORT_COLORS = ['#2563eb', '#16a34a', '#f59e0b', '#db2777', '#7c3aed', '#0891b2', '#ea580c', '#64748b'];

export function formatInt(value: number | null | undefined) {
  return value == null || !Number.isFinite(value) ? '—' : new Intl.NumberFormat('pt-BR').format(value);
}
export function formatPercent(value: number | null | undefined, digits = 1) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: digits }).format(value)}%`;
}
export function formatMoneyCents(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(cents)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
export function formatHours(hours: number | null | undefined) {
  if (hours == null || !Number.isFinite(hours)) return '—';
  if (hours < 1) return `${Math.round(hours * 60)} min`;
  if (hours < 48) return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(hours)} h`;
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(hours / 24)} dias`;
}
export function formatDateTime(value: Date | string | null | undefined) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value));
}

export function ReportDocument({
  tenantName, tenantLogoUrl, title, subtitle, filters, loading, error, children,
}: {
  tenantName: string;
  tenantLogoUrl: string | null;
  title: string;
  subtitle: string;
  filters: Array<[string, string]>;
  loading: boolean;
  error: string | null;
  children: ReactNode;
}) {
  const printed = useRef(false);
  // The print dialog opens by itself once the data is on the page; the button stays for a new try.
  useEffect(() => {
    if (loading || error || printed.current) return;
    printed.current = true;
    const timer = window.setTimeout(() => window.print(), 700);
    return () => window.clearTimeout(timer);
  }, [loading, error]);

  return (
    <div className="report-root min-h-screen bg-slate-100 py-6 print:bg-white print:py-0">
      <style>{`
        @page { size: A4; margin: 12mm; }
        @media print {
          html, body { background: #fff !important; }
          .report-root, .report-root * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
          .report-toolbar { display: none !important; }
          .report-sheet { box-shadow: none !important; margin: 0 !important; padding: 0 !important; width: auto !important; }
          .report-block { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>
      <div className="report-toolbar mx-auto mb-4 flex w-[210mm] max-w-full items-center justify-between gap-3 px-2">
        <p className="text-sm text-slate-600">Na janela de impressão, escolha <strong>Salvar como PDF</strong> como destino.</p>
        <button type="button" onClick={() => window.print()} disabled={loading || !!error}
          className="inline-flex items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
          <Printer className="h-4 w-4" />Imprimir / Salvar PDF
        </button>
      </div>
      <article className="report-sheet mx-auto w-[210mm] max-w-full bg-white p-[12mm] text-slate-900 shadow-xl">
        <header className="report-block mb-6 overflow-hidden rounded-xl bg-gradient-to-br from-slate-950 via-blue-950 to-blue-700 p-6 text-white">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-blue-200">{tenantName}</p>
              <h1 className="mt-1 text-2xl font-bold leading-tight">{title}</h1>
              <p className="mt-1 text-sm text-blue-100">{subtitle}</p>
            </div>
            {tenantLogoUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={tenantLogoUrl} alt="" className="h-14 w-14 rounded-lg bg-white object-contain p-1" />
              : <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-white/15 text-xl font-bold">{tenantName.slice(0, 2).toUpperCase()}</div>}
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
            {filters.map(([label, value]) => (
              <div key={label} className="flex gap-1"><dt className="text-blue-200">{label}:</dt><dd className="font-medium">{value}</dd></div>
            ))}
            <div className="flex gap-1"><dt className="text-blue-200">Gerado em:</dt><dd className="font-medium">{formatDateTime(new Date())}</dd></div>
          </dl>
        </header>
        {loading ? <p className="py-16 text-center text-sm text-slate-500">Montando o relatório...</p> : null}
        {error ? <p className="py-16 text-center text-sm text-red-600">{error}</p> : null}
        {!loading && !error ? <div className="space-y-6">{children}</div> : null}
        <footer className="mt-8 border-t pt-3 text-center text-[10px] text-slate-400">Relatório gerado pelo FlipForm • {tenantName}</footer>
      </article>
    </div>
  );
}

export function ReportSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="report-block">
      <h2 className="text-base font-bold text-slate-900">{title}</h2>
      {description ? <p className="mb-3 text-xs text-slate-500">{description}</p> : <div className="mb-3" />}
      {children}
    </section>
  );
}

export function KpiGrid({ items }: { items: Array<{ label: string; value: string; hint?: string; tone?: 'blue' | 'green' | 'red' | 'amber' | 'slate' }> }) {
  const tones = {
    blue: 'border-blue-100 bg-blue-50 text-blue-900',
    green: 'border-emerald-100 bg-emerald-50 text-emerald-900',
    red: 'border-rose-100 bg-rose-50 text-rose-900',
    amber: 'border-amber-100 bg-amber-50 text-amber-900',
    slate: 'border-slate-200 bg-slate-50 text-slate-900',
  };
  return (
    <div className="report-block grid grid-cols-4 gap-3">
      {items.map((item) => (
        <div key={item.label} className={`rounded-lg border p-3 ${tones[item.tone || 'slate']}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{item.label}</p>
          <p className="mt-1 text-xl font-bold leading-tight">{item.value}</p>
          {item.hint ? <p className="mt-0.5 text-[10px] opacity-70">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}

/** Horizontal bars, one per row, with value and share of the total. */
export function BarList({ rows, emptyText = 'Sem dados no período.' }: { rows: Array<{ label: string; value: number; color?: string; detail?: string }>; emptyText?: string }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length || total === 0) return <p className="text-xs text-slate-500">{emptyText}</p>;
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={`${row.label}-${index}`} className="grid grid-cols-[140px_1fr_90px] items-center gap-3 text-xs">
          <span className="truncate font-medium text-slate-700" title={row.label}>{row.label}</span>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full" style={{ width: `${Math.max(2, (row.value / max) * 100)}%`, background: row.color || REPORT_COLORS[index % REPORT_COLORS.length] }} />
          </div>
          <span className="text-right tabular-nums text-slate-700">
            <strong>{formatInt(row.value)}</strong> <span className="text-slate-400">{formatPercent((row.value / total) * 100, 0)}</span>
            {row.detail ? <span className="block text-[10px] text-slate-400">{row.detail}</span> : null}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The pipeline drawn as a funnel: one band per stage, in pipeline order, narrowing to the bottom.
 * The shape is fixed so it always reads as a funnel; each band carries its stage's real count.
 */
export function FunnelDrawing({ stages }: { stages: Array<{ name: string; count: number; color?: string }> }) {
  if (!stages.length) return <p className="text-xs text-slate-500">Escolha um pipeline no Dashboard para ver as etapas.</p>;
  const total = stages.reduce((sum, stage) => sum + stage.count, 0);
  const width = 680;
  const funnelWidth = 380;
  const center = funnelWidth / 2;
  const bandHeight = 38;
  const gap = 4;
  const topWidth = funnelWidth;
  const bottomWidth = 110;
  const widthAt = (index: number) => topWidth - ((topWidth - bottomWidth) * index) / stages.length;
  const height = stages.length * (bandHeight + gap);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Funil por etapa">
      {stages.map((stage, index) => {
        const y = index * (bandHeight + gap);
        const top = widthAt(index) / 2;
        const bottom = widthAt(index + 1) / 2;
        const color = stage.color || REPORT_COLORS[index % REPORT_COLORS.length];
        const middle = y + bandHeight / 2;
        return (
          <g key={`${stage.name}-${index}`}>
            <polygon points={`${center - top},${y} ${center + top},${y} ${center + bottom},${y + bandHeight} ${center - bottom},${y + bandHeight}`} fill={color} />
            <text x={center} y={middle + 6} textAnchor="middle" fontSize="17" fontWeight="700" fill="#fff"
              stroke="rgba(15,23,42,0.35)" strokeWidth="3" paintOrder="stroke">{formatInt(stage.count)}</text>
            <line x1={center + (top + bottom) / 2 + 6} y1={middle} x2={funnelWidth + 24} y2={middle} stroke="#CBD5E1" strokeDasharray="3 3" />
            <circle cx={funnelWidth + 30} cy={middle} r="5" fill={color} />
            <text x={funnelWidth + 42} y={middle - 2} fontSize="13" fontWeight="600" fill="#1E293B">{stage.name.length > 30 ? `${stage.name.slice(0, 29)}…` : stage.name}</text>
            <text x={funnelWidth + 42} y={middle + 13} fontSize="11" fill="#64748B">
              {formatInt(stage.count)} {stage.count === 1 ? 'lead' : 'leads'} · {formatPercent(total ? (stage.count / total) * 100 : 0)} do total
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Daily columns drawn in SVG, so they print exactly as shown. */
export function DailyColumns({ days }: { days: Array<{ label: string; value: number; secondary?: number }> }) {
  if (!days.length) return <p className="text-xs text-slate-500">Sem dados no período.</p>;
  const width = 680;
  const height = 150;
  const max = Math.max(1, ...days.map((day) => day.value));
  const slot = width / days.length;
  const bar = Math.max(2, Math.min(22, slot * 0.7));
  const labelEvery = Math.max(1, Math.ceil(days.length / 12));
  return (
    <svg viewBox={`0 0 ${width} ${height + 20}`} className="h-auto w-full" role="img" aria-label="Leads por dia">
      {[0.25, 0.5, 0.75, 1].map((step) => (
        <line key={step} x1={0} x2={width} y1={height - step * height} y2={height - step * height} stroke="#e2e8f0" strokeWidth={1} />
      ))}
      {days.map((day, index) => {
        const x = index * slot + (slot - bar) / 2;
        const h = (day.value / max) * (height - 12);
        const h2 = day.secondary ? (day.secondary / max) * (height - 12) : 0;
        return (
          <g key={`${day.label}-${index}`}>
            <rect x={x} y={height - h} width={bar} height={h} rx={2} fill="#2563eb" />
            {h2 > 0 ? <rect x={x} y={height - h2} width={bar} height={h2} rx={2} fill="#16a34a" /> : null}
            {day.value > 0 && days.length <= 31 ? (
              <text x={x + bar / 2} y={height - h - 3} textAnchor="middle" fontSize={8} fill="#475569">{day.value}</text>
            ) : null}
            {index % labelEvery === 0 ? (
              <text x={x + bar / 2} y={height + 13} textAnchor="middle" fontSize={9} fill="#64748b">{day.label}</text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

export function ReportTable({ columns, rows, emptyText = 'Sem dados no período.' }: {
  columns: Array<{ label: string; align?: 'left' | 'right' }>;
  rows: Array<Array<string>>;
  emptyText?: string;
}) {
  if (!rows.length) return <p className="text-xs text-slate-500">{emptyText}</p>;
  return (
    <table className="w-full border-collapse text-xs">
      <thead>
        <tr className="bg-slate-900 text-white">
          {columns.map((column) => (
            <th key={column.label} className={`px-2 py-1.5 font-semibold ${column.align === 'right' ? 'text-right' : 'text-left'}`}>{column.label}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rowIndex) => (
          <tr key={rowIndex} className={rowIndex % 2 ? 'bg-slate-50' : 'bg-white'}>
            {row.map((cell, cellIndex) => (
              <td key={cellIndex} className={`border-b border-slate-100 px-2 py-1.5 ${columns[cellIndex]?.align === 'right' ? 'text-right tabular-nums' : ''}`}>{cell}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

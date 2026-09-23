'use client';

import { Check, RotateCcw, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export type DashboardMetricOption = {
  key: string;
  label: string;
  description?: string;
};

export function DashboardMetricPicker({
  options,
  selected,
  onChange,
  defaults,
  max = 8,
}: {
  options: DashboardMetricOption[];
  selected: string[];
  onChange: (keys: string[]) => void;
  defaults: string[];
  max?: number;
}) {
  const optionKeys = new Set(options.map((option) => option.key));
  const activeSelected = selected.filter((key) => optionKeys.has(key));
  const atLimit = activeSelected.length >= max;

  function toggle(key: string) {
    const cleaned = selected.filter((item) => optionKeys.has(item));
    if (cleaned.includes(key)) {
      onChange(cleaned.filter((item) => item !== key));
      return;
    }
    if (cleaned.length >= max) return;
    onChange([...cleaned, key]);
  }

  return (
    <Card className="p-4 dashboard-metric-picker">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
            <h3 className="font-heading text-sm font-semibold">Personalizar métricas</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Escolha até {max} blocos para a visão rápida do Dashboard. Etapas do funil também podem virar métricas.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">{activeSelected.length}/{max} selecionadas</span>
          <Button type="button" size="sm" variant="outline" onClick={() => onChange(defaults.filter((key) => optionKeys.has(key)).slice(0, max))}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Restaurar padrão
          </Button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const active = activeSelected.includes(option.key);
          const disabled = !active && atLimit;
          return (
            <button
              key={option.key}
              type="button"
              disabled={disabled}
              title={option.description}
              onClick={() => toggle(option.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${active ? 'border-brand-200 bg-brand-50 text-brand-700' : 'bg-background text-muted-foreground hover:bg-muted'} disabled:cursor-not-allowed disabled:opacity-40`}
            >
              {active && <Check className="h-3.5 w-3.5" />}
              {option.label}
            </button>
          );
        })}
      </div>
    </Card>
  );
}

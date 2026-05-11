'use client';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export function StatCard({ label, value, icon: Icon, tone = 'default', hint }: {
  label: string; value: string | number; icon?: LucideIcon; tone?: 'default' | 'success' | 'warning' | 'danger'; hint?: string;
}) {
  const toneMap = {
    default: 'bg-brand-50 text-brand-700',
    success: 'bg-emerald-50 text-emerald-700',
    warning: 'bg-amber-50 text-amber-700',
    danger: 'bg-red-50 text-red-700',
  } as const;
  return (
    <Card className="p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-sm text-muted-foreground font-medium">{label}</div>
          <div className="font-heading text-3xl font-bold mt-2">{value}</div>
          {hint && <div className="text-xs text-muted-foreground mt-1">{hint}</div>}
        </div>
        {Icon && (
          <div className={cn('w-10 h-10 rounded-md flex items-center justify-center', toneMap[tone])}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </Card>
  );
}

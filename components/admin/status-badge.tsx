import { Badge } from '@/components/ui/badge';

export function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    trial: 'bg-sky-100 text-sky-700 border-sky-200',
    past_due: 'bg-amber-100 text-amber-700 border-amber-200',
    suspended: 'bg-orange-100 text-orange-700 border-orange-200',
    blocked: 'bg-red-100 text-red-700 border-red-200',
    canceled: 'bg-slate-200 text-slate-700 border-slate-300',
    inactive: 'bg-slate-200 text-slate-700 border-slate-300',
  };
  const labels: Record<string, string> = {
    active: 'Ativo',
    trial: 'Trial',
    past_due: 'Pagamento pendente',
    suspended: 'Suspenso',
    blocked: 'Bloqueado',
    canceled: 'Cancelado',
    inactive: 'Inativo',
  };
  return <Badge variant="outline" className={`text-[10px] py-0 h-5 ${colors[status] || ''}`}>{labels[status] || status}</Badge>;
}

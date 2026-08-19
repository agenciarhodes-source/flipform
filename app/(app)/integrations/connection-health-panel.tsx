'use client';

export type ConnectionHealth = {
  state: 'healthy' | 'degraded' | 'action_required' | 'expired' | 'revoked' | 'provider_error' | 'not_connected';
  label: string;
  summary: string;
  checkedAt: string;
  lastValidatedAt: string | null;
  reconnectRecommended: boolean;
  retryable: boolean;
  checks: Array<{ key: string; status: 'pass' | 'warn' | 'fail'; detail: string }>;
} | null;

function tone(state: NonNullable<ConnectionHealth>['state']) {
  if (state === 'healthy') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
  if (state === 'provider_error' || state === 'degraded') return 'border-amber-200 bg-amber-50 text-amber-900';
  if (state === 'not_connected' || state === 'revoked') return 'border-slate-200 bg-slate-50 text-slate-800';
  return 'border-rose-200 bg-rose-50 text-rose-900';
}

export function ConnectionHealthPanel(props: {
  health: ConnectionHealth;
  checking: boolean;
  canCheck: boolean;
  onCheck: () => void;
}) {
  if (!props.health || props.health.state === 'not_connected' || props.health.state === 'revoked') return null;
  const lastValidated = props.health.lastValidatedAt
    ? new Date(props.health.lastValidatedAt).toLocaleString('pt-BR')
    : 'Ainda não validada';

  return <div className={`rounded-md border p-4 ${tone(props.health.state)}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <p className="text-sm font-semibold">Saúde da conexão: {props.health.label}</p>
        <p className="mt-1 text-xs opacity-90">{props.health.summary}</p>
        <p className="mt-2 text-[11px] opacity-75">Última validação bem-sucedida: {lastValidated}</p>
      </div>
      {props.canCheck && <button
        type="button"
        className="rounded border border-current bg-white/70 px-3 py-2 text-xs font-medium disabled:opacity-60"
        onClick={props.onCheck}
        disabled={props.checking}
      >{props.checking ? 'Verificando...' : 'Verificar conexão'}</button>}
    </div>
    {props.health.checks.some(check => check.status !== 'pass') && <div className="mt-3 space-y-1">
      {props.health.checks.filter(check => check.status !== 'pass').map(check => (
        <p key={check.key} className="text-xs">• {check.detail}</p>
      ))}
    </div>}
  </div>;
}

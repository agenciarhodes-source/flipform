'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type Health = {
  level: 'ok' | 'temporary' | 'expiring' | 'blocked';
  hasPermanentToken: boolean;
  connectionExpiresAt: string | null;
  connectionDaysLeft: number | null;
  failedRecent: number;
  lastSentAt: string | null;
};

const STYLE: Record<Health['level'], string> = {
  ok: 'border-emerald-200 bg-emerald-50 text-emerald-900',
  temporary: 'border-amber-200 bg-amber-50 text-amber-900',
  expiring: 'border-amber-300 bg-amber-50 text-amber-900',
  blocked: 'border-red-300 bg-red-50 text-red-900',
};

function date(value: string | null) {
  return value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
}

/** Whether events keep reaching Meta, with a resend for the ones that failed recently. */
export function MetaDeliveryHealth() {
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch('/api/integrations/meta-delivery/health', { cache: 'no-store' }).catch(() => null);
    if (response?.ok) setHealth(await response.json());
  }
  useEffect(() => { void load(); }, []);

  async function replay() {
    if (!window.confirm('Reenviar à Meta os eventos que falharam nos últimos dias, com a data original?')) return;
    setBusy(true);
    try {
      const response = await fetch('/api/integrations/meta-delivery/replay', { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível reenviar.');
      const s = data.summary;
      toast.success(`${s.sent} reenviado(s)${s.failed ? `, ${s.failed} com erro` : ''}${s.tooOld ? `, ${s.tooOld} antigo(s) demais para reenviar` : ''}.`);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível reenviar.');
    } finally {
      setBusy(false);
    }
  }

  if (!health) return null;
  const message = health.level === 'ok'
    ? 'Envio à Meta garantido pelo Token da API de Conversões, que não expira.'
    : health.level === 'blocked'
      ? 'Os eventos NÃO estão chegando à Meta: a conexão venceu e não há Token da API de Conversões. Cole o token permanente abaixo.'
      : health.level === 'expiring'
        ? `A conexão com a Meta vence em ${health.connectionDaysLeft} dia(s) e não há Token da API de Conversões. Cole o token permanente abaixo para não parar.`
        : 'O envio depende só da conexão com a Meta, que vence a cada 60 dias. Cole o Token da API de Conversões abaixo para não depender dela.';
  return (
    <div className={`rounded-lg border p-3 text-sm ${STYLE[health.level]}`}>
      <p className="font-medium">{message}</p>
      <p className="mt-1 text-xs">
        Último evento entregue: {date(health.lastSentAt)}
        {health.connectionExpiresAt ? ` · Conexão vence em: ${date(health.connectionExpiresAt)}` : ''}
      </p>
      {health.failedRecent > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="text-xs">{health.failedRecent} evento(s) com falha nos últimos 7 dias.</span>
          <button type="button" className="rounded border bg-white px-3 py-1 text-xs font-medium disabled:opacity-60" onClick={() => void replay()} disabled={busy}>
            {busy ? 'Reenviando...' : 'Reenviar eventos com falha'}
          </button>
        </div>
      )}
    </div>
  );
}

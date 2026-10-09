'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';

type PendingRow = {
  orderId: string;
  tenantName: string;
  credits: number;
  recommendedUsd: number;
  funded: boolean;
};

const POLL_INTERVAL_MS = 60_000;
const number = new Intl.NumberFormat('pt-BR');
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

/**
 * Platform admin notifications. Today it carries one kind: a company bought credits and the
 * provider balance for that purchase has not been marked as recharged in Treasury yet.
 */
export function AdminNotificationBell() {
  const [pending, setPending] = useState<PendingRow[]>([]);
  const [open, setOpen] = useState(false);
  const knownRef = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/flip-ai/treasury/top-ups', { cache: 'no-store' });
      if (!response.ok) return;
      const payload = await response.json() as { rows?: PendingRow[] };
      const next = (payload.rows || []).filter((row) => !row.funded);
      // The first load only sets the baseline; later ones announce purchases that just arrived.
      if (knownRef.current) {
        for (const row of next) {
          if (!knownRef.current.has(row.orderId)) {
            toast.info(`${row.tenantName} comprou ${number.format(row.credits)} créditos`, {
              description: `Colocar ${usd.format(row.recommendedUsd)} na OpenAI e marcar em Tesouraria IA.`,
            });
          }
        }
      }
      knownRef.current = new Set(next.map((row) => row.orderId));
      setPending(next);
    } catch {
      // Notifications are a convenience: a failed poll is retried on the next interval.
    }
  }, []);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  const totalUsd = pending.reduce((sum, row) => sum + row.recommendedUsd, 0);

  return (
    <div className="px-3 pt-3">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded px-3 py-2 text-sm text-slate-300 transition hover:bg-slate-800 hover:text-white"
      >
        <Bell className="h-4 w-4" />
        <span className="flex-1 text-left">Notificações</span>
        {pending.length > 0 && (
          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-semibold text-white">
            {pending.length}
          </span>
        )}
      </button>
      {open && (
        <div className="mt-1 rounded border border-slate-700 bg-slate-800 p-3 text-xs text-slate-200">
          {pending.length === 0 ? (
            <p className="text-slate-400">Nenhuma notificação pendente.</p>
          ) : (
            <>
              <p className="font-medium">
                {number.format(pending.length)} recarga(s) aguardando atribuição: {usd.format(totalUsd)} a colocar na OpenAI.
              </p>
              <ul className="mt-2 space-y-2">
                {pending.slice(0, 6).map((row) => (
                  <li key={row.orderId} className="border-t border-slate-700 pt-2">
                    <div className="font-medium text-white">{row.tenantName}</div>
                    <div className="text-slate-400">
                      {number.format(row.credits)} créditos • colocar {usd.format(row.recommendedUsd)}
                    </div>
                  </li>
                ))}
              </ul>
              {pending.length > 6 && <p className="mt-2 text-slate-400">E mais {pending.length - 6}.</p>}
              <Link
                href="/admin/treasury"
                onClick={() => setOpen(false)}
                className="mt-3 inline-block font-medium text-white underline underline-offset-2"
              >
                Abrir Tesouraria IA
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}

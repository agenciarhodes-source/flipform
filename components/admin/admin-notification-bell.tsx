'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type PendingRow = {
  orderId: string;
  tenantName: string;
  credits: number;
  recommendedUsd: number;
  funded: boolean;
};

const POLL_INTERVAL_MS = 60_000;
/** Fired when an alert is clicked, so the purchases list scrolls to and highlights that row. */
export const FOCUS_TOP_UP_EVENT = 'flipform:focus-top-up';
/** Fired by the purchases list after a mark changes, so the bell refreshes at once. */
export const TOP_UP_FUNDING_CHANGED_EVENT = 'flipform:top-up-funding-changed';

const number = new Intl.NumberFormat('pt-BR');
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

/**
 * Treasury notifications. Today it carries one kind: a company bought credits and the
 * provider balance for that purchase has not been marked as recharged yet.
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
              description: `Colocar ${usd.format(row.recommendedUsd)} na OpenAI e marcar como valor atribuído.`,
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
    const refresh = () => void load();
    window.addEventListener(TOP_UP_FUNDING_CHANGED_EVENT, refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener(TOP_UP_FUNDING_CHANGED_EVENT, refresh);
    };
  }, [load]);

  const focusPurchase = (orderId: string) => {
    setOpen(false);
    window.dispatchEvent(new CustomEvent(FOCUS_TOP_UP_EVENT, { detail: { orderId } }));
  };

  const totalUsd = pending.reduce((sum, row) => sum + row.recommendedUsd, 0);

  return (
    <div className="relative">
      <Button
        variant="outline"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label={`Notificações: ${pending.length} pendente(s)`}
        className="relative"
      >
        <Bell className="h-4 w-4" />
        {pending.length > 0 && (
          <span className="absolute -right-2 -top-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
            {pending.length}
          </span>
        )}
      </Button>
      {open && (
        <div className="absolute right-0 z-20 mt-2 w-80 rounded-lg border bg-background p-3 text-sm shadow-lg">
          <div className="font-heading font-semibold">Notificações</div>
          {pending.length === 0 ? (
            <p className="mt-2 text-xs text-muted-foreground">Nenhuma notificação pendente.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-muted-foreground">
                {number.format(pending.length)} recarga(s) aguardando atribuição: {usd.format(totalUsd)} a colocar na OpenAI.
              </p>
              <ul className="mt-2 max-h-80 space-y-1 overflow-y-auto">
                {pending.map((row) => (
                  <li key={row.orderId}>
                    <button
                      type="button"
                      onClick={() => focusPurchase(row.orderId)}
                      className="w-full rounded-md border px-3 py-2 text-left transition hover:bg-muted"
                    >
                      <div className="font-medium">{row.tenantName}</div>
                      <div className="text-xs text-muted-foreground">
                        {number.format(row.credits)} créditos • colocar {usd.format(row.recommendedUsd)} na OpenAI
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

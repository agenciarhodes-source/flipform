'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FOCUS_TOP_UP_EVENT, TOP_UP_FUNDING_CHANGED_EVENT } from '@/components/admin/admin-notification-bell';

type FundingRow = {
  orderId: string;
  tenantName: string;
  credits: number;
  amountCents: number;
  creditedAt: string | null;
  recommendedUsd: number;
  funded: boolean;
  fundedAt: string | null;
};

type FundingList = {
  rows: FundingRow[];
  pendingCount: number;
  pendingUsd: number;
  fundingAvailable: boolean;
};

const number = new Intl.NumberFormat('pt-BR');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

function day(value: string | null) {
  return value ? new Date(value).toLocaleDateString('pt-BR') : '—';
}

export function TopUpFundingCard() {
  const [list, setList] = useState<FundingList | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/flip-ai/treasury/top-ups', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro');
      setList(payload);
      setError(null);
    } catch (loadError: any) {
      setError(loadError.message || 'Não foi possível carregar as recargas dos clientes.');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // An alert clicked in the bell brings its purchase into view and highlights it.
  useEffect(() => {
    const onFocus = (event: Event) => {
      const orderId = (event as CustomEvent<{ orderId?: string }>).detail?.orderId;
      if (!orderId) return;
      setFocused(orderId);
      document.getElementById(`recarga-${orderId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    window.addEventListener(FOCUS_TOP_UP_EVENT, onFocus);
    return () => window.removeEventListener(FOCUS_TOP_UP_EVENT, onFocus);
  }, []);

  const mark = async (row: FundingRow, funded: boolean) => {
    setSaving(row.orderId);
    try {
      const response = await fetch(`/api/admin/flip-ai/treasury/top-ups/${encodeURIComponent(row.orderId)}/funding`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ funded }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro');
      toast.success(funded ? 'Valor marcado como atribuído.' : 'Marcação desfeita.');
      await load();
      window.dispatchEvent(new Event(TOP_UP_FUNDING_CHANGED_EVENT));
    } catch (saveError: any) {
      toast.error(saveError.message || 'Não foi possível salvar o controle desta recarga.');
    } finally {
      setSaving(null);
    }
  };

  return (
    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b">
        <h2 className="font-heading font-semibold">Recargas dos clientes</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Cada compra de créditos confirmada, com o valor sugerido para recarregar na OpenAI (US$ 1 a cada 1 milhão de
          créditos). Marque como atribuído depois de recarregar. É só um controle seu: não movimenta dinheiro, não fala
          com a OpenAI e não altera a carteira do cliente.
        </p>
        {list && !list.fundingAvailable && (
          <div className="mt-3 rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground">
            A marcação de valor atribuído ainda não está disponível neste ambiente: a tabela não foi criada no banco.
          </div>
        )}
        {error && <div className="mt-3 text-sm text-red-700">{error}</div>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr className="text-xs uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">Data</th>
              <th className="px-3 py-2 text-left">Empresa</th>
              <th className="px-3 py-2 text-right">Créditos</th>
              <th className="px-3 py-2 text-right">Valor pago</th>
              <th className="px-3 py-2 text-right">Colocar na OpenAI</th>
              <th className="px-3 py-2 text-left">Situação</th>
              <th className="px-3 py-2 text-right">Ação</th>
            </tr>
          </thead>
          <tbody>
            {list?.rows.map((row) => (
              <tr
                key={row.orderId}
                id={`recarga-${row.orderId}`}
                className={`border-b last:border-0 ${focused === row.orderId ? 'bg-amber-50 ring-2 ring-inset ring-amber-400' : ''}`}
              >
                <td className="px-3 py-2">{day(row.creditedAt)}</td>
                <td className="px-3 py-2 font-medium">{row.tenantName}</td>
                <td className="px-3 py-2 text-right">{number.format(row.credits)}</td>
                <td className="px-3 py-2 text-right">{brl.format(row.amountCents / 100)}</td>
                <td className="px-3 py-2 text-right font-medium">{usd.format(row.recommendedUsd)}</td>
                <td className="px-3 py-2">
                  {row.funded
                    ? <span className="text-emerald-700">Atribuído em {day(row.fundedAt)}</span>
                    : <span className="text-amber-700">Pendente</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    size="sm"
                    variant={row.funded ? 'outline' : 'default'}
                    disabled={saving === row.orderId || !list.fundingAvailable}
                    onClick={() => void mark(row, !row.funded)}
                  >
                    {row.funded ? 'Desfazer' : 'Valor atribuído'}
                  </Button>
                </td>
              </tr>
            ))}
            {list && list.rows.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-muted-foreground">Nenhuma recarga confirmada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

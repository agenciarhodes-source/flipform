'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Suggestion = { id: string; kind: 'create_task' | 'transfer_lead' | 'rebalance'; reason: string; leadId: string | null };

const KIND: Record<Suggestion['kind'], { icon: string; label: string }> = {
  create_task: { icon: '📅', label: 'Criar tarefa de retorno' },
  transfer_lead: { icon: '🔄', label: 'Transferir lead' },
  rebalance: { icon: '⚖️', label: 'Redistribuir carteira' },
};

/** What the Flip suggests doing, with the reason; nothing happens until someone clicks Aplicar. */
export function FlipSuggestionsPanel({ onApplied }: { onApplied?: () => void }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const response = await fetch('/api/flip/suggestions', { cache: 'no-store' }).catch(() => null);
    const data = response?.ok ? await response.json().catch(() => ({})) : {};
    setItems(Array.isArray(data.suggestions) ? data.suggestions : []);
  }
  useEffect(() => { void load(); }, []);

  async function decide(id: string, action: 'apply' | 'dismiss') {
    setBusy(id);
    try {
      const response = await fetch(`/api/flip/suggestions/${encodeURIComponent(id)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (action === 'apply') {
        if (response.ok) toast.success(data.message || 'Feito.');
        else toast.info(data.message || data.error || 'Não foi possível aplicar.');
        onApplied?.();
      }
      setItems((current) => (current || []).filter((item) => item.id !== id));
    } finally {
      setBusy(null);
    }
  }

  if (!items || items.length === 0) return null;
  return (
    <article className="rounded-xl border bg-white shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">✨ Sugestões do Flip ({items.length})</h2>
        <p className="text-xs text-muted-foreground">Nada é feito sozinho: clique em Aplicar para o Flip fazer, ou Dispensar para não ver de novo por 7 dias.</p>
      </div>
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{KIND[item.kind].icon} {KIND[item.kind].label}</p>
              <p className="text-xs text-muted-foreground">{item.reason}</p>
            </div>
            {item.leadId && <Link href={`/leads?leadId=${encodeURIComponent(item.leadId)}`} className="text-xs text-brand-700 underline">Ver lead</Link>}
            <Button type="button" size="sm" disabled={busy === item.id} onClick={() => void decide(item.id, 'apply')}>Aplicar</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy === item.id} onClick={() => void decide(item.id, 'dismiss')}>Dispensar</Button>
          </li>
        ))}
      </ul>
    </article>
  );
}

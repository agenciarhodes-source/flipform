'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Kind = 'create_task' | 'transfer_lead' | 'rebalance';
type Suggestion = { id: string; kind: Kind; reason: string; leadId: string | null; leadName: string | null };

const KIND: Record<Kind, { icon: string; label: string; many: string }> = {
  create_task: { icon: '📅', label: 'Criar tarefa de retorno', many: 'tarefas de retorno' },
  transfer_lead: { icon: '🔄', label: 'Transferir lead', many: 'transferências' },
  rebalance: { icon: '⚖️', label: 'Redistribuir carteira', many: 'redistribuições' },
};
const ORDER: Kind[] = ['transfer_lead', 'rebalance', 'create_task'];

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

  async function decideAll(kind: Kind, action: 'apply' | 'dismiss', count: number) {
    const question = action === 'apply'
      ? `Aplicar as ${count} sugestões de ${KIND[kind].many}? Cada uma é conferida antes de ser feita.`
      : `Dispensar as ${count} sugestões de ${KIND[kind].many}? Elas não voltam por 7 dias.`;
    if (!window.confirm(question)) return;
    setBusy(`all:${kind}`);
    try {
      const response = await fetch('/api/flip/suggestions/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir.');
      toast.success(action === 'apply' ? `${data.done} de ${data.total} aplicadas.` : `${data.done} dispensadas.`);
      if (action === 'apply') onApplied?.();
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir.');
    } finally {
      setBusy(null);
    }
  }

  if (!items || items.length === 0) return null;
  const groups = ORDER.map((kind) => ({ kind, list: items.filter((item) => item.kind === kind) })).filter((group) => group.list.length);
  return (
    <article className="rounded-xl border bg-white shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">✨ Sugestões do Flip ({items.length})</h2>
        <p className="text-xs text-muted-foreground">Nada é feito sozinho: clique em Aplicar para o Flip fazer, ou Dispensar para não ver de novo por 7 dias.</p>
      </div>
      {groups.map((group) => (
        <div key={group.kind}>
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2">
            <p className="text-sm font-medium">{KIND[group.kind].icon} {KIND[group.kind].label} ({group.list.length})</p>
            {group.list.length > 1 && (
              <span className="flex gap-2">
                <Button type="button" size="sm" disabled={busy !== null} onClick={() => void decideAll(group.kind, 'apply', group.list.length)}>Aplicar todas</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void decideAll(group.kind, 'dismiss', group.list.length)}>Dispensar todas</Button>
              </span>
            )}
          </div>
          <ul className="divide-y">
            {group.list.map((item) => (
              <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{item.leadName || KIND[item.kind].label}</p>
                  <p className="text-xs text-muted-foreground">{item.reason}</p>
                </div>
                {item.leadId && <Link href={`/leads?leadId=${encodeURIComponent(item.leadId)}`} className="text-xs text-brand-700 underline">Ver lead</Link>}
                <Button type="button" size="sm" disabled={busy !== null} onClick={() => void decide(item.id, 'apply')}>Aplicar</Button>
                <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void decide(item.id, 'dismiss')}>Dispensar</Button>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </article>
  );
}

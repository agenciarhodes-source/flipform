'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Button, buttonVariants } from '@/components/ui/button';

type Kind = 'create_task' | 'transfer_lead' | 'rebalance';
type Suggestion = { id: string; kind: Kind; reason: string; leadId: string | null; leadName: string | null };
type BlockKey = 'transfer_lead' | 'rebalance' | 'task_hot' | 'task_new';

const BLOCKS: Record<BlockKey, { kind: Kind; icon: string; label: string; many: string }> = {
  transfer_lead: { kind: 'transfer_lead', icon: '🔄', label: 'Transferir lead', many: 'transferências' },
  rebalance: { kind: 'rebalance', icon: '⚖️', label: 'Redistribuir carteira', many: 'redistribuições' },
  task_hot: { kind: 'create_task', icon: '🔥', label: 'Tarefa para lead quente', many: 'tarefas para leads quentes' },
  task_new: { kind: 'create_task', icon: '📥', label: 'Tarefa para lead novo sem contato', many: 'tarefas para leads novos' },
};
const ORDER: BlockKey[] = ['transfer_lead', 'rebalance', 'task_hot', 'task_new'];

function blockOf(item: Suggestion): BlockKey {
  if (item.kind !== 'create_task') return item.kind;
  return item.reason.startsWith('Lead quente') ? 'task_hot' : 'task_new';
}

/** The Flip's suggestions in closed blocks, with the count of each on top; nothing happens until someone applies. */
export function FlipSuggestionsPanel({ onApplied }: { onApplied?: () => void }) {
  const [items, setItems] = useState<Suggestion[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<BlockKey | null>(null);

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

  async function decideBlock(block: BlockKey, list: Suggestion[], action: 'apply' | 'dismiss') {
    const question = action === 'apply'
      ? `Aplicar as ${list.length} sugestões de ${BLOCKS[block].many}? Cada uma é conferida antes de ser feita.`
      : `Dispensar as ${list.length} sugestões de ${BLOCKS[block].many}? Elas não voltam por 7 dias.`;
    if (!window.confirm(question)) return;
    setBusy(`block:${block}`);
    try {
      const response = await fetch('/api/flip/suggestions/bulk', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: BLOCKS[block].kind, action, ids: list.map((item) => item.id) }),
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
  const blocks = ORDER.map((key) => ({ key, list: items.filter((item) => blockOf(item) === key) })).filter((block) => block.list.length);

  return (
    <article className="rounded-2xl border bg-white shadow-sm">
      <div className="border-b px-4 py-3">
        <h2 className="font-semibold">✨ Sugestões do Flip ({items.length})</h2>
        <p className="text-xs text-muted-foreground">Nada é feito sozinho. Abra um bloco para ver as sugestões e aplicar ou dispensar.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
          {blocks.map((block) => (
            <button key={block.key} type="button" onClick={() => setOpen((current) => (current === block.key ? null : block.key))}
              className={`rounded-lg border p-3 text-left transition hover:bg-slate-50 ${open === block.key ? 'border-brand-600 ring-1 ring-brand-600' : ''}`}>
              <p className="text-2xl font-semibold">{block.list.length}</p>
              <p className="text-xs text-muted-foreground">{BLOCKS[block.key].icon} {BLOCKS[block.key].label}</p>
            </button>
          ))}
        </div>
      </div>
      {blocks.map((block) => {
        const isOpen = open === block.key;
        return (
          <div key={block.key} className="border-b last:border-b-0">
            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-4 py-2">
              <button type="button" className="flex items-center gap-1.5 text-sm font-medium" onClick={() => setOpen(isOpen ? null : block.key)} aria-expanded={isOpen}>
                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                {BLOCKS[block.key].icon} {BLOCKS[block.key].label} ({block.list.length})
              </button>
              {isOpen && block.list.length > 1 && (
                <span className="flex gap-2">
                  <Button type="button" size="sm" disabled={busy !== null} onClick={() => void decideBlock(block.key, block.list, 'apply')}>Aplicar todas</Button>
                  <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void decideBlock(block.key, block.list, 'dismiss')}>Dispensar todas</Button>
                </span>
              )}
            </div>
            {isOpen && (
              <ul className="divide-y">
                {block.list.map((item) => (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.leadName || BLOCKS[block.key].label}</p>
                      <p className="text-xs text-muted-foreground">{item.reason}</p>
                    </div>
                    {item.leadId && <Link href={`/leads?leadId=${encodeURIComponent(item.leadId)}`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>Ver lead</Link>}
                    <Button type="button" size="sm" disabled={busy !== null} onClick={() => void decide(item.id, 'apply')}>Aplicar</Button>
                    <Button type="button" size="sm" variant="outline" disabled={busy !== null} onClick={() => void decide(item.id, 'dismiss')}>Dispensar</Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </article>
  );
}

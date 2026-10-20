'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Switch } from '@/components/ui/switch';

/** On the lead card: stop or resume automatic WhatsApp messages (after-sale) to this person. */
export function AutomaticMessagesSwitch({ leadId }: { leadId: string }) {
  const [state, setState] = useState<{ optedOut: boolean; source: string | null; hasPhone: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetch(`/api/leads/${encodeURIComponent(leadId)}/opt-out`, { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => setState(data))
      .catch(() => setState(null));
  }, [leadId]);
  if (!state?.hasPhone) return null;

  async function change(receive: boolean) {
    setBusy(true);
    try {
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/opt-out`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optedOut: !receive }),
      });
      if (!response.ok) throw new Error();
      setState((current) => (current ? { ...current, optedOut: !receive, source: receive ? null : 'team' } : current));
      toast.success(receive ? 'Mensagens automáticas retomadas.' : 'Este contato não receberá mais mensagens automáticas.');
    } catch {
      toast.error('Não foi possível alterar.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className="flex items-center gap-2 text-xs text-muted-foreground">
      <Switch checked={!state.optedOut} disabled={busy} onCheckedChange={(checked) => void change(checked)} aria-label="Receber mensagens automáticas" />
      {state.optedOut
        ? (state.source === 'keyword' ? 'Pediu para não receber mensagens automáticas (respondeu SAIR)' : 'Não recebe mensagens automáticas')
        : 'Recebe mensagens automáticas (pós-venda)'}
    </label>
  );
}

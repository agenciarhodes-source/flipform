'use client';

import { useCallback, useEffect, useState } from 'react';
import { Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Suggestion = { id: string; toStageName: string; reason: string; createdAt: string };

/** "A IA sugere mover para X", with Aprovar and Recusar, on the lead card and in the Inbox. */
export function StageSuggestionBanner({ leadId, onDecided }: { leadId: string; onDecided?: () => void }) {
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/stage-suggestions`, { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json().catch(() => ({}));
    setSuggestion(data.suggestion || null);
  }, [leadId]);

  useEffect(() => { void load(); }, [load]);

  async function decide(action: 'approve' | 'reject') {
    if (!suggestion) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/stage-suggestions/${encodeURIComponent(suggestion.id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível concluir.');
      toast.success(action === 'approve' ? `Lead movido para ${suggestion.toStageName}.` : 'Sugestão recusada.');
      setSuggestion(null);
      onDecided?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível concluir.');
    } finally {
      setBusy(false);
    }
  }

  if (!suggestion) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-violet-200 bg-violet-50 px-3 py-2 text-sm text-violet-900">
      <Sparkles className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1">
        A IA sugere mover para <strong>{suggestion.toStageName}</strong>
        <span className="block text-xs text-violet-800/80">{suggestion.reason}</span>
      </span>
      <Button type="button" size="sm" disabled={busy} onClick={() => void decide('approve')}>Aprovar</Button>
      <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void decide('reject')}>Recusar</Button>
    </div>
  );
}

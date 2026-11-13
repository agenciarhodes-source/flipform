'use client';

import { useCallback, useEffect, useState } from 'react';

type WhatsAppNumber = { id: string; label: string | null; displayPhoneNumber: string | null; verifiedName: string | null };

export const WHATSAPP_NUMBERS_CHANGED = 'flipform:whatsapp-numbers-changed';

/** The company's WhatsApp numbers: a name for each one, and disconnecting one number alone. */
export function WhatsAppNumbersCard() {
  const [numbers, setNumbers] = useState<WhatsAppNumber[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const response = await fetch('/api/integrations/whatsapp/numbers', { cache: 'no-store' }).catch(() => null);
    if (!response?.ok) return;
    const data = await response.json();
    setNumbers(data.numbers || []);
    setDrafts(Object.fromEntries((data.numbers || []).map((item: WhatsAppNumber) => [item.id, item.label || ''])));
  }, []);

  useEffect(() => {
    load();
    const refresh = () => { load(); };
    window.addEventListener(WHATSAPP_NUMBERS_CHANGED, refresh);
    return () => window.removeEventListener(WHATSAPP_NUMBERS_CHANGED, refresh);
  }, [load]);

  async function saveLabel(id: string) {
    setBusy(id);
    setMessage(null);
    try {
      const response = await fetch('/api/integrations/whatsapp/numbers', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ connectionId: id, label: drafts[id] || null }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      setMessage('Nome do número salvo.');
      await load();
    } catch (error: any) {
      setMessage(error.message || 'Não foi possível salvar.');
    } finally {
      setBusy(null);
    }
  }

  async function disconnect(item: WhatsAppNumber) {
    const name = item.label || item.displayPhoneNumber || 'este número';
    if (!window.confirm(`Desconectar ${name}? Os outros números continuam conectados. As conversas e o histórico deste número ficam guardados.`)) return;
    setBusy(item.id);
    setMessage(null);
    try {
      const response = await fetch(`/api/integrations/whatsapp/connection?connectionId=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Não foi possível desconectar.');
      window.dispatchEvent(new Event(WHATSAPP_NUMBERS_CHANGED));
      setMessage(`${name} desconectado.`);
    } catch (error: any) {
      setMessage(error.message || 'Não foi possível desconectar.');
    } finally {
      setBusy(null);
    }
  }

  if (numbers.length === 0) return null;
  return <div className="rounded-lg border bg-white p-5 space-y-3">
    <div>
      <h3 className="font-semibold">Números de WhatsApp da empresa</h3>
      <p className="text-sm text-muted-foreground">Dê um nome a cada número (por exemplo, &quot;Tráfego pago&quot; ou &quot;Carteira&quot;). Cada conversa é respondida pelo número em que chegou.</p>
    </div>
    {message && <div className="rounded-md border bg-muted/30 p-2 text-sm">{message}</div>}
    <div className="divide-y rounded-md border">
      {numbers.map((item) => (
        <div key={item.id} className="flex flex-col gap-2 p-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium truncate">{item.displayPhoneNumber || 'Número'}</div>
            <div className="text-xs text-muted-foreground truncate">{item.verifiedName || ''}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="h-9 w-48 rounded-md border px-3 text-sm"
              value={drafts[item.id] ?? ''}
              onChange={(event) => setDrafts((current) => ({ ...current, [item.id]: event.target.value }))}
              placeholder="Nome do número"
              maxLength={40}
              disabled={busy === item.id}
              aria-label={`Nome do número ${item.displayPhoneNumber || ''}`}
            />
            <button type="button" className="px-3 py-2 rounded border text-sm disabled:opacity-60" onClick={() => saveLabel(item.id)} disabled={busy === item.id || (drafts[item.id] ?? '') === (item.label || '')}>Salvar nome</button>
            {numbers.length > 1 && <button type="button" className="px-3 py-2 rounded border text-sm text-rose-700 disabled:opacity-60" onClick={() => disconnect(item)} disabled={busy === item.id}>Desconectar</button>}
          </div>
        </div>
      ))}
    </div>
  </div>;
}

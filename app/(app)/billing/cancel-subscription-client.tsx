'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

/** Cancels at the end of the period already paid; access continues until then. */
export default function CancelSubscriptionClient({ selfServe }: { selfServe: boolean }) {
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onCancel() {
    if (!confirm('Tem certeza que deseja cancelar a assinatura? O acesso continua até o fim do período já pago e não haverá novas cobranças.')) return;
    setLoading(true); setErr(null); setMsg(null);
    const res = await fetch('/api/billing/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data?.error || 'Falha ao cancelar assinatura.');
    else setMsg(data?.message || 'Cancelamento registrado.');
    setLoading(false);
  }

  return (
    <div className="space-y-2 rounded border p-4">
      <div className="font-medium">Cancelar assinatura</div>
      {selfServe ? (
        <>
          <p className="text-sm text-muted-foreground">O acesso continua até o fim do período já pago (ou do teste grátis).</p>
          <textarea className="w-full rounded border p-2 text-sm" rows={3} placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button type="button" size="sm" variant="outline" onClick={() => void onCancel()} disabled={loading || Boolean(msg)}>
            {loading ? 'Cancelando...' : 'Cancelar assinatura'}
          </Button>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">O cancelamento desta assinatura é feito pela equipe FlipForm. Fale com o suporte.</p>
      )}
      {msg && <div className="text-sm text-emerald-700">{msg}</div>}
      {err && <div className="text-sm text-rose-700">{err}</div>}
    </div>
  );
}

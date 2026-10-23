'use client';
import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Opens Stripe's page to update the card and see or download invoices. */
export default function BillingPortalClient() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function open() {
    setLoading(true); setErr(null);
    const res = await fetch('/api/billing/portal', { method: 'POST' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.url) {
      setErr(data?.error || 'Não foi possível abrir a área de pagamento.');
      setLoading(false);
      return;
    }
    window.location.href = data.url;
  }

  return (
    <div className="space-y-3 rounded border p-4">
      <div className="font-medium">Pagamento e faturas</div>
      <p className="text-sm text-muted-foreground">
        Troque o cartão, veja e baixe as faturas e recibos na página segura do Stripe. Os dados do cartão não passam pelo FlipForm.
      </p>
      <Button type="button" variant="outline" size="sm" onClick={() => void open()} disabled={loading}>
        {loading ? 'Abrindo...' : 'Gerenciar pagamento e faturas'} <ExternalLink className="h-3.5 w-3.5" />
      </Button>
      {err && <div className="text-sm text-rose-700">{err}</div>}
    </div>
  );
}

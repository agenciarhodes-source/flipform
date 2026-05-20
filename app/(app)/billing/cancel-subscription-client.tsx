'use client';
import { useState } from 'react';

export default function CancelSubscriptionClient() {
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onCancel() {
    if (!confirm('Tem certeza que deseja cancelar a assinatura?')) return;
    setLoading(true); setErr(null); setMsg(null);
    const res = await fetch('/api/billing/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setErr(data?.error || 'Falha ao cancelar assinatura.');
    else setMsg(data?.message || 'Cancelamento solicitado com sucesso.');
    setLoading(false);
  }

  return <div className="rounded border p-4 space-y-2"><div className="font-medium">Cancelar assinatura</div><textarea className="w-full border rounded p-2 text-sm" rows={3} placeholder="Motivo (opcional)" value={reason} onChange={(e) => setReason(e.target.value)} /><button onClick={onCancel} disabled={loading} className="px-3 py-2 border rounded text-sm disabled:opacity-50">{loading ? 'Cancelando...' : 'Cancelar assinatura'}</button>{msg && <div className="text-emerald-700 text-sm">{msg}</div>}{err && <div className="text-rose-700 text-sm">{err}</div>}</div>;
}

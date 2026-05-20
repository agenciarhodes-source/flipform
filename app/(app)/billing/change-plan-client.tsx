'use client';
import { useState } from 'react';

export default function ChangePlanClient({ currentPlan }: { currentPlan: string | null }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function change(targetPlanSlug: string) {
    setErr(null); setMsg(null); setPending(targetPlanSlug);
    const res = await fetch('/api/billing/change-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetPlanSlug }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const details = Array.isArray(data?.details) ? ` (${data.details.map((v: any) => `${v.resource}: ${v.current}/${v.limit}`).join(', ')})` : '';
      setErr(`${data?.error || 'Falha na troca de plano'}${details}`);
    } else setMsg(data?.message || 'Solicitação processada.');
    setPending(null);
  }

  return <div className="rounded border p-4 space-y-3"><div className="font-medium">Trocar plano</div><div className="text-sm text-muted-foreground">Plano atual: {currentPlan || '—'}</div><div className="flex gap-2 flex-wrap">{['starter','growth','pro'].map((slug) => <button key={slug} onClick={() => change(slug)} disabled={pending !== null || currentPlan === slug} className="px-3 py-2 border rounded text-sm disabled:opacity-50">{pending===slug?'Processando...':`Ir para ${slug}`}</button>)}<a href="mailto:comercial@flipform.com.br" className="px-3 py-2 border rounded text-sm">Enterprise (Fale conosco)</a></div>{msg && <div className="text-emerald-700 text-sm">{msg}</div>}{err && <div className="text-rose-700 text-sm">{err}</div>}</div>;
}

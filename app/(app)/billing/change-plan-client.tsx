'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export type ChangePlanOption = { slug: string; name: string; price: number };

function toBrl(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** The plans on sale, from the plans table; the difference is prorated on the next invoice. */
export default function ChangePlanClient({ currentPlan, plans, selfServe }: { currentPlan: string | null; plans: ChangePlanOption[]; selfServe: boolean }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  async function change(target: ChangePlanOption) {
    if (!confirm(`Trocar para o plano ${target.name} (${toBrl(target.price)}/mês)? A diferença proporcional entra na próxima fatura.`)) return;
    setErr(null); setMsg(null); setPending(target.slug);
    const res = await fetch('/api/billing/change-plan', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ targetPlanSlug: target.slug }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const details = Array.isArray(data?.details) ? ` (${data.details.map((v: any) => `${v.resource}: ${v.current}/${v.limit}`).join(', ')})` : '';
      setErr(`${data?.error || 'Falha na troca de plano'}${details}`);
    } else {
      setMsg(data?.message || 'Plano alterado.');
      window.setTimeout(() => window.location.reload(), 1500);
    }
    setPending(null);
  }

  return (
    <div className="space-y-3 rounded border p-4">
      <div className="font-medium">Trocar plano</div>
      <div className="text-sm text-muted-foreground">Plano atual: {plans.find((plan) => plan.slug === currentPlan)?.name || currentPlan || '—'}</div>
      {selfServe ? (
        <div className="flex flex-wrap gap-2">
          {plans.map((plan) => (
            <Button key={plan.slug} type="button" size="sm" variant="outline" onClick={() => void change(plan)} disabled={pending !== null || currentPlan === plan.slug}>
              {pending === plan.slug ? 'Processando...' : `${plan.name} · ${toBrl(plan.price)}/mês`}
            </Button>
          ))}
          <Button asChild size="sm" variant="outline"><a href="mailto:comercial@flipform.com.br">Enterprise (fale conosco)</a></Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">A troca de plano desta empresa é feita pela equipe FlipForm. Fale com o suporte.</p>
      )}
      {msg && <div className="text-sm text-emerald-700">{msg}</div>}
      {err && <div className="text-sm text-rose-700">{err}</div>}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { CreditCard, Loader2, RefreshCcw, Save, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  formatBrlCents,
  GROUP_PLAN_ADDITIONAL_STORE_PRICE,
  GROUP_PLAN_BASE_PRICE,
  groupPlanTotalCents,
} from '@/lib/billing/group-plan-rules';

type Store = {
  id: string;
  name: string;
  status: string;
  planName: string | null;
  subscriptionStatus: string | null;
  coveredByGroup: boolean;
  ownPaidSubscription: boolean;
};
type Snapshot = {
  schemaReady: boolean;
  plan: { payerTenantId: string; basePrice: number; additionalStorePrice: number; status: 'active' | 'ended' } | null;
  stores: Store[];
  totalCents: number;
  payer: { id: string; name: string; planName: string | null; premium: boolean; billingProvider: string; subscriptionStatus: string | null } | null;
  billing?: string;
  billingError?: string;
};

const BILLING_TEXT: Record<string, string> = {
  stripe_updated: 'Valor da assinatura da loja pagadora atualizado na Stripe (a diferença do mês entra na próxima fatura).',
  stripe_same: 'A assinatura da loja pagadora na Stripe já está com este valor.',
  stripe_error: 'Não foi possível atualizar o valor na Stripe. Confira a assinatura da loja pagadora.',
  courtesy: 'A loja pagadora está em cortesia: nenhuma cobrança automática.',
  not_stripe: 'A loja pagadora não paga pela Stripe: cobre o valor do grupo manualmente.',
};

function providerText(provider: string) {
  if (provider === 'stripe') return 'Cobrança automática pela Stripe';
  if (provider === 'courtesy') return 'Cortesia (sem cobrança)';
  return 'Cobrança manual';
}

/** Plano Grupo of a business group: one store pays for all stores (first store + each additional). */
export function GroupPlanCard({ groupId }: { groupId: string }) {
  const [data, setData] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [payerId, setPayerId] = useState('');
  const [basePrice, setBasePrice] = useState(String(GROUP_PLAN_BASE_PRICE));
  const [additionalPrice, setAdditionalPrice] = useState(String(GROUP_PLAN_ADDITIONAL_STORE_PRICE));

  function apply(next: Snapshot) {
    setData(next);
    if (next.plan) {
      setPayerId(next.plan.payerTenantId);
      setBasePrice(String(next.plan.basePrice));
      setAdditionalPrice(String(next.plan.additionalStorePrice));
    } else if (!payerId && next.stores[0]) {
      setPayerId(next.stores[0].id);
    }
  }

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/business-groups/${groupId}/plan`, { cache: 'no-store' });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Falha ao carregar o Plano Grupo.');
      apply(body);
    } catch (e: any) {
      setError(e.message || 'Falha ao carregar o Plano Grupo.');
    } finally {
      setLoading(false);
    }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [groupId]);

  async function send(method: 'PUT' | 'POST' | 'DELETE', body?: unknown) {
    setSaving(true);
    setError(null);
    setNotice(null);
    try {
      const response = await fetch(`/api/admin/business-groups/${groupId}/plan`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Falha ao salvar o Plano Grupo.');
      apply(result);
      const parts = [method === 'DELETE' ? 'Plano Grupo encerrado.' : 'Plano Grupo aplicado às lojas.'];
      if (result.billing && BILLING_TEXT[result.billing]) parts.push(BILLING_TEXT[result.billing]);
      if (result.sync?.skipped?.length) parts.push(`${result.sync.skipped.length} loja(s) ficaram de fora: veja abaixo.`);
      setNotice(parts.join(' '));
    } catch (e: any) {
      setError(e.message || 'Falha ao salvar o Plano Grupo.');
    } finally {
      setSaving(false);
    }
  }

  const stores = data?.stores || [];
  const active = data?.plan?.status === 'active';
  const previewCents = useMemo(
    () => groupPlanTotalCents(stores.length || 1, Number(basePrice.replace(',', '.')) || 0, Number(additionalPrice.replace(',', '.')) || 0),
    [stores.length, basePrice, additionalPrice],
  );
  const aloneCents = Math.round((Number(basePrice.replace(',', '.')) || 0) * 100) * (stores.length || 1);

  if (loading) {
    return <div className="py-6 flex justify-center text-sm text-muted-foreground"><Loader2 className="w-4 h-4 mr-2 animate-spin" />Carregando Plano Grupo...</div>;
  }
  if (data && !data.schemaReady) {
    return <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Plano Grupo: estrutura ainda não instalada no banco.</div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-1 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-medium text-sm flex items-center gap-2">
            <CreditCard className="w-4 h-4" />Plano Grupo
            {active ? <Badge>Ativo</Badge> : data?.plan?.status === 'ended' ? <Badge variant="outline">Encerrado</Badge> : <Badge variant="outline">Não ativado</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">Uma loja paga por todas: a primeira pelo valor base e cada loja adicional pelo valor adicional. As outras lojas recebem o mesmo plano (com IA) e acompanham o pagamento da loja pagadora.</div>
        </div>
      </div>

      {error && <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      {notice && <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

      {stores.length === 0 ? (
        <div className="text-xs text-muted-foreground">Vincule as lojas ao grupo primeiro.</div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-[1fr_150px_150px] gap-2">
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Loja pagadora</span>
              <select className="h-9 w-full rounded-md border bg-background px-3 text-sm" value={payerId} onChange={(e) => setPayerId(e.target.value)} disabled={saving}>
                {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">1ª loja (R$)</span>
              <Input value={basePrice} onChange={(e) => setBasePrice(e.target.value)} inputMode="decimal" disabled={saving} />
            </label>
            <label className="text-xs space-y-1">
              <span className="text-muted-foreground">Cada adicional (R$)</span>
              <Input value={additionalPrice} onChange={(e) => setAdditionalPrice(e.target.value)} inputMode="decimal" disabled={saving} />
            </label>
          </div>

          <div className="rounded-md border bg-background p-3 text-sm">
            <div><strong>{formatBrlCents(previewCents)}/mês</strong> para {stores.length} loja(s)
              {stores.length > 1 && <span className="text-muted-foreground"> (avulso seriam {formatBrlCents(aloneCents)})</span>}
            </div>
            {data?.payer && active && (
              <div className="text-xs text-muted-foreground mt-1">
                Pagadora: {data.payer.name} · {data.payer.planName || 'sem plano'} · {providerText(data.payer.billingProvider)}
              </div>
            )}
          </div>

          <div className="divide-y rounded-md border bg-background">
            {stores.map((store) => (
              <div key={store.id} className="p-3 flex flex-col gap-1 text-sm md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="font-medium truncate">{store.name}</div>
                  <div className="text-xs text-muted-foreground">{store.planName || 'Sem plano'} · {store.status}</div>
                </div>
                <div>
                  {active && store.id === data?.plan?.payerTenantId ? <Badge>Paga o grupo</Badge>
                    : active && store.coveredByGroup ? <Badge variant="secondary">Coberta pelo grupo</Badge>
                    : active && store.ownPaidSubscription ? <Badge variant="outline" className="text-amber-700 border-amber-300">Tem assinatura própria: cancele antes</Badge>
                    : active ? <Badge variant="outline">Pendente</Badge>
                    : store.ownPaidSubscription ? <Badge variant="outline">Assinatura própria</Badge> : null}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => {
                const message = active
                  ? `Salvar o Plano Grupo com ${formatBrlCents(previewCents)}/mês?`
                  : `Ativar o Plano Grupo: ${formatBrlCents(previewCents)}/mês para ${stores.length} loja(s)? As outras lojas recebem o plano da loja pagadora.`;
                if (!window.confirm(message)) return;
                send('PUT', {
                  payerTenantId: payerId,
                  basePrice: Number(basePrice.replace(',', '.')),
                  additionalStorePrice: Number(additionalPrice.replace(',', '.')),
                });
              }}
              disabled={saving || !payerId}
            >
              {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
              {active ? 'Salvar Plano Grupo' : 'Ativar Plano Grupo'}
            </Button>
            {active && (
              <>
                <Button size="sm" variant="outline" onClick={() => send('POST')} disabled={saving}><RefreshCcw className="w-4 h-4 mr-2" />Atualizar lojas</Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-rose-700 hover:text-rose-800"
                  onClick={() => {
                    if (!window.confirm('Encerrar o Plano Grupo? As lojas cobertas perdem o plano do grupo (a IA delas para). Empresas, equipes, leads e conexões continuam como estão. A loja pagadora volta ao valor do próprio plano.')) return;
                    send('DELETE');
                  }}
                  disabled={saving}
                >
                  <XCircle className="w-4 h-4 mr-2" />Encerrar
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

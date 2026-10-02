'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Coins, CreditCard, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

type CreditPackage = {
  id: string;
  name: string;
  description: string;
  credits: number;
  amountCents: number;
};

type WalletEntry = {
  id: string;
  entryType: 'credit' | 'debit' | 'refund';
  amountCredits: number;
  balanceAfterCredits: number;
  source: string;
  referenceId: string | null;
  createdAt: string;
};

type StorefrontOrder = {
  id: string;
  status: 'pending' | 'paid' | 'credited' | 'canceled';
  amountCents: number;
  currency: string;
  credits: number;
  paymentProvider: string | null;
  paidAt: string | null;
  creditedAt: string | null;
  canceledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type Storefront = {
  wallet: {
    available: boolean;
    balanceCredits: number;
    creditedCredits: number;
    debitedCredits: number;
    entries: WalletEntry[];
  };
  packages: CreditPackage[];
  orders: StorefrontOrder[];
  purchases: {
    available: boolean;
    reason: 'catalog_not_configured' | 'live_not_enabled' | 'stripe_not_ready' | null;
  };
};

const number = new Intl.NumberFormat('pt-BR');
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

function moneyFromCents(value: number) {
  return brl.format(value / 100);
}

function statusLabel(status: StorefrontOrder['status']) {
  if (status === 'credited') return 'Créditos liberados';
  if (status === 'paid') return 'Pagamento confirmado';
  if (status === 'canceled') return 'Cancelada';
  return 'Aguardando pagamento';
}

function purchaseUnavailableMessage(reason: Storefront['purchases']['reason']) {
  if (reason === 'catalog_not_configured') return 'Os pacotes de créditos ainda não foram configurados pela plataforma.';
  if (reason === 'live_not_enabled') return 'A compra automática ainda não foi liberada para pagamentos reais.';
  if (reason === 'stripe_not_ready') return 'O meio de pagamento está temporariamente indisponível.';
  return 'A compra automática está temporariamente indisponível.';
}

export function FlipAiCreditWalletClient({ initialStorefront }: { initialStorefront: Storefront }) {
  const [storefront, setStorefront] = useState(initialStorefront);
  const [busyPackage, setBusyPackage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string>('');
  const requestKeys = useRef(new Map<string, string>());
  const searchParams = useSearchParams();
  const router = useRouter();

  const returnedTopUpId = searchParams.get('top_up');
  const checkoutState = searchParams.get('stripe_checkout');

  async function refresh() {
    setRefreshing(true);
    try {
      const response = await fetch('/api/flip-ai/credits', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar a carteira.');
      setStorefront(data);
      return data as Storefront;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao atualizar a carteira.');
      return null;
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (!checkoutState) return;

    if (checkoutState === 'canceled') {
      setMessage('Pagamento cancelado. Nenhum crédito foi adicionado.');
      router.replace('/flip-ai/credits');
      return;
    }
    if (checkoutState !== 'return' || !returnedTopUpId) return;

    let canceled = false;
    const poll = async () => {
      for (let attempt = 0; attempt < 6 && !canceled; attempt += 1) {
        const latest = await refresh();
        const order = latest?.orders.find((item) => item.id === returnedTopUpId);
        if (order?.status === 'credited') {
          setMessage('Pagamento confirmado. Seus créditos já estão disponíveis.');
          router.replace('/flip-ai/credits');
          return;
        }
        if (attempt < 5) await new Promise((resolve) => setTimeout(resolve, 1_500));
      }
      if (!canceled) {
        setMessage('Pagamento recebido pela Stripe. A confirmação dos créditos pode levar alguns instantes.');
        router.replace('/flip-ai/credits');
      }
    };
    void poll();
    return () => { canceled = true; };
    // O polling deve iniciar apenas ao retornar do Checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutState, returnedTopUpId]);

  async function buy(packageId: string) {
    if (busyPackage) return;
    setBusyPackage(packageId);
    setMessage('');

    let requestKey = requestKeys.current.get(packageId);
    if (!requestKey) {
      requestKey = crypto.randomUUID();
      requestKeys.current.set(packageId, requestKey);
    }

    try {
      const response = await fetch('/api/flip-ai/credits/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ packageId, requestKey }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível abrir o pagamento.');
      if (!data.checkoutUrl || typeof data.checkoutUrl !== 'string') {
        throw new Error('A Stripe não retornou uma URL de pagamento válida.');
      }
      window.location.assign(data.checkoutUrl);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Falha ao iniciar a compra.');
      setBusyPackage(null);
    }
  }

  const latestOrders = useMemo(() => storefront.orders.slice(0, 10), [storefront.orders]);

  return (
    <div className="space-y-6">
      {message && (
        <div className="rounded-md border bg-muted/30 px-4 py-3 text-sm">
          {message}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Saldo disponível</CardDescription>
            <CardTitle className="text-3xl">{number.format(storefront.wallet.balanceCredits)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">créditos Flip AI</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Entradas acumuladas</CardDescription>
            <CardTitle className="text-3xl">{number.format(storefront.wallet.creditedCredits)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">créditos e estornos</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Consumo acumulado</CardDescription>
            <CardTitle className="text-3xl">{number.format(storefront.wallet.debitedCredits)}</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">créditos utilizados</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Coins className="h-5 w-5" /> Comprar créditos
            </CardTitle>
            <CardDescription className="mt-1">
              Escolha um pacote. O pagamento é processado pela Stripe e os créditos são liberados automaticamente após a confirmação.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Atualizar
          </Button>
        </CardHeader>
        <CardContent>
          {!storefront.purchases.available ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
              {purchaseUnavailableMessage(storefront.purchases.reason)}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {storefront.packages.map((item) => (
                <div key={item.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold">{item.name}</div>
                      <div className="mt-1 text-sm text-muted-foreground">{item.description}</div>
                    </div>
                    <Badge variant="secondary">{number.format(item.credits)} créditos</Badge>
                  </div>
                  <div className="mt-5 text-2xl font-semibold">{moneyFromCents(item.amountCents)}</div>
                  <Button
                    className="mt-4 w-full"
                    onClick={() => void buy(item.id)}
                    disabled={Boolean(busyPackage)}
                  >
                    {busyPackage === item.id
                      ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      : <CreditCard className="mr-2 h-4 w-4" />}
                    Comprar créditos
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="mt-4 flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Preço e quantidade de créditos são definidos pela plataforma no servidor. O navegador não pode alterar o valor da compra nem liberar créditos.
            </span>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recargas recentes</CardTitle>
          <CardDescription>Últimas compras de créditos desta empresa.</CardDescription>
        </CardHeader>
        <CardContent>
          {latestOrders.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Nenhuma recarga registrada.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Status</th>
                    <th className="px-3 py-2 text-right">Créditos</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {latestOrders.map((order) => (
                    <tr key={order.id} className="border-b last:border-0">
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(order.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 py-2">
                        <Badge variant={order.status === 'credited' ? 'secondary' : order.status === 'canceled' ? 'destructive' : 'outline'}>
                          {statusLabel(order.status)}
                        </Badge>
                      </td>
                      <td className="px-3 py-2 text-right">{number.format(order.credits)}</td>
                      <td className="px-3 py-2 text-right">{moneyFromCents(order.amountCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Histórico de consumo</CardTitle>
          <CardDescription>Últimos lançamentos da carteira desta empresa.</CardDescription>
        </CardHeader>
        <CardContent>
          {storefront.wallet.entries.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
              Ainda não há movimentações na carteira.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40">
                  <tr className="text-xs uppercase text-muted-foreground">
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Movimento</th>
                    <th className="px-3 py-2 text-right">Créditos</th>
                    <th className="px-3 py-2 text-right">Saldo após</th>
                  </tr>
                </thead>
                <tbody>
                  {storefront.wallet.entries.map((entry) => (
                    <tr key={entry.id} className="border-b last:border-0">
                      <td className="px-3 py-2 text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleString('pt-BR')}
                      </td>
                      <td className="px-3 py-2">
                        {entry.entryType === 'debit' ? 'Consumo' : entry.entryType === 'refund' ? 'Estorno' : 'Crédito'}
                      </td>
                      <td className="px-3 py-2 text-right">
                        {entry.entryType === 'debit' ? '−' : '+'}{number.format(entry.amountCredits)}
                      </td>
                      <td className="px-3 py-2 text-right">{number.format(entry.balanceAfterCredits)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

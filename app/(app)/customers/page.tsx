'use client';

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, CircleDollarSign, Repeat2, Search, Sparkles, TrendingUp, Trophy, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatDateOnlyBR, todayDateOnly } from '@/lib/date-only';

type Purchase = {
  id: string;
  amountCents: number;
  currency: string;
  purchaseDate: string;
  orderNumber: string | null;
  paymentMethod: string | null;
  paymentLabel: string;
  notes: string | null;
};

type Customer = {
  leadId: string;
  name: string;
  email: string | null;
  phone: string | null;
  assignedUser: { id: string; name: string } | null;
  purchaseCount: number;
  totalAmountCents: number;
  averageTicketCents: number;
  preferredPaymentMethod: string | null;
  preferredPaymentLabel: string;
  firstPurchaseAt: string | null;
  lastPurchaseAt: string | null;
  customerType: 'new_customer' | 'recurring_customer';
  purchases: Purchase[];
};

type CustomersResponse = {
  sort: 'purchases' | 'amount';
  period: '7d' | '30d' | 'custom';
  startDate: string;
  endDate: string;
  summary: {
    totalCustomers: number;
    recurringCustomers: number;
    repurchaseRate: number;
    totalPurchases: number;
    totalRevenueCents: number;
    averageTicketCents: number;
    averageLtvCents: number;
  };
  customers: Customer[];
};

function money(cents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format((cents || 0) / 100);
}

function date(value: string | null) {
  return formatDateOnlyBR(value);
}

function daysAgoDateOnly(days: number) {
  const today = todayDateOnly();
  const [year, month, day] = today.split('-').map(Number);
  const value = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  value.setUTCDate(value.getUTCDate() - days);
  return value.toISOString().slice(0, 10);
}

export default function CustomersPage() {
  const [sort, setSort] = useState<'purchases' | 'amount'>('purchases');
  const [period, setPeriod] = useState<'7d' | '30d' | 'custom'>('30d');
  const [startDate, setStartDate] = useState(() => daysAgoDateOnly(29));
  const [endDate, setEndDate] = useState(() => todayDateOnly());
  const [search, setSearch] = useState('');
  const [data, setData] = useState<CustomersResponse | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        if (period === 'custom' && (!startDate || !endDate || startDate > endDate)) {
          setData(null);
          setError('Informe um período personalizado válido.');
          setLoading(false);
          return;
        }
        const params = new URLSearchParams({ sort, period });
        if (period === 'custom') {
          params.set('startDate', startDate);
          params.set('endDate', endDate);
        }
        if (search.trim()) params.set('q', search.trim());
        const response = await fetch(`/api/customers?${params.toString()}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os clientes.');
        setData(payload);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setError(err instanceof Error ? err.message : 'Não foi possível carregar os clientes.');
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [sort, period, startDate, endDate, search]);

  return (
    <div className="space-y-5 p-4 lg:p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Users className="h-6 w-6 text-brand-600" />
            <h1 className="font-heading text-2xl font-bold">Clientes</h1>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">Clientes são pessoas com pelo menos uma compra registrada no período selecionado. Um mesmo cliente pode realizar várias compras.</p>
        </div>
        <div className="flex flex-col gap-2 xl:items-end">
          <div className="flex flex-wrap gap-2">
            <Select value={period} onValueChange={(value) => setPeriod(value as '7d' | '30d' | 'custom')}>
              <SelectTrigger className="w-[170px]" aria-label="Período de clientes"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7d">7 dias</SelectItem>
                <SelectItem value="30d">30 dias</SelectItem>
                <SelectItem value="custom">Personalizado</SelectItem>
              </SelectContent>
            </Select>
            {period === 'custom' && (
              <>
                <Input aria-label="Data inicial de clientes" type="date" value={startDate} max={endDate} onChange={(event) => setStartDate(event.target.value)} className="w-[160px]" />
                <Input aria-label="Data final de clientes" type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} className="w-[160px]" />
              </>
            )}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
          <div className="relative min-w-[260px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar cliente..." value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <Select value={sort} onValueChange={(value) => setSort(value as 'purchases' | 'amount')}>
            <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="purchases">Quem mais comprou</SelectItem>
              <SelectItem value="amount">Maior valor comprado</SelectItem>
            </SelectContent>
          </Select>
          </div>
        </div>
      </div>

      {data && (
        <>
          <Card className="border-dashed bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
            Visão por compras realizadas no período: <strong className="text-foreground">{formatDateOnlyBR(data.startDate)} a {formatDateOnlyBR(data.endDate)}</strong>. Ranking, clientes, recompra, ticket e LTV realizado abaixo consideram apenas essa janela.
          </Card>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            <Card className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Clientes</p><p className="mt-1 text-2xl font-bold">{data.summary.totalCustomers}</p></div><Users className="h-5 w-5 text-muted-foreground" /></div></Card>
            <Card className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Clientes recorrentes</p><p className="mt-1 text-2xl font-bold">{data.summary.recurringCustomers}</p><p className="mt-1 text-[11px] text-muted-foreground">2 ou mais compras</p></div><Repeat2 className="h-5 w-5 text-muted-foreground" /></div></Card>
            <Card className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Taxa de recompra</p><p className="mt-1 text-2xl font-bold">{data.summary.repurchaseRate}%</p><p className="mt-1 text-[11px] text-muted-foreground">clientes que voltaram a comprar</p></div><TrendingUp className="h-5 w-5 text-muted-foreground" /></div></Card>
            <Card className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Compras</p><p className="mt-1 text-2xl font-bold">{data.summary.totalPurchases}</p></div><Trophy className="h-5 w-5 text-muted-foreground" /></div></Card>
            <Card className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">Ticket médio</p><p className="mt-1 text-2xl font-bold">{money(data.summary.averageTicketCents)}</p></div><CircleDollarSign className="h-5 w-5 text-muted-foreground" /></div></Card>
            <Card className="p-4"><div className="flex items-start justify-between"><div><p className="text-xs text-muted-foreground">LTV médio realizado</p><p className="mt-1 text-2xl font-bold">{money(data.summary.averageLtvCents)}</p><p className="mt-1 text-[11px] text-muted-foreground">valor médio acumulado por cliente</p></div><Sparkles className="h-5 w-5 text-muted-foreground" /></div></Card>
          </div>

          {data.customers.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b px-4 py-3">
                <h2 className="font-heading font-semibold">Pódio de clientes</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">{sort === 'purchases' ? 'Destaques por frequência de compra.' : 'Destaques por LTV realizado.'}</p>
              </div>
              <div className="grid gap-3 p-4 md:grid-cols-3">
                {data.customers.slice(0, 3).map((customer, index) => (
                  <div key={customer.leadId} className="rounded-xl border bg-gradient-to-br from-white to-slate-50 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0"><div className="text-xs font-bold uppercase tracking-wide text-muted-foreground">#{index + 1}</div><div className="mt-1 truncate font-heading text-lg font-semibold">{customer.name}</div></div>
                      <Trophy className="h-5 w-5 text-amber-600" />
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div><div className="text-xs text-muted-foreground">Compras</div><div className="font-bold">{customer.purchaseCount}</div></div>
                      <div><div className="text-xs text-muted-foreground">LTV realizado</div><div className="font-bold">{money(customer.totalAmountCents)}</div></div>
                      <div><div className="text-xs text-muted-foreground">Ticket médio</div><div className="font-medium">{money(customer.averageTicketCents)}</div></div>
                      <div><div className="text-xs text-muted-foreground">Preferido</div><div className="truncate font-medium">{customer.preferredPaymentLabel}</div></div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </>
      )}

      {error && <Card className="border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</Card>}
      {loading && !data && <Card className="p-8 text-center text-sm text-muted-foreground">Carregando clientes...</Card>}

      {data && (
        <Card className="overflow-hidden">
          <div className="border-b px-4 py-3">
            <h2 className="font-heading font-semibold">Melhores clientes</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Ordem atual: {sort === 'purchases' ? 'maior número de compras' : 'maior valor total comprado'}, do maior para o menor.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Cliente</th>
                  <th className="px-4 py-3 text-right">Compras</th>
                  <th className="px-4 py-3 text-right">Total comprado</th>
                  <th className="px-4 py-3 text-right">Ticket médio</th>
                  <th className="px-4 py-3 text-left">Perfil</th>
                  <th className="px-4 py-3 text-left">Pagamento preferido</th>
                  <th className="px-4 py-3 text-left">Primeira compra</th>
                  <th className="px-4 py-3 text-left">Última compra</th>
                  <th className="px-4 py-3 text-left">Vendedor</th>
                  <th className="px-4 py-3 text-right">Histórico</th>
                </tr>
              </thead>
              <tbody>
                {data.customers.map((customer, index) => {
                  const isOpen = expanded === customer.leadId;
                  return [
                    <tr key={customer.leadId} className="border-t">
                      <td className="px-4 py-3 font-semibold">{index + 1}</td>
                      <td className="px-4 py-3"><div className="font-medium">{customer.name}</div><div className="text-xs text-muted-foreground">{customer.phone || customer.email || 'Sem contato informado'}</div></td>
                      <td className="px-4 py-3 text-right font-semibold">{customer.purchaseCount}</td>
                      <td className="px-4 py-3 text-right font-semibold">{money(customer.totalAmountCents)}</td>
                      <td className="px-4 py-3 text-right">{money(customer.averageTicketCents)}</td>
                      <td className="px-4 py-3"><span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${customer.customerType === 'recurring_customer' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'}`}>{customer.customerType === 'recurring_customer' ? 'Recorrente' : 'Cliente novo'}</span></td>
                      <td className="px-4 py-3">{customer.preferredPaymentLabel}</td>
                      <td className="px-4 py-3">{date(customer.firstPurchaseAt)}</td>
                      <td className="px-4 py-3">{date(customer.lastPurchaseAt)}</td>
                      <td className="px-4 py-3">{customer.assignedUser?.name || 'Sem responsável'}</td>
                      <td className="px-4 py-3 text-right"><Button size="sm" variant="outline" onClick={() => setExpanded(isOpen ? null : customer.leadId)}>{isOpen ? <ChevronUp className="mr-1 h-3.5 w-3.5" /> : <ChevronDown className="mr-1 h-3.5 w-3.5" />}Compras</Button></td>
                    </tr>,
                    isOpen ? (
                      <tr key={`${customer.leadId}-history`} className="border-t bg-muted/20">
                        <td colSpan={11} className="px-4 py-4">
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Histórico de compras de {customer.name}</div>
                          <div className="grid gap-2 lg:grid-cols-2">
                            {customer.purchases.map((purchase, purchaseIndex) => (
                              <div key={purchase.id} className="rounded-lg border bg-background p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div><div className="font-semibold">{money(purchase.amountCents)}</div><div className="mt-0.5 text-xs text-muted-foreground">{date(purchase.purchaseDate)} · {purchase.paymentLabel}</div></div>
                                  <span className="text-xs font-medium text-muted-foreground">{customer.purchaseCount - purchaseIndex}ª compra</span>
                                </div>
                                {(purchase.orderNumber || purchase.notes) && <div className="mt-2 text-xs text-muted-foreground">{purchase.orderNumber ? `Pedido #${purchase.orderNumber}` : ''}{purchase.orderNumber && purchase.notes ? ' · ' : ''}{purchase.notes || ''}</div>}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ) : null,
                  ];
                })}
              </tbody>
            </table>
          </div>
          {!data.customers.length && <div className="p-8 text-center text-sm text-muted-foreground">Nenhum cliente com compra registrada foi encontrado.</div>}
        </Card>
      )}
    </div>
  );
}

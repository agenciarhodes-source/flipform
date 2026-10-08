'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, Landmark, Loader2, RefreshCw, ShieldCheck, WalletCards } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const number = new Intl.NumberFormat('pt-BR');
const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const smallUsd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});

// Fractions of a cent would otherwise read as "$0.00" and look like no cost at all.
function formatUsd(value: number) {
  return value > 0 && value < 0.01 ? smallUsd.format(value) : usd.format(value);
}

const ACCOUNT_KIND_LABELS: Record<string, string> = {
  internal_test: 'Teste interno',
  technical_access: 'Acesso técnico',
  unclassified: 'Não classificado',
};

const STATUS: Record<string, { label: string; className: string }> = {
  healthy: { label: 'Saudável', className: 'border-emerald-200 bg-emerald-50 text-emerald-900' },
  attention: { label: 'Atenção', className: 'border-amber-200 bg-amber-50 text-amber-950' },
  risk: { label: 'Risco', className: 'border-red-200 bg-red-50 text-red-950' },
  unconfigured: { label: 'Configuração pendente', className: 'border-slate-200 bg-slate-50 text-slate-900' },
};

export default function AdminAiTreasuryPage() {
  const [treasury, setTreasury] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [balanceInput, setBalanceInput] = useState('');
  const [savingBalance, setSavingBalance] = useState(false);
  const [balanceMessage, setBalanceMessage] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/flip-ai/treasury', { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Não foi possível carregar a tesouraria.');
      setTreasury(data.treasury);
    } catch (e: any) {
      setTreasury(null);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const saveBalance = async () => {
    setSavingBalance(true);
    setBalanceMessage(null);
    try {
      const response = await fetch('/api/admin/flip-ai/treasury/operational-balance', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usd: balanceInput }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro');
      setBalanceInput('');
      setBalanceMessage('Saldo de referência salvo.');
      await load();
    } catch (saveError: any) {
      setBalanceMessage(saveError.message || 'Não foi possível salvar o saldo de referência.');
    } finally {
      setSavingBalance(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (loading) {
    return <div className="p-8 text-muted-foreground">
      <Loader2 className="mr-2 inline h-5 w-5 animate-spin" />Carregando tesouraria de IA...
    </div>;
  }

  if (error || !treasury) {
    return <div className="p-8 space-y-4">
      <h1 className="font-heading text-2xl font-bold">Tesouraria IA</h1>
      <Card className="p-5 text-sm text-red-900 border-red-200 bg-red-50">
        {error || 'Não foi possível carregar a tesouraria.'}
      </Card>
      <Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button>
    </div>;
  }

  const state = STATUS[treasury.balances.status] || STATUS.unconfigured;
  const officialSpend = treasury.spend.officialProvider.available
    ? treasury.spend.officialProvider.cost30dUsd
    : treasury.spend.localBilled30dUsd;

  return <div className="p-8 space-y-5">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="mb-2 flex items-center gap-2 text-sm text-brand-600">
          <Landmark className="h-5 w-5" /> Financeiro operacional
        </div>
        <h1 className="font-heading text-2xl font-bold">Tesouraria IA</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cobertura dos créditos Flip AI em circulação e capacidade operacional da OpenAI.
        </p>
      </div>
      <Button variant="outline" onClick={load}><RefreshCw className="mr-2 h-4 w-4" />Atualizar</Button>
    </div>

    <Card className={'p-5 border ' + state.className}>
      <div className="flex items-start gap-3">
        {treasury.balances.status === 'healthy'
          ? <ShieldCheck className="mt-0.5 h-6 w-6 shrink-0" />
          : <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0" />}
        <div>
          <p className="font-semibold">Cobertura: {state.label}</p>
          <p className="mt-1 text-sm">
            {treasury.balances.status === 'healthy'
              ? 'A reserva operacional de referência cobre a obrigação atual e a margem de segurança.'
              : treasury.balances.status === 'attention'
                ? 'A obrigação principal está coberta, mas a margem de segurança ainda não está completa.'
                : treasury.balances.status === 'risk'
                  ? 'A reserva operacional de referência está abaixo da obrigação de IA dos créditos em circulação.'
                  : 'Defina a referência de saldo OpenAI e os custos internos dos pacotes para calcular a cobertura.'}
          </p>
        </div>
      </div>
    </Card>

    {treasury.policy.status !== 'complete' && (
      <Card className="p-4 border-amber-200 bg-amber-50 text-sm text-amber-950">
        <strong>Política de reserva incompleta.</strong> Todos os pacotes comerciais devem possuir
        <code className="mx-1">estimatedOpenAiCostCents</code> maior que zero. Enquanto houver pacote sem custo interno,
        a maior taxa válida disponível é usada de forma conservadora.
      </Card>
    )}

    {treasury.balances.operationalBalanceStatus !== 'valid' && treasury.balances.liabilityUsd !== 0 && (
      <Card className="p-4 border-amber-200 bg-amber-50 text-sm text-amber-950">
        Informe o saldo OpenAI de referência no campo abaixo para comparar a obrigação calculada
        com a reserva operacional disponível.
      </Card>
    )}

    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
      <Metric label="Créditos em circulação" value={number.format(treasury.balances.creditsInCirculation)} detail={number.format(treasury.balances.tenantsWithCredits) + ' cliente(s) com saldo'} />
      <Metric label="Obrigação de IA" value={treasury.balances.liabilityUsd == null ? '—' : formatUsd(treasury.balances.liabilityUsd)} detail={'Taxa conservadora: ' + (treasury.policy.reserveUsdPerMillionCredits == null ? 'não definida' : formatUsd(treasury.policy.reserveUsdPerMillionCredits) + ' / 1M créditos')} />
      <Metric label="Reserva recomendada" value={treasury.balances.requiredReserveUsd == null ? '—' : formatUsd(treasury.balances.requiredReserveUsd)} detail={'Inclui ' + treasury.policy.bufferPercent + '% de segurança'} />
      <Metric label="Saldo OpenAI de referência" value={treasury.balances.operationalBalanceUsd == null ? '—' : formatUsd(treasury.balances.operationalBalanceUsd)} detail={treasury.balances.operationalBalanceSource === 'admin_panel' ? 'Informado neste painel' + (treasury.balances.operationalBalanceUpdatedAt ? ' em ' + new Date(treasury.balances.operationalBalanceUpdatedAt).toLocaleDateString('pt-BR') : '') : 'Referência manual do servidor'} />
      <Metric label="Recarga recomendada agora" value={treasury.balances.recommendedTopUpUsd == null ? '—' : formatUsd(treasury.balances.recommendedTopUpUsd)} detail="Para atingir obrigação + buffer" />
      <Metric label="Cobertura da obrigação" value={treasury.balances.coveragePercent == null ? '—' : treasury.balances.coveragePercent.toFixed(1) + '%'} detail={treasury.balances.requiredReserveCoveragePercent == null ? 'Buffer não calculado' : treasury.balances.requiredReserveCoveragePercent.toFixed(1) + '% da reserva recomendada'} />
      <Metric label="Gasto OpenAI — 30 dias" value={officialSpend == null ? '—' : formatUsd(officialSpend)} detail={treasury.spend.officialProvider.available ? 'Costs API oficial da organização' : 'Ledger Flip AI contabilizado'} />
      <Metric label="Receita de créditos — 30 dias" value={brl.format(treasury.sales30d.revenueBrl)} detail={number.format(treasury.sales30d.creditsSold) + ' créditos vendidos'} />
    </div>

    <Card className="p-5">
      <h2 className="font-heading font-semibold">Saldo OpenAI de referência</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        A OpenAI não informa o saldo pré-pago por API. Digite aqui o valor que aparece em Billing na OpenAI sempre que
        recarregar; ele é usado só para calcular cobertura e duração do caixa. Não movimenta dinheiro nem altera a
        recarga da OpenAI.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="text-sm">
          <span className="mb-1 block text-xs text-muted-foreground">Saldo atual em dólar (US$)</span>
          <input
            className="w-48 rounded border bg-background p-2"
            type="number"
            min="0"
            step="0.01"
            placeholder="Ex.: 50.00"
            value={balanceInput}
            onChange={(event) => setBalanceInput(event.target.value)}
          />
        </label>
        <Button onClick={saveBalance} disabled={savingBalance || balanceInput.trim() === ''}>
          {savingBalance ? 'Salvando...' : 'Salvar saldo'}
        </Button>
        {balanceMessage && <span className="text-xs text-muted-foreground">{balanceMessage}</span>}
      </div>
    </Card>

    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <WalletCards className="mt-0.5 h-5 w-5 text-brand-600" />
          <div>
            <h2 className="font-heading font-semibold">Runway operacional</h2>
            <p className="mt-2 text-3xl font-bold">
              {treasury.spend.projectedRunwayDays == null ? '—' : treasury.spend.projectedRunwayDays + ' dias'}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Projeção usando a média diária dos últimos 30 dias. Quando disponível, prioriza o custo oficial da organização OpenAI.
            </p>
          </div>
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="font-heading font-semibold">Automação de recarga</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O FlipForm calcula a reserva necessária automaticamente. A recarga monetária da OpenAI continua sendo executada
          pelo recurso de auto-reload configurado na própria conta OpenAI; não existe endpoint oficial de saldo/recarga
          usado por este painel.
        </p>
        <p className="mt-3 text-sm">
          <strong>Alvo operacional atual:</strong>{' '}
          {treasury.balances.requiredReserveUsd == null ? 'não calculado' : formatUsd(treasury.balances.requiredReserveUsd)}
        </p>
      </Card>
    </div>

    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b">
        <h2 className="font-heading font-semibold">Política dos pacotes</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          O maior custo interno por milhão é usado como referência conservadora para todos os créditos em circulação.
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 border-b">
            <tr className="text-xs uppercase text-muted-foreground">
              <th className="text-left py-3 px-4">Pacote</th>
              <th className="text-right py-3 px-4">Créditos</th>
              <th className="text-right py-3 px-4">Reserva interna</th>
              <th className="text-right py-3 px-4">USD / 1M créditos</th>
            </tr>
          </thead>
          <tbody>
            {treasury.policy.packages.map((item: any) => (
              <tr key={item.id} className="border-b last:border-0">
                <td className="py-3 px-4 font-medium">{item.name}</td>
                <td className="py-3 px-4 text-right">{number.format(item.credits)}</td>
                <td className="py-3 px-4 text-right">{item.estimatedOpenAiCostCents > 0 ? formatUsd(item.estimatedOpenAiCostUsd) : 'Não definida'}</td>
                <td className="py-3 px-4 text-right">{item.reserveUsdPerMillion == null ? '—' : formatUsd(item.reserveUsdPerMillion)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>

    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b">
        <h2 className="font-heading font-semibold">Consumo por empresa — 30 dias</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Soma todos os acessos de cada empresa. Operações sem débito foram confirmadas e atendidas, mas não puderam ser
          descontadas da carteira (saldo insuficiente ou cobrança indisponível). Não faturáveis são operações sem custo
          confirmado para cobrar. Contas que não são cliente aparecem com a etiqueta do tipo; o custo delas é real.
        </p>
      </div>
      {!treasury.companyUsage30d?.length ? (
        <div className="p-6 text-sm text-muted-foreground">Nenhuma operação confirmada no período.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr className="text-xs uppercase text-muted-foreground">
                <th className="text-left py-3 px-4">Empresa</th>
                <th className="text-right py-3 px-4">Operações confirmadas</th>
                <th className="text-right py-3 px-4">Cobradas</th>
                <th className="text-right py-3 px-4">Sem débito</th>
                <th className="text-right py-3 px-4">Não faturáveis</th>
                <th className="text-right py-3 px-4">Créditos consumidos</th>
                <th className="text-right py-3 px-4">Custo coberto</th>
                <th className="text-right py-3 px-4">Custo sem débito</th>
              </tr>
            </thead>
            <tbody>
              {treasury.companyUsage30d.map((company: any) => (
                <tr key={company.tenantId} className="border-b last:border-0">
                  <td className="py-3 px-4 font-medium">
                    {company.tenantName}
                    {company.accountKind !== 'client' && (
                      <span className="ml-2 rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 text-[11px] font-normal text-slate-700">
                        {ACCOUNT_KIND_LABELS[company.accountKind] || 'Não classificado'}
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">{number.format(company.confirmedOperations)}</td>
                  <td className="py-3 px-4 text-right">{number.format(company.chargedOperations)}</td>
                  <td className={company.undebitedOperations > 0 ? 'py-3 px-4 text-right font-medium text-amber-700' : 'py-3 px-4 text-right'}>
                    {number.format(company.undebitedOperations)}
                  </td>
                  <td className="py-3 px-4 text-right">{number.format(company.notBillableOperations)}</td>
                  <td className="py-3 px-4 text-right">{number.format(company.chargedCredits)}</td>
                  <td className="py-3 px-4 text-right">{formatUsd(company.chargedCostUsd)}</td>
                  <td className="py-3 px-4 text-right">{formatUsd(company.undebitedCostUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>

    <Card className="p-0 overflow-hidden">
      <div className="p-4 border-b">
        <h2 className="font-heading font-semibold">Maiores obrigações por cliente</h2>
        <p className="mt-1 text-xs text-muted-foreground">Ordenado pelo saldo de créditos ainda disponível.</p>
      </div>
      {treasury.tenants.length === 0 ? (
        <div className="p-6 text-sm text-muted-foreground">Nenhum cliente possui créditos em circulação.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 border-b">
              <tr className="text-xs uppercase text-muted-foreground">
                <th className="text-left py-3 px-4">Cliente</th>
                <th className="text-left py-3 px-4">Status</th>
                <th className="text-right py-3 px-4">Saldo Flip AI</th>
                <th className="text-right py-3 px-4">Obrigação estimada</th>
              </tr>
            </thead>
            <tbody>
              {treasury.tenants.map((tenant: any) => (
                <tr key={tenant.tenantId} className="border-b last:border-0">
                  <td className="py-3 px-4 font-medium">{tenant.tenantName}</td>
                  <td className="py-3 px-4 text-xs">{tenant.tenantStatus}</td>
                  <td className="py-3 px-4 text-right">{number.format(tenant.balanceCredits)}</td>
                  <td className="py-3 px-4 text-right">{tenant.liabilityUsd == null ? '—' : formatUsd(tenant.liabilityUsd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>

    <p className="text-xs text-muted-foreground">
      Atualizado em {new Date(treasury.generatedAt).toLocaleString('pt-BR')}. Esta tela é somente leitura e não movimenta dinheiro,
      não compra créditos na OpenAI e não altera carteiras dos clientes.
    </p>
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <Card className="p-4">
    <div className="text-xs text-muted-foreground">{label}</div>
    <div className="font-heading text-xl font-bold mt-1">{value}</div>
    <div className="text-xs text-muted-foreground mt-1">{detail}</div>
  </Card>;
}

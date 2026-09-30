'use client';

import { useCallback, useEffect, useState } from 'react';
import { Activity, AlertTriangle, Bot, Coins, Loader2, RefreshCw, WalletCards } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 4 });
const integer = new Intl.NumberFormat('pt-BR');

type ObservabilityResponse = {
  configured: boolean;
  code?: string;
  message?: string;
  error?: string;
  providerStatus?: number | null;
  requestId?: string | null;
  observability?: {
    range: { days: number; from: string; toExclusive: string };
    costs: {
      totalUsd: number;
      averageDailyUsd: number;
      daily: Array<{ startTime: string; endTime: string; costUsd: number }>;
      breakdown: Array<{
        projectId: string | null;
        apiKeyId: string | null;
        lineItem: string | null;
        costUsd: number;
      }>;
    };
    usage: {
      models: Array<{
        operation: 'completions' | 'embeddings';
        model: string;
        requests: number;
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
      }>;
      totalRequests: number;
      totalInputTokens: number;
      totalOutputTokens: number;
    };
    operationalBalance: {
      status: 'missing' | 'invalid' | 'valid';
      usd: number | null;
      projectedDaysRemaining: number | null;
      source: 'manual_server_configuration';
    };
    generatedAt: string;
  };
};

function maskIdentifier(value: string | null) {
  if (!value) return '—';
  if (value.length <= 14) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}

export default function OpenAiObservabilityPage() {
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ObservabilityResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (nextDays = days) => {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/openai/observability?days=${nextDays}`, { cache: 'no-store' });
      const payload = await response.json();
      setData(payload);
    } catch {
      setData({ configured: true, error: 'Falha de rede ao consultar a observabilidade da OpenAI.' });
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    load(days);
  }, [days, load]);

  const obs = data?.observability;

  return (
    <div className="p-8 space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">OpenAI — observabilidade operacional</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
            Área exclusiva do Super Admin. Estes dados pertencem à conta operacional do FlipForm e não representam
            créditos de nenhum cliente na Carteira Flip AI.
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 30].map((value) => (
            <Button
              key={value}
              variant={days === value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setDays(value)}
              disabled={loading}
            >
              {value} dias
            </Button>
          ))}
          <Button variant="outline" size="sm" onClick={() => load(days)} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </Button>
        </div>
      </div>

      {!data || loading ? (
        <div className="py-12 text-muted-foreground">
          <Loader2 className="w-5 h-5 inline animate-spin mr-2" />
          Consultando custos e utilização...
        </div>
      ) : !data.configured ? (
        <Card className="p-5 border-amber-200 bg-amber-50/50">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5" />
            <div>
              <h2 className="font-semibold">Admin API da OpenAI ainda não configurada</h2>
              <p className="text-sm text-muted-foreground mt-1">{data.message}</p>
              <p className="text-xs text-muted-foreground mt-2">
                A chave deve existir somente no servidor. Ela não é exibida nem enviada ao navegador.
              </p>
            </div>
          </div>
        </Card>
      ) : data.error ? (
        <Card className="p-5 border-red-200 bg-red-50/50">
          <div className="flex gap-3">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div>
              <h2 className="font-semibold">Não foi possível consultar a OpenAI</h2>
              <p className="text-sm text-muted-foreground mt-1">{data.error}</p>
              {data.requestId && <p className="text-xs text-muted-foreground mt-2">Request ID: {data.requestId}</p>}
            </div>
          </div>
        </Card>
      ) : obs ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <MetricCard icon={Coins} label={`Custo — ${obs.range.days} dias`} value={usd.format(obs.costs.totalUsd)} />
            <MetricCard icon={Activity} label="Média diária" value={usd.format(obs.costs.averageDailyUsd)} />
            <MetricCard
              icon={WalletCards}
              label="Saldo operacional estimado"
              value={obs.operationalBalance.status === 'valid' && obs.operationalBalance.usd !== null
                ? usd.format(obs.operationalBalance.usd)
                : 'Não informado'}
            />
            <MetricCard
              icon={Bot}
              label="Projeção pela média"
              value={obs.operationalBalance.projectedDaysRemaining !== null
                ? `~${obs.operationalBalance.projectedDaysRemaining.toLocaleString('pt-BR')} dias`
                : '—'}
            />
          </div>

          <Card className="p-4 text-sm">
            <strong>Importante:</strong> o saldo pré-pago restante não é tratado como um valor oficial neste painel.
            Quando <code>OPENAI_OPERATIONAL_BALANCE_USD</code> é configurado, ele aparece somente como referência
            manual para estimar quantos dias o caixa operacional pode durar pela média atual.
          </Card>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Card className="p-5 overflow-hidden">
              <div className="mb-4">
                <h2 className="font-heading font-semibold">Uso por modelo</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  {integer.format(obs.usage.totalRequests)} requisições • {integer.format(obs.usage.totalInputTokens)} tokens de entrada
                  {' • '}{integer.format(obs.usage.totalOutputTokens)} tokens de saída
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs uppercase text-muted-foreground">
                      <th className="text-left py-2">Modelo</th>
                      <th className="text-left py-2">Operação</th>
                      <th className="text-right py-2">Req.</th>
                      <th className="text-right py-2">Entrada</th>
                      <th className="text-right py-2">Saída</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obs.usage.models.length ? obs.usage.models.map((item) => (
                      <tr key={`${item.operation}:${item.model}`} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-medium">{item.model}</td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {item.operation === 'completions' ? 'Responses / completions' : 'Embeddings'}
                        </td>
                        <td className="py-2 text-right">{integer.format(item.requests)}</td>
                        <td className="py-2 text-right">{integer.format(item.inputTokens)}</td>
                        <td className="py-2 text-right">{integer.format(item.outputTokens)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={5} className="py-8 text-center text-muted-foreground">Sem uso no período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            <Card className="p-5 overflow-hidden">
              <div className="mb-4">
                <h2 className="font-heading font-semibold">Custo por projeto, chave e item</h2>
                <p className="text-xs text-muted-foreground mt-1">
                  Identificadores ajudam a localizar a origem do custo; a chave secreta nunca é retornada.
                </p>
              </div>
              <div className="overflow-x-auto max-h-[420px]">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-background">
                    <tr className="border-b text-xs uppercase text-muted-foreground">
                      <th className="text-left py-2">Projeto</th>
                      <th className="text-left py-2">API key ID</th>
                      <th className="text-left py-2">Item</th>
                      <th className="text-right py-2">Custo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {obs.costs.breakdown.length ? obs.costs.breakdown.map((item, index) => (
                      <tr key={`${item.projectId}:${item.apiKeyId}:${item.lineItem}:${index}`} className="border-b last:border-0">
                        <td className="py-2 pr-3 font-mono text-xs">{maskIdentifier(item.projectId)}</td>
                        <td className="py-2 pr-3 font-mono text-xs">{maskIdentifier(item.apiKeyId)}</td>
                        <td className="py-2 pr-3 text-xs">{item.lineItem || '—'}</td>
                        <td className="py-2 text-right">{usd.format(item.costUsd)}</td>
                      </tr>
                    )) : (
                      <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">Sem custos no período.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </div>

          <Card className="p-5 overflow-hidden">
            <div className="mb-4">
              <h2 className="font-heading font-semibold">Custo diário</h2>
              <p className="text-xs text-muted-foreground mt-1">
                Dados oficiais de custos da organização, agregados por dia.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-xs uppercase text-muted-foreground">
                    <th className="text-left py-2">Dia</th>
                    <th className="text-right py-2">Custo</th>
                  </tr>
                </thead>
                <tbody>
                  {[...obs.costs.daily].reverse().map((item) => (
                    <tr key={item.startTime} className="border-b last:border-0">
                      <td className="py-2">{new Date(item.startTime).toLocaleDateString('pt-BR')}</td>
                      <td className="py-2 text-right">{usd.format(item.costUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-xs text-muted-foreground">
            Atualizado em {new Date(obs.generatedAt).toLocaleString('pt-BR')}. Consultas são somente leitura e não
            compram créditos, não alteram billing e não modificam carteiras de tenants.
          </p>
        </>
      ) : null}
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}) {
  return (
    <Card className="p-4 flex items-start justify-between gap-3">
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="font-heading text-xl font-bold mt-1">{value}</div>
      </div>
      <div className="w-9 h-9 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4" />
      </div>
    </Card>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { BrainCircuit, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type JevConfiguration = {
  apiKeyConfigured: boolean;
  model: string;
  liveEnabled: boolean;
  tenantAllowlistConfigured: boolean;
  realDataProcessingApproved: boolean;
};

type JevReadinessPayload = {
  configuration: JevConfiguration;
  policy?: {
    probeUsesSyntheticDataOnly: boolean;
    readsCustomerData: boolean;
    enablesLiveProcessing: boolean;
  };
};

type JevProbe = {
  ok: true;
  model: string;
  latencyMs: number;
  inputTokens: number;
  outputTokens: number;
  decision: 'billing' | 'technical' | 'other';
  confidence: number;
};

const decisionLabels: Record<JevProbe['decision'], string> = {
  billing: 'Financeiro',
  technical: 'Técnico',
  other: 'Outro',
};

export function JevReadinessCard() {
  const [payload, setPayload] = useState<JevReadinessPayload | null>(null);
  const [probe, setProbe] = useState<JevProbe | null>(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/integrations/jev/readiness', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a configuração do JEV.');
      setPayload(data);
    } catch (loadError: any) {
      setPayload(null);
      setError(loadError.message || 'Não foi possível carregar a configuração do JEV.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function runSyntheticProbe() {
    setTesting(true);
    setError(null);
    setProbe(null);
    try {
      const response = await fetch('/api/admin/integrations/jev/readiness', {
        method: 'POST',
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.message || 'O teste fictício do JEV não foi confirmado.');
      setPayload({ configuration: data.configuration });
      setProbe(data.probe);
    } catch (probeError: any) {
      setError(probeError.message || 'O teste fictício do JEV não foi confirmado.');
    } finally {
      setTesting(false);
    }
  }

  const configuration = payload?.configuration;

  return <Card className="p-6 space-y-5 border-indigo-200">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-indigo-50">
          <BrainCircuit className="h-5 w-5 text-indigo-700" aria-hidden="true" />
        </div>
        <div>
          <p className="text-xs font-semibold text-indigo-700">TYPESAFE · JEV</p>
          <h2 className="font-heading text-xl font-semibold">Conexão segura do motor de decisão</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Verifica a configuração do servidor e executa somente um exemplo fixo e fictício. O teste não acessa leads, conversas, documentos, banco de dados ou Markdown de clientes.
          </p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading || testing}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
        Atualizar
      </Button>
    </div>

    {loading && <div className="rounded-md border p-4 text-sm text-muted-foreground">
      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Lendo apenas o estado das variáveis seguras do servidor...
    </div>}

    {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900" role="alert">{error}</div>}

    {configuration && <>
      <div className="flex flex-wrap gap-2">
        <Badge variant={configuration.apiKeyConfigured ? 'secondary' : 'destructive'}>
          {configuration.apiKeyConfigured ? 'Chave configurada no servidor' : 'Chave pendente'}
        </Badge>
        <Badge variant="outline">Modelo: {configuration.model}</Badge>
        <Badge variant={configuration.realDataProcessingApproved ? 'destructive' : 'secondary'}>
          {configuration.realDataProcessingApproved ? 'Dados reais autorizados' : 'Dados reais bloqueados'}
        </Badge>
        <Badge variant={configuration.liveEnabled ? 'outline' : 'secondary'}>
          {configuration.liveEnabled ? 'Feature flag habilitada' : 'Feature flag desligada'}
        </Badge>
        <Badge variant={configuration.tenantAllowlistConfigured ? 'outline' : 'secondary'}>
          {configuration.tenantAllowlistConfigured ? 'Allowlist configurada' : 'Nenhum tenant liberado'}
        </Badge>
      </div>

      <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 flex gap-2">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <span>A chave nunca é retornada ao navegador. Este botão envia à TypeSafe somente a frase fictícia embutida no servidor e não altera nenhuma trava de produção.</span>
      </div>

      <Button type="button" onClick={() => void runSyntheticProbe()} disabled={testing || !configuration.apiKeyConfigured}>
        {testing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BrainCircuit className="mr-2 h-4 w-4" />}
        {testing ? 'Testando com dados fictícios...' : 'Testar conexão com dados fictícios'}
      </Button>

      {probe && <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4" role="status">
        <p className="text-sm font-semibold text-indigo-950">Conexão confirmada</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div><p className="text-xs text-indigo-700">Modelo respondido</p><p className="text-sm font-medium text-indigo-950">{probe.model}</p></div>
          <div><p className="text-xs text-indigo-700">Latência</p><p className="text-sm font-medium text-indigo-950">{probe.latencyMs} ms</p></div>
          <div><p className="text-xs text-indigo-700">Tokens do teste</p><p className="text-sm font-medium text-indigo-950">{probe.inputTokens} entrada · {probe.outputTokens} saída</p></div>
          <div><p className="text-xs text-indigo-700">Decisão fictícia</p><p className="text-sm font-medium text-indigo-950">{decisionLabels[probe.decision]} · {Math.round(probe.confidence * 100)}%</p></div>
        </div>
      </div>}
    </>}
  </Card>;
}

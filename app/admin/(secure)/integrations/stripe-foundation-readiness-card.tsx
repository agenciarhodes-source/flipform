'use client';

import { useEffect, useState } from 'react';
import { CreditCard, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type StripeReadinessPayload = {
  readiness: {
    enabled: boolean;
    mode: 'test' | 'live';
    restrictedKeyConfigured: boolean;
    restrictedKeyKind: 'missing' | 'test' | 'live' | 'invalid';
    webhookSecretConfigured: boolean;
    webhookSecretLooksValid: boolean;
    environmentGuardActive: boolean;
    livePaymentsAllowed: boolean;
    readyForCheckout: boolean;
    readyForWebhookValidation: boolean;
    warnings: string[];
    errors: string[];
  };
  sdk: {
    sdk: string;
    version: string;
    serverOnly: boolean;
    maxNetworkRetries: number;
    timeoutMs: number;
    telemetry: boolean;
  };
  policy: {
    livePaymentsAllowed: boolean;
    checkoutCreationEnabled: boolean;
    webhookProcessingEnabled: boolean;
    commercialPaymentsEnabled: boolean;
  };
};

export function StripeFoundationReadinessCard() {
  const [payload, setPayload] = useState<StripeReadinessPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/integrations/stripe/readiness', {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível validar a Stripe.');
      setPayload(data);
    } catch (err: any) {
      setPayload(null);
      setError(err.message || 'Não foi possível validar a Stripe.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  const isLive = payload?.readiness.mode === 'live';
  const keyMatchesMode = Boolean(payload)
    && ((isLive && payload!.readiness.restrictedKeyKind === 'live')
      || (!isLive && payload!.readiness.restrictedKeyKind === 'test'));

  return (
    <Card className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex gap-3">
          <div className="w-10 h-10 rounded-md bg-violet-50 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5 text-violet-700" />
          </div>
          <div>
            <p className="text-xs font-semibold text-violet-700">STRIPE · PAGAMENTOS</p>
            <h2 className="font-heading text-xl font-semibold">Pagamentos da Carteira Flip AI</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Checkout hospedado e webhook assinado operam no ambiente Stripe configurado.
              O modo live só é habilitado quando a restricted key, o webhook e o hard gate comercial estão coerentes.
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
          Atualizar
        </Button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      )}

      {!error && payload && (
        <>
          <div className="flex flex-wrap gap-2">
            <Badge variant={payload.readiness.enabled ? 'secondary' : 'outline'}>
              {payload.readiness.enabled ? 'Integração habilitada' : 'Integração desabilitada'}
            </Badge>
            <Badge variant={isLive ? 'default' : 'secondary'}>
              {isLive ? 'Modo produção' : 'Modo teste'}
            </Badge>
            <Badge variant={keyMatchesMode ? 'secondary' : 'destructive'}>
              {keyMatchesMode
                ? `Restricted key ${isLive ? 'live' : 'de teste'}`
                : 'Restricted key incompatível'}
            </Badge>
            <Badge variant={payload.readiness.webhookSecretLooksValid ? 'secondary' : 'outline'}>
              {payload.readiness.webhookSecretLooksValid ? 'Webhook secret preparado' : 'Webhook secret pendente'}
            </Badge>
          </div>

          <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">SDK</div>
              <div className="font-medium mt-1">{payload.sdk.sdk} {payload.sdk.version}</div>
              <div className="text-xs text-muted-foreground mt-1">somente servidor</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Checkout</div>
              <div className="font-medium mt-1">{payload.policy.checkoutCreationEnabled ? 'Ativo' : 'Bloqueado'}</div>
              <div className="text-xs text-muted-foreground mt-1">Checkout hospedado no ambiente selecionado</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Webhook financeiro</div>
              <div className="font-medium mt-1">{payload.policy.webhookProcessingEnabled ? 'Ativo' : 'Bloqueado'}</div>
              <div className="text-xs text-muted-foreground mt-1">assinatura, pagamento e crédito idempotente</div>
            </div>
            <div className="rounded-md border p-3">
              <div className="text-xs text-muted-foreground">Uso comercial</div>
              <div className="font-medium mt-1">{payload.policy.commercialPaymentsEnabled ? 'Ativo' : 'Bloqueado'}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {isLive ? 'hard gate live verificado' : 'indisponível enquanto estiver em test mode'}
              </div>
            </div>
          </div>

          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 flex gap-2">
            <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
            <span>
              Nenhuma chave Stripe é retornada por este endpoint ou exibida nesta tela.
              As credenciais permanecem somente como secrets de servidor.
            </span>
          </div>

          {payload.readiness.errors.length > 0 && (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-900">
              {payload.readiness.errors.join(' ')}
            </div>
          )}

          {payload.readiness.warnings.length > 0 && (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              {payload.readiness.warnings.join(' ')}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

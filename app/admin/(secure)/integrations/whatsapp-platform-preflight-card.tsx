'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type PreflightCheck = {
  key: string;
  label: string;
  status: 'pass' | 'fail';
  detail: string;
};

type Preflight = {
  status: 'ready' | 'action_required';
  summary: string;
  checks: PreflightCheck[];
  generatedAt: string;
};

export function WhatsAppPlatformPreflightCard() {
  const [preflight, setPreflight] = useState<Preflight | null>(null);
  const [validating, setValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function validate() {
    setValidating(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/integrations/meta/whatsapp/preflight', {
        method: 'POST',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível validar o WhatsApp com a Meta.');
      setPreflight(payload.preflight || null);
    } catch (validationError: any) {
      setError(validationError.message || 'Não foi possível validar o WhatsApp com a Meta.');
    } finally {
      setValidating(false);
    }
  }

  return <Card className="p-6 space-y-4 border-emerald-200">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-emerald-700" aria-hidden="true" />
          <p className="text-xs font-semibold text-emerald-700">WHATSAPP UNIVERSAL</p>
        </div>
        <h2 className="font-heading text-xl font-semibold">Validar a caixa universal do FlipForm</h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Faz uma verificação somente leitura diretamente com a Meta. Nenhum cliente, WABA de cliente, lead, conversa, campanha ou integração de Ads é alterado.
        </p>
      </div>
      {preflight && <Badge variant={preflight.status === 'ready' ? 'secondary' : 'outline'}>
        {preflight.status === 'ready' ? 'Pronto para teste' : 'Ação necessária'}
      </Badge>}
    </div>

    <Button type="button" onClick={() => void validate()} disabled={validating}>
      {validating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
      {validating ? 'Validando com a Meta...' : 'Validar WhatsApp na Meta'}
    </Button>

    {error && <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</div>}

    {preflight && <div className="space-y-3">
      <div className={`rounded-md border p-3 text-sm ${preflight.status === 'ready' ? 'border-emerald-200 bg-emerald-50 text-emerald-900' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
        {preflight.summary}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {preflight.checks.map(item => <div key={item.key} className="flex gap-2 rounded-md border bg-slate-50 p-3">
          {item.status === 'pass'
            ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
            : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />}
          <div>
            <p className="text-xs font-medium">{item.label}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{item.detail}</p>
          </div>
        </div>)}
      </div>
      <p className="text-[11px] text-muted-foreground">Última validação: {new Date(preflight.generatedAt).toLocaleString('pt-BR')}</p>
    </div>}
  </Card>;
}

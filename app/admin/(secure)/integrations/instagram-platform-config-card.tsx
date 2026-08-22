'use client';

import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Copy, Loader2, RefreshCw, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Payload = {
  settings: {
    instagramAppId: string | null;
    instagramAppSecretConfigured: boolean;
    instagramAppSecretMasked: string | null;
    configured: boolean;
    updatedAt: string | null;
  };
  readiness: {
    ready: boolean;
    platformConfigured: boolean;
    webhookVerifyTokenConfigured: boolean;
    schemaReady: boolean;
    missingTables: string[];
  };
  endpoints: {
    oauthCallback: string;
    webhook: string;
  };
};

export function InstagramPlatformConfigCard() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [appId, setAppId] = useState('');
  const [appSecret, setAppSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch('/api/admin/integrations/instagram/platform', { cache: 'no-store' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar a configuração do Instagram.');
      setPayload(data);
      setAppId(data.settings?.instagramAppId || '');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível carregar a configuração do Instagram.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, string> = { instagramAppId: appId.trim() };
      if (appSecret.trim()) body.instagramAppSecret = appSecret.trim();
      const response = await fetch('/api/admin/integrations/instagram/platform', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar o Instagram.');
      setPayload(data);
      setAppId(data.settings?.instagramAppId || '');
      setAppSecret('');
      setMessage('Configuração universal do Instagram salva. Nenhuma conexão de cliente foi alterada.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Não foi possível salvar o Instagram.');
    } finally {
      setSaving(false);
    }
  }

  return <Card className="p-6 space-y-5">
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="text-xs font-semibold text-fuchsia-700">INSTAGRAM · CONFIGURAÇÃO UNIVERSAL</p>
        <h2 className="mt-1 font-heading text-xl font-semibold">Business Login da plataforma</h2>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Esta configuração é feita uma única vez pelo FlipForm. Cada cliente apenas autoriza a própria conta profissional quando quiser usar o módulo.
        </p>
      </div>
      {payload && <Badge variant={payload.readiness.ready ? 'secondary' : 'outline'}>
        {payload.readiness.ready ? 'Backend pronto' : 'Configuração pendente'}
      </Badge>}
    </div>

    {loading ? <div className="rounded-md border p-4 text-sm text-muted-foreground">
      <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />Carregando Instagram...
    </div> : payload && <>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="instagramPlatformAppId">Instagram App ID</Label>
          <Input id="instagramPlatformAppId" maxLength={128} value={appId} onChange={event => setAppId(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="instagramPlatformAppSecret">Instagram App Secret</Label>
          <Input
            id="instagramPlatformAppSecret"
            type="password"
            maxLength={512}
            autoComplete="new-password"
            value={appSecret}
            onChange={event => setAppSecret(event.target.value)}
            placeholder={payload.settings.instagramAppSecretConfigured ? payload.settings.instagramAppSecretMasked || 'Segredo salvo' : 'Informe o App Secret'}
          />
          <p className="text-xs text-muted-foreground">Deixe vazio para preservar o segredo já salvo.</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-md border bg-slate-50 p-3 text-xs">
          <p className="font-medium">Credenciais</p>
          <p className="mt-1 text-muted-foreground">{payload.readiness.platformConfigured ? 'App ID e segredo disponíveis.' : 'App ID ou segredo ainda pendente.'}</p>
        </div>
        <div className="rounded-md border bg-slate-50 p-3 text-xs">
          <p className="font-medium">Schema de mensageria</p>
          <p className="mt-1 text-muted-foreground">{payload.readiness.schemaReady ? 'Estruturas necessárias disponíveis.' : 'Estruturas de runtime pendentes.'}</p>
        </div>
        <div className="rounded-md border bg-slate-50 p-3 text-xs">
          <p className="font-medium">Verify Token</p>
          <p className="mt-1 text-muted-foreground">{payload.readiness.webhookVerifyTokenConfigured ? 'Configurado no backend.' : 'Ainda precisa ser configurado no ambiente.'}</p>
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <p className="text-sm font-medium">URLs para cadastrar na Meta</p>
        <div className="space-y-2">
          <div className="flex gap-2"><Input readOnly value={payload.endpoints.oauthCallback} /><Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(payload.endpoints.oauthCallback)}><Copy className="mr-2 h-4 w-4" />OAuth</Button></div>
          <div className="flex gap-2"><Input readOnly value={payload.endpoints.webhook} /><Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(payload.endpoints.webhook)}><Copy className="mr-2 h-4 w-4" />Webhook</Button></div>
        </div>
      </div>

      {payload.readiness.ready && <div className="flex items-start gap-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
        O backend interno está pronto para a validação externa na Meta. Isso ainda não conecta nenhum tenant automaticamente.
      </div>}

      {message && <p className="text-sm" role="status">{message}</p>}

      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Salvar somente Instagram
        </Button>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading || saving}>
          <RefreshCw className="mr-2 h-4 w-4" />Revalidar
        </Button>
      </div>
    </>}

    {!loading && !payload && message && <p className="text-sm text-red-700" role="alert">{message}</p>}
  </Card>;
}

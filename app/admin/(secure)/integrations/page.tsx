'use client';
import { useEffect, useState } from 'react';
import { Copy, Loader2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TenantMetaBindingManager } from './tenant-meta-binding-manager';

type Settings = {
  appId: string | null; appSecretConfigured: boolean; appSecretMasked: string | null; businessLoginConfigId: string | null; whatsappEmbeddedSignupConfigId: string | null; redirectUri: string; configured: boolean; baseConfigured: boolean; businessLoginConfigured: boolean; whatsappEmbeddedSignupConfigured: boolean;
  defaultPixelEnabled: boolean; defaultCapiEnabled: boolean; defaultAdvancedMatchingEnabled: boolean;
  defaultAttributionEnabled: boolean; defaultQualifiedLeadEnabled: boolean; defaultPurchaseEnabled: boolean;
  updatedAt: string | null; updatedBy: { name: string; email: string } | null;
};
const presetLabels: Array<[keyof Settings, string]> = [
  ['defaultPixelEnabled', 'Meta Pixel'], ['defaultCapiEnabled', 'Conversions API'],
  ['defaultAdvancedMatchingEnabled', 'Advanced Matching'], ['defaultAttributionEnabled', 'Attribution'],
  ['defaultQualifiedLeadEnabled', 'QualifiedLead'], ['defaultPurchaseEnabled', 'Purchase'],
];

export default function AdminIntegrationsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [appSecret, setAppSecret] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => { fetch('/api/admin/integrations/meta', { cache: 'no-store' }).then(async r => { const p = await r.json(); if (!r.ok) throw new Error(p.error); setSettings(p.settings); }).catch(e => setMessage(e.message)); }, []);
  async function save() {
    if (!settings) return;
    setBusy(true); setMessage(null);
    const body: Record<string, unknown> = {
      appId: settings.appId || '',
      businessLoginConfigId: settings.businessLoginConfigId || '',
      whatsappEmbeddedSignupConfigId: settings.whatsappEmbeddedSignupConfigId || '',
      ...Object.fromEntries(presetLabels.map(([key]) => [key, settings[key]])),
    };
    if (appSecret.trim()) body.appSecret = appSecret;
    try {
      const response = await fetch('/api/admin/integrations/meta', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.');
      setSettings(payload.settings); setAppSecret(''); setMessage('Configuração salva com segurança.');
    } catch (error: any) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <div className="p-8 space-y-6 max-w-5xl">
    <div><h1 className="font-heading text-2xl font-bold">Integrações da Plataforma</h1><p className="text-sm text-muted-foreground">Configure integrações universais utilizadas pelos clientes do FlipForm.</p></div>
    {!settings ? <Card className="p-6 text-sm"><Loader2 className="inline w-4 h-4 mr-2 animate-spin" />Carregando configuração...</Card> :
    <Card className="p-6 space-y-6">
      <div className="flex justify-between gap-4"><div><p className="text-xs font-semibold text-blue-600">META</p><h2 className="font-heading text-xl font-semibold">Configuração universal da plataforma</h2><p className="text-sm text-muted-foreground">Configure o aplicativo Meta utilizado pelo FlipForm para conexões de Ads, WhatsApp e, futuramente, Instagram.</p></div><div className="flex flex-wrap gap-2"><Badge variant={settings.baseConfigured ? 'secondary' : 'outline'}>{settings.baseConfigured ? 'Base Meta configurada' : 'Base Meta pendente'}</Badge><Badge variant={settings.businessLoginConfigured ? 'secondary' : 'outline'}>{settings.businessLoginConfigured ? 'Ads Login configurado' : 'Ads Login pendente'}</Badge><Badge variant={settings.whatsappEmbeddedSignupConfigured ? 'secondary' : 'outline'}>{settings.whatsappEmbeddedSignupConfigured ? 'WhatsApp Signup configurado' : 'WhatsApp Signup pendente'}</Badge></div></div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2"><Label htmlFor="appId">Meta App ID</Label><Input id="appId" maxLength={128} value={settings.appId || ''} onChange={e => setSettings({ ...settings, appId: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="appSecret">Meta App Secret</Label><Input id="appSecret" type="password" maxLength={512} autoComplete="new-password" value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder={settings.appSecretConfigured ? settings.appSecretMasked || 'Segredo salvo' : 'Informe o App Secret'} /><p className="text-xs text-muted-foreground">Deixe vazio para preservar o segredo atual.</p></div>
      </div>
      <div className="space-y-2"><Label htmlFor="businessLoginConfigId">Facebook Login for Business — Configuration ID de Ads</Label><Input id="businessLoginConfigId" maxLength={128} value={settings.businessLoginConfigId || ''} onChange={e => setSettings({ ...settings, businessLoginConfigId: e.target.value })} /><p className="text-xs text-muted-foreground">Configuração utilizada pelo fluxo de autorização de anúncios e Pixel/Dataset.</p></div>
      <div className="space-y-2"><Label htmlFor="whatsappEmbeddedSignupConfigId">WhatsApp Embedded Signup — Configuration ID</Label><Input id="whatsappEmbeddedSignupConfigId" maxLength={128} value={settings.whatsappEmbeddedSignupConfigId || ''} onChange={e => setSettings({ ...settings, whatsappEmbeddedSignupConfigId: e.target.value })} /><p className="text-xs text-muted-foreground">Configuration ID específico do Embedded Signup. Não reutilize a configuração de Ads se as permissões/flow forem diferentes.</p></div>
      <div className="space-y-2"><Label>Redirect URI de Ads (somente leitura)</Label><div className="flex gap-2"><Input readOnly value={settings.redirectUri} /><Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(settings.redirectUri)}><Copy className="w-4 h-4 mr-2" />Copiar</Button></div></div>
      <div><h3 className="font-medium mb-3">Configuração padrão para novos clientes</h3><div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">{presetLabels.map(([key, label]) => <label key={key} className="flex gap-2 items-center rounded border p-3 text-sm"><input type="checkbox" checked={Boolean(settings[key])} onChange={e => setSettings({ ...settings, [key]: e.target.checked })} />{label}</label>)}</div></div>
      <p className="text-sm rounded-md bg-blue-50 text-blue-800 p-3">O status indica apenas a configuração do FlipForm. O WhatsApp Embedded Signup depende também do produto WhatsApp configurado no Meta App, Webhooks e das permissões/App Review exigidas pela Meta.</p>
      {message && <p className="text-sm" role="status">{message}</p>}
      <Button onClick={save} disabled={busy}><Save className="w-4 h-4 mr-2" />{busy ? 'Salvando...' : 'Salvar configuração'}</Button>
    </Card>}

    <TenantMetaBindingManager />
  </div>;
}

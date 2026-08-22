'use client';
import { useEffect, useState } from 'react';
import { Copy, Loader2, Save } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MetaPlatformReadinessPanel } from './meta-platform-readiness-panel';
import { TenantMetaBindingManager } from './tenant-meta-binding-manager';

type Settings = {
  appId: string | null;
  appSecretConfigured: boolean;
  appSecretMasked: string | null;
  businessLoginConfigId: string | null;
  whatsappEmbeddedSignupConfigId: string | null;
  whatsappBusinessId: string | null;
  whatsappSystemUserId: string | null;
  whatsappAdminSystemUserAccessTokenConfigured: boolean;
  whatsappAdminSystemUserAccessTokenMasked: string | null;
  whatsappSystemUserAccessTokenConfigured: boolean;
  whatsappSystemUserAccessTokenMasked: string | null;
  redirectUri: string;
  configured: boolean;
  baseConfigured: boolean;
  businessLoginConfigured: boolean;
  whatsappEmbeddedSignupConfigured: boolean;
  defaultPixelEnabled: boolean;
  defaultCapiEnabled: boolean;
  defaultAdvancedMatchingEnabled: boolean;
  defaultAttributionEnabled: boolean;
  defaultQualifiedLeadEnabled: boolean;
  defaultPurchaseEnabled: boolean;
  updatedAt: string | null;
  updatedBy: { name: string; email: string } | null;
};
const presetLabels: Array<[keyof Settings, string]> = [
  ['defaultPixelEnabled', 'Meta Pixel'], ['defaultCapiEnabled', 'Conversions API'],
  ['defaultAdvancedMatchingEnabled', 'Advanced Matching'], ['defaultAttributionEnabled', 'Attribution'],
  ['defaultQualifiedLeadEnabled', 'QualifiedLead'], ['defaultPurchaseEnabled', 'Purchase'],
];

export default function AdminIntegrationsPage() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [appSecret, setAppSecret] = useState('');
  const [whatsappAdminSystemUserAccessToken, setWhatsappAdminSystemUserAccessToken] = useState('');
  const [whatsappSystemUserAccessToken, setWhatsappSystemUserAccessToken] = useState('');
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
      whatsappBusinessId: settings.whatsappBusinessId || '',
      whatsappSystemUserId: settings.whatsappSystemUserId || '',
      ...Object.fromEntries(presetLabels.map(([key]) => [key, settings[key]])),
    };
    if (appSecret.trim()) body.appSecret = appSecret;
    if (whatsappAdminSystemUserAccessToken.trim()) body.whatsappAdminSystemUserAccessToken = whatsappAdminSystemUserAccessToken;
    if (whatsappSystemUserAccessToken.trim()) body.whatsappSystemUserAccessToken = whatsappSystemUserAccessToken;
    try {
      const response = await fetch('/api/admin/integrations/meta', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.');
      setSettings(payload.settings);
      setAppSecret('');
      setWhatsappAdminSystemUserAccessToken('');
      setWhatsappSystemUserAccessToken('');
      setMessage('Configuração salva com segurança.');
    } catch (error: any) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <div className="p-8 space-y-6 max-w-5xl">
    <div><h1 className="font-heading text-2xl font-bold">Integrações da Plataforma</h1><p className="text-sm text-muted-foreground">Configure as integrações universais de Ads e WhatsApp utilizadas pelos clientes do FlipForm.</p></div>
    {!settings ? <Card className="p-6 text-sm"><Loader2 className="inline w-4 h-4 mr-2 animate-spin" />Carregando configuração...</Card> :
    <Card className="p-6 space-y-6">
      <div className="flex justify-between gap-4"><div><p className="text-xs font-semibold text-blue-600">META</p><h2 className="font-heading text-xl font-semibold">Ads e WhatsApp da plataforma</h2><p className="text-sm text-muted-foreground">As configurações abaixo preservam a integração Meta Ads existente e concentram o onboarding do WhatsApp Business.</p></div><div className="flex flex-wrap gap-2"><Badge variant={settings.baseConfigured ? 'secondary' : 'outline'}>{settings.baseConfigured ? 'Base Meta configurada' : 'Base Meta pendente'}</Badge><Badge variant={settings.businessLoginConfigured ? 'secondary' : 'outline'}>{settings.businessLoginConfigured ? 'Ads Login configurado' : 'Ads Login pendente'}</Badge><Badge variant={settings.whatsappEmbeddedSignupConfigured ? 'secondary' : 'outline'}>{settings.whatsappEmbeddedSignupConfigured ? 'WhatsApp Signup configurado' : 'WhatsApp Signup pendente'}</Badge></div></div>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2"><Label htmlFor="appId">Meta App ID — Ads/WhatsApp</Label><Input id="appId" maxLength={128} value={settings.appId || ''} onChange={e => setSettings({ ...settings, appId: e.target.value })} /></div>
        <div className="space-y-2"><Label htmlFor="appSecret">Meta App Secret — Ads/WhatsApp</Label><Input id="appSecret" type="password" maxLength={512} autoComplete="new-password" value={appSecret} onChange={e => setAppSecret(e.target.value)} placeholder={settings.appSecretConfigured ? settings.appSecretMasked || 'Segredo salvo' : 'Informe o App Secret'} /><p className="text-xs text-muted-foreground">Deixe vazio para preservar o segredo atual.</p></div>
      </div>
      <div className="space-y-2"><Label htmlFor="businessLoginConfigId">Facebook Login for Business — Configuration ID de Ads</Label><Input id="businessLoginConfigId" maxLength={128} value={settings.businessLoginConfigId || ''} onChange={e => setSettings({ ...settings, businessLoginConfigId: e.target.value })} /><p className="text-xs text-muted-foreground">Configuração utilizada pelo fluxo de autorização de anúncios e Pixel/Dataset.</p></div>

      <div className="border-t pt-5 space-y-4">
        <div><h3 className="font-medium">WhatsApp Embedded Signup</h3><p className="text-xs text-muted-foreground">Credenciais de plataforma usadas para atribuir o System User do FlipForm ao WABA do cliente. Os tokens ficam criptografados e nunca são enviados ao tenant.</p></div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label htmlFor="whatsappEmbeddedSignupConfigId">Embedded Signup — Configuration ID</Label><Input id="whatsappEmbeddedSignupConfigId" maxLength={128} value={settings.whatsappEmbeddedSignupConfigId || ''} onChange={e => setSettings({ ...settings, whatsappEmbeddedSignupConfigId: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="whatsappBusinessId">Business ID da plataforma</Label><Input id="whatsappBusinessId" maxLength={128} value={settings.whatsappBusinessId || ''} onChange={e => setSettings({ ...settings, whatsappBusinessId: e.target.value })} /></div>
          <div className="space-y-2"><Label htmlFor="whatsappSystemUserId">System User ID do FlipForm</Label><Input id="whatsappSystemUserId" maxLength={128} value={settings.whatsappSystemUserId || ''} onChange={e => setSettings({ ...settings, whatsappSystemUserId: e.target.value })} /></div>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-2"><Label htmlFor="whatsappAdminSystemUserAccessToken">Admin System User Access Token</Label><Input id="whatsappAdminSystemUserAccessToken" type="password" maxLength={8192} autoComplete="new-password" value={whatsappAdminSystemUserAccessToken} onChange={e => setWhatsappAdminSystemUserAccessToken(e.target.value)} placeholder={settings.whatsappAdminSystemUserAccessTokenConfigured ? settings.whatsappAdminSystemUserAccessTokenMasked || 'Token salvo' : 'Informe o token administrativo'} /><p className="text-xs text-muted-foreground">Usado somente no backend para atribuir o System User ao WABA. Deixe vazio para preservar o token salvo.</p></div>
          <div className="space-y-2"><Label htmlFor="whatsappSystemUserAccessToken">System User Access Token de runtime</Label><Input id="whatsappSystemUserAccessToken" type="password" maxLength={8192} autoComplete="new-password" value={whatsappSystemUserAccessToken} onChange={e => setWhatsappSystemUserAccessToken(e.target.value)} placeholder={settings.whatsappSystemUserAccessTokenConfigured ? settings.whatsappSystemUserAccessTokenMasked || 'Token salvo' : 'Informe o token de runtime'} /><p className="text-xs text-muted-foreground">Usado no backend para validar ativos, assinar o WABA e operar a Cloud API.</p></div>
        </div>
      </div>

      <div className="space-y-2"><Label>Redirect URI de Ads (somente leitura)</Label><div className="flex gap-2"><Input readOnly value={settings.redirectUri} /><Button type="button" variant="outline" onClick={() => navigator.clipboard.writeText(settings.redirectUri)}><Copy className="w-4 h-4 mr-2" />Copiar</Button></div></div>
      <div><h3 className="font-medium mb-3">Configuração padrão para novos clientes</h3><div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">{presetLabels.map(([key, label]) => <label key={key} className="flex gap-2 items-center rounded border p-3 text-sm"><input type="checkbox" checked={Boolean(settings[key])} onChange={e => setSettings({ ...settings, [key]: e.target.checked })} />{label}</label>)}</div></div>
      <p className="text-sm rounded-md bg-blue-50 text-blue-800 p-3">Os status indicam apenas a configuração do FlipForm. Cada produto Meta também depende das permissões, produtos e App Review exigidos pela Meta.</p>
      {message && <p className="text-sm" role="status">{message}</p>}
      <Button onClick={save} disabled={busy}><Save className="w-4 h-4 mr-2" />{busy ? 'Salvando...' : 'Salvar Ads/WhatsApp e padrões'}</Button>
    </Card>}

    <MetaPlatformReadinessPanel />
    <TenantMetaBindingManager />
  </div>;
}

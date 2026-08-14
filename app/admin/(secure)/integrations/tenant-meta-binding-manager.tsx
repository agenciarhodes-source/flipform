'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';


type TenantOption = { id: string; name: string; slug: string };
type AssetOption = { id: string; name: string; accountId?: string };
type Connection = {
  status: string;
  metaUserName?: string | null;
  connectedAt?: string | null;
  tokenExpiresAt?: string | null;
  assetSelection?: {
    adAccountId: string;
    adAccountName?: string | null;
    pixelId: string;
    pixelName?: string | null;
    selectedAt?: string | null;
  } | null;
} | null;

export function TenantMetaBindingManager() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [connection, setConnection] = useState<Connection>(null);
  const [adAccounts, setAdAccounts] = useState<AssetOption[]>([]);
  const [pixels, setPixels] = useState<AssetOption[]>([]);
  const [adAccountId, setAdAccountId] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [loadingConnection, setLoadingConnection] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [saving, setSaving] = useState(false);

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: 'no-store', ...init });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha na operação Meta.');
    return data;
  }

  useEffect(() => {
    request('/api/admin/tenants')
      .then(data => setTenants((data.tenants || []).map((tenant: any) => ({ id: tenant.id, name: tenant.name, slug: tenant.slug }))))
      .catch(error => toast.error(error.message || 'Não foi possível carregar os tenants.'));
  }, []);

  async function loadConnection(nextTenantId: string) {
    setTenantId(nextTenantId);
    setConnection(null);
    setAdAccounts([]);
    setPixels([]);
    setAdAccountId('');
    setPixelId('');
    if (!nextTenantId) return;
    setLoadingConnection(true);
    try {
      const data = await request(`/api/admin/integrations/meta/tenant-assets?tenantId=${encodeURIComponent(nextTenantId)}&resource=connection`);
      setConnection(data.connection || null);
      if (data.connection?.assetSelection) {
        setAdAccountId(data.connection.assetSelection.adAccountId || '');
        setPixelId(data.connection.assetSelection.pixelId || '');
      }
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível carregar a conexão Meta do tenant.');
    } finally {
      setLoadingConnection(false);
    }
  }

  async function loadAccounts() {
    if (!tenantId) return;
    setLoadingAccounts(true);
    setAdAccounts([]);
    setPixels([]);
    try {
      const data = await request(`/api/admin/integrations/meta/tenant-assets?tenantId=${encodeURIComponent(tenantId)}&resource=ad_accounts`);
      const items: AssetOption[] = data.adAccounts || [];
      setAdAccounts(items);
      const savedId = connection?.assetSelection?.adAccountId || '';
      if (savedId && items.some(item => item.id === savedId)) setAdAccountId(savedId);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível consultar as contas de anúncios.');
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function loadPixels(nextAdAccountId: string) {
    setAdAccountId(nextAdAccountId);
    setPixelId('');
    setPixels([]);
    if (!tenantId || !nextAdAccountId) return;
    setLoadingPixels(true);
    try {
      const data = await request(`/api/admin/integrations/meta/tenant-assets?tenantId=${encodeURIComponent(tenantId)}&resource=pixels&adAccountId=${encodeURIComponent(nextAdAccountId)}`);
      const items: AssetOption[] = data.pixels || [];
      setPixels(items);
      const savedId = connection?.assetSelection?.adAccountId === nextAdAccountId ? connection.assetSelection.pixelId : '';
      if (savedId && items.some(item => item.id === savedId)) setPixelId(savedId);
      else if (items.length === 1) setPixelId(items[0].id);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível consultar os Pixels / Datasets.');
    } finally {
      setLoadingPixels(false);
    }
  }

  async function saveBinding() {
    if (!tenantId || !adAccountId || !pixelId) {
      toast.error('Selecione tenant, conta de anúncios e Pixel / Dataset.');
      return;
    }
    setSaving(true);
    try {
      const data = await request('/api/admin/integrations/meta/tenant-assets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenantId, adAccountId, pixelId }),
      });
      toast.success('Ativos Meta vinculados ao tenant com sucesso.');
      setConnection((current) => current ? { ...current, assetSelection: data.selection } : current);
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível vincular os ativos Meta.');
    } finally {
      setSaving(false);
    }
  }

  return <Card className="p-6 space-y-5">
    <div>
      <p className="text-xs font-semibold text-blue-600">SEGREGAÇÃO POR TENANT</p>
      <h2 className="font-heading text-xl font-semibold">Vinculação segura de ativos Meta</h2>
      <p className="text-sm text-muted-foreground">A descoberta ampla de contas fica somente no Admin. O tenant usa exclusivamente a conta de anúncios e o Pixel vinculados aqui.</p>
    </div>

    <div className="space-y-2">
      <label className="text-sm font-medium" htmlFor="meta-tenant">Tenant</label>
      <select id="meta-tenant" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={tenantId} onChange={event => loadConnection(event.target.value)}>
        <option value="">Selecione um tenant</option>
        {tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.slug}</option>)}
      </select>
    </div>

    {loadingConnection && <p className="text-sm text-muted-foreground">Carregando conexão Meta...</p>}

    {tenantId && !loadingConnection && !connection && <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Este tenant ainda não possui uma autorização Meta ativa. A autorização precisa existir antes da vinculação de ativos.</div>}

    {connection && <>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Identidade autorizadora</p><p className="text-sm font-medium">{connection.metaUserName || 'Conta Meta autorizada'}</p></div>
        <div className="rounded-md border bg-slate-50 p-3"><p className="text-xs text-muted-foreground">Vínculo atual</p><p className="text-sm font-medium">{connection.assetSelection ? `${connection.assetSelection.adAccountName || connection.assetSelection.adAccountId} · ${connection.assetSelection.pixelName || connection.assetSelection.pixelId}` : 'Nenhum ativo vinculado'}</p></div>
      </div>

      <div><Button type="button" variant="outline" onClick={loadAccounts} disabled={loadingAccounts}>{loadingAccounts ? 'Consultando contas...' : 'Carregar contas acessíveis — somente Admin'}</Button></div>

      {adAccounts.length > 0 && <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="meta-ad-account">Conta de anúncios do tenant</label>
        <select id="meta-ad-account" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={adAccountId} onChange={event => loadPixels(event.target.value)}>
          <option value="">Selecione a conta correta deste tenant</option>
          {adAccounts.map(item => <option key={item.id} value={item.id}>{item.name} · {item.accountId || item.id}</option>)}
        </select>
      </div>}

      {adAccountId && <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="meta-pixel">Pixel / Dataset do tenant</label>
        <select id="meta-pixel" className="w-full rounded-md border bg-background px-3 py-2 text-sm" value={pixelId} disabled={loadingPixels} onChange={event => setPixelId(event.target.value)}>
          <option value="">{loadingPixels ? 'Consultando Pixels...' : 'Selecione o Pixel / Dataset correto'}</option>
          {pixels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </div>}

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">A conta selecionada será revalidada no backend contra a autorização Meta deste tenant antes de ser salva. O token nunca é enviado ao navegador.</div>

      <Button type="button" onClick={saveBinding} disabled={saving || !adAccountId || !pixelId}>{saving ? 'Validando e vinculando...' : 'Vincular ativos ao tenant'}</Button>
    </>}
  </Card>;
}

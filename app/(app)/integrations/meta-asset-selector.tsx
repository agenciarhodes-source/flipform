'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';

type MetaConnection = {
  status?: string | null;
  assetSelection?: {
    businessId?: string | null;
    businessName?: string | null;
    adAccountId?: string | null;
    adAccountName?: string | null;
    pixelId?: string | null;
    pixelName?: string | null;
    selectedAt?: string | null;
  } | null;
};

type Option = { id: string; name: string; accountId?: string };

export function MetaAssetSelector({ connection, onSaved }: { connection: MetaConnection; onSaved: () => Promise<void> | void }) {
  const [businesses, setBusinesses] = useState<Option[]>([]);
  const [adAccounts, setAdAccounts] = useState<Option[]>([]);
  const [pixels, setPixels] = useState<Option[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [adAccountId, setAdAccountId] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [saving, setSaving] = useState(false);

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: 'no-store', ...init });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao consultar a Meta.');
    return data;
  }

  async function loadAccounts(nextBusinessId: string, preferredAccountId = '') {
    if (!nextBusinessId) {
      setAdAccounts([]);
      setPixels([]);
      return;
    }
    setLoadingAccounts(true);
    try {
      const data = await request(`/api/integrations/meta/assets?resource=ad_accounts&businessId=${encodeURIComponent(nextBusinessId)}`);
      const items: Option[] = data.adAccounts || [];
      setAdAccounts(items);
      const accountToUse = preferredAccountId && items.some(item => item.id === preferredAccountId)
        ? preferredAccountId
        : items.length === 1 ? items[0].id : '';
      setAdAccountId(accountToUse);
      if (accountToUse) await loadPixels(nextBusinessId, accountToUse, connection.assetSelection?.pixelId || '');
      else {
        setPixelId('');
        setPixels([]);
      }
    } finally {
      setLoadingAccounts(false);
    }
  }

  async function loadPixels(nextBusinessId: string, nextAdAccountId: string, preferredPixelId = '') {
    if (!nextBusinessId || !nextAdAccountId) {
      setPixels([]);
      return;
    }
    setLoadingPixels(true);
    try {
      const data = await request(`/api/integrations/meta/assets?resource=pixels&businessId=${encodeURIComponent(nextBusinessId)}&adAccountId=${encodeURIComponent(nextAdAccountId)}`);
      const items: Option[] = data.pixels || [];
      setPixels(items);
      const pixelToUse = preferredPixelId && items.some(item => item.id === preferredPixelId)
        ? preferredPixelId
        : items.length === 1 ? items[0].id : '';
      setPixelId(pixelToUse);
    } finally {
      setLoadingPixels(false);
    }
  }

  useEffect(() => {
    if (connection.status !== 'authorized') return;
    let active = true;
    setLoading(true);
    (async () => {
      try {
        const data = await request('/api/integrations/meta/assets?resource=businesses');
        if (!active) return;
        const items: Option[] = data.businesses || [];
        setBusinesses(items);
        const savedBusinessId = connection.assetSelection?.businessId || '';
        const nextBusinessId = savedBusinessId && items.some(item => item.id === savedBusinessId)
          ? savedBusinessId
          : items.length === 1 ? items[0].id : '';
        setBusinessId(nextBusinessId);
        if (nextBusinessId) await loadAccounts(nextBusinessId, connection.assetSelection?.adAccountId || '');
      } catch (error: any) {
        if (active) toast.error(error.message || 'Não foi possível carregar os ativos da Meta.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.status, connection.assetSelection?.businessId, connection.assetSelection?.adAccountId, connection.assetSelection?.pixelId]);

  if (connection.status !== 'authorized') return null;

  async function saveSelection() {
    if (!businessId || !adAccountId || !pixelId) {
      toast.error('Selecione empresa, conta de anúncios e Pixel / Dataset.');
      return;
    }
    setSaving(true);
    try {
      await request('/api/integrations/meta/assets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId, adAccountId, pixelId }),
      });
      toast.success('Ativos Meta validados e salvos.');
      await onSaved();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível salvar os ativos Meta.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="rounded-lg border p-4 space-y-3">
    <div className="flex items-start justify-between gap-3">
      <div>
        <h3 className="text-sm font-semibold">Ativos da conexão</h3>
        <p className="text-xs text-muted-foreground">Escolha a empresa, conta de anúncios e Pixel / Dataset que o FlipForm usará nesta conexão.</p>
      </div>
      {connection.assetSelection?.pixelId && <span className="rounded-full border bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Selecionado</span>}
    </div>

    <label className="block space-y-1 text-sm">
      <span>Empresa</span>
      <select
        className="w-full border rounded p-2 bg-white disabled:opacity-60"
        value={businessId}
        disabled={loading}
        onChange={async event => {
          const next = event.target.value;
          setBusinessId(next);
          setAdAccountId('');
          setPixelId('');
          setPixels([]);
          try { await loadAccounts(next); } catch (error: any) { toast.error(error.message || 'Falha ao carregar contas de anúncios.'); }
        }}
      >
        <option value="">{loading ? 'Carregando empresas...' : 'Selecione uma empresa'}</option>
        {businesses.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>

    <label className="block space-y-1 text-sm">
      <span>Conta de anúncios</span>
      <select
        className="w-full border rounded p-2 bg-white disabled:opacity-60"
        value={adAccountId}
        disabled={!businessId || loadingAccounts}
        onChange={async event => {
          const next = event.target.value;
          setAdAccountId(next);
          setPixelId('');
          try { await loadPixels(businessId, next); } catch (error: any) { toast.error(error.message || 'Falha ao carregar Pixels / Datasets.'); }
        }}
      >
        <option value="">{loadingAccounts ? 'Carregando contas...' : 'Selecione uma conta de anúncios'}</option>
        {adAccounts.map(item => <option key={item.id} value={item.id}>{item.name} · {item.accountId || item.id}</option>)}
      </select>
    </label>

    <label className="block space-y-1 text-sm">
      <span>Pixel / Dataset</span>
      <select className="w-full border rounded p-2 bg-white disabled:opacity-60" value={pixelId} disabled={!adAccountId || loadingPixels} onChange={event => setPixelId(event.target.value)}>
        <option value="">{loadingPixels ? 'Carregando Pixels / Datasets...' : 'Selecione um Pixel / Dataset'}</option>
        {pixels.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>

    {connection.assetSelection?.businessName && <p className="text-xs text-muted-foreground">Atual: {connection.assetSelection.businessName} · {connection.assetSelection.adAccountName || connection.assetSelection.adAccountId} · {connection.assetSelection.pixelName || connection.assetSelection.pixelId}</p>}

    <button type="button" className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-60" disabled={saving || loading || !businessId || !adAccountId || !pixelId} onClick={saveSelection}>
      {saving ? 'Validando e salvando...' : connection.assetSelection?.pixelId ? 'Atualizar ativos' : 'Salvar ativos Meta'}
    </button>
  </div>;
}

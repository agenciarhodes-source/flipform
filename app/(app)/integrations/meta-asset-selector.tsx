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
  const [adAccounts, setAdAccounts] = useState<Option[]>([]);
  const [pixels, setPixels] = useState<Option[]>([]);
  const [adAccountId, setAdAccountId] = useState('');
  const [pixelId, setPixelId] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [saving, setSaving] = useState(false);

  async function request(url: string, init?: RequestInit) {
    const response = await fetch(url, { cache: 'no-store', ...init });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Falha ao consultar a Meta.');
    return data;
  }

  async function loadPixels(nextAdAccountId: string, preferredPixelId = '') {
    if (!nextAdAccountId) {
      setPixels([]);
      setPixelId('');
      return;
    }
    setLoadingPixels(true);
    try {
      const data = await request(`/api/integrations/meta/assets?resource=pixels&adAccountId=${encodeURIComponent(nextAdAccountId)}`);
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
        const data = await request('/api/integrations/meta/assets?resource=ad_accounts');
        if (!active) return;
        const items: Option[] = data.adAccounts || [];
        setAdAccounts(items);
        const savedAdAccountId = connection.assetSelection?.adAccountId || '';
        const nextAdAccountId = savedAdAccountId && items.some(item => item.id === savedAdAccountId)
          ? savedAdAccountId
          : items.length === 1 ? items[0].id : '';
        setAdAccountId(nextAdAccountId);
        if (nextAdAccountId) await loadPixels(nextAdAccountId, connection.assetSelection?.pixelId || '');
      } catch (error: any) {
        if (active) toast.error(error.message || 'Não foi possível carregar os ativos da Meta.');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connection.status, connection.assetSelection?.adAccountId, connection.assetSelection?.pixelId]);

  if (connection.status !== 'authorized') return null;

  async function saveSelection() {
    if (!adAccountId || !pixelId) {
      toast.error('Selecione a conta de anúncios e o Pixel / Dataset.');
      return;
    }
    setSaving(true);
    try {
      await request('/api/integrations/meta/assets', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adAccountId, pixelId }),
      });
      toast.success('Conta de anúncios e Pixel validados e salvos.');
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
        <p className="text-xs text-muted-foreground">Escolha apenas a conta de anúncios e o Pixel / Dataset deste cliente. O FlipForm cuida da estrutura empresarial da Meta nos bastidores.</p>
      </div>
      {connection.assetSelection?.pixelId && <span className="rounded-full border bg-emerald-50 px-2 py-1 text-xs text-emerald-700">Selecionado</span>}
    </div>

    <label className="block space-y-1 text-sm">
      <span>Conta de anúncios</span>
      <select
        className="w-full border rounded p-2 bg-white disabled:opacity-60"
        value={adAccountId}
        disabled={loading}
        onChange={async event => {
          const next = event.target.value;
          setAdAccountId(next);
          setPixelId('');
          try { await loadPixels(next); } catch (error: any) { toast.error(error.message || 'Falha ao carregar Pixels / Datasets.'); }
        }}
      >
        <option value="">{loading ? 'Carregando contas...' : 'Selecione uma conta de anúncios'}</option>
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

    {connection.assetSelection?.adAccountId && <p className="text-xs text-muted-foreground">Atual: {connection.assetSelection.adAccountName || connection.assetSelection.adAccountId} · {connection.assetSelection.pixelName || connection.assetSelection.pixelId}</p>}

    {adAccounts.length === 0 && !loading && <p className="text-xs text-amber-700">Nenhuma conta de anúncios foi encontrada para a conta Meta conectada. Use “Trocar conta Meta” acima e autorize uma identidade que tenha acesso aos anúncios deste cliente.</p>}

    <button type="button" className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-60" disabled={saving || loading || !adAccountId || !pixelId} onClick={saveSelection}>
      {saving ? 'Validando e salvando...' : connection.assetSelection?.pixelId ? 'Atualizar ativos' : 'Salvar ativos Meta'}
    </button>
  </div>;
}

'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type TenantOption = { id: string; name: string; slug: string };
type BindingResult = {
  tenant: TenantOption;
  connection: {
    id: string;
    status: string;
    wabaName?: string | null;
    displayPhoneNumber?: string | null;
    verifiedName?: string | null;
    qualityRating?: string | null;
    connectedAt?: string | null;
  };
  nextStep?: string;
};

export function WhatsAppMetaTestBindingCard() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BindingResult | null>(null);

  useEffect(() => {
    fetch('/api/admin/tenants', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os tenants.');
        return data;
      })
      .then(data => setTenants((data.tenants || []).map((tenant: any) => ({ id: tenant.id, name: tenant.name, slug: tenant.slug }))))
      .catch(error => toast.error(error.message || 'Não foi possível carregar os tenants.'));
  }, []);

  async function bindTestNumber() {
    if (!tenantId || !/^\d+$/.test(wabaId) || !/^\d+$/.test(phoneNumberId) || !confirmed) {
      toast.error('Selecione o tenant, informe WABA/Phone Number ID válidos e confirme que são ativos oficiais de teste da Meta.');
      return;
    }

    setBusy(true);
    setResult(null);
    try {
      const response = await fetch('/api/admin/integrations/whatsapp/test-binding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          wabaId: wabaId.trim(),
          phoneNumberId: phoneNumberId.trim(),
          confirmTestAsset: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível vincular o número de teste.');
      setResult(data);
      toast.success('Número oficial de teste da Meta vinculado ao tenant.');
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível vincular o número de teste.');
    } finally {
      setBusy(false);
    }
  }

  return <Card className="p-6 space-y-5 border-emerald-200">
    <div>
      <p className="text-xs font-semibold text-emerald-700">WHATSAPP · TESTE MÍNIMO</p>
      <h2 className="font-heading text-xl font-semibold">Vincular o número oficial de teste da Meta</h2>
      <p className="text-sm text-muted-foreground">
        Ferramenta exclusiva do Super Admin para provar o fluxo Meta → Webhook → Inbox antes do App Review final. Nenhum token é solicitado ou enviado ao navegador.
      </p>
    </div>

    <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
      Use somente o WABA e o Phone Number ID exibidos pela Meta em <strong>WhatsApp → Etapa 1. Experimente</strong>. Não use WABA de cliente real neste teste.
    </div>

    <div className="space-y-2">
      <Label htmlFor="whatsapp-test-tenant">Tenant de teste</Label>
      <select
        id="whatsapp-test-tenant"
        className="w-full rounded-md border bg-background px-3 py-2 text-sm"
        value={tenantId}
        onChange={event => { setTenantId(event.target.value); setResult(null); }}
      >
        <option value="">Selecione um tenant controlado</option>
        {tenants.map(tenant => <option key={tenant.id} value={tenant.id}>{tenant.name} · {tenant.slug}</option>)}
      </select>
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <div className="space-y-2">
        <Label htmlFor="whatsapp-test-waba">WABA ID de teste</Label>
        <Input id="whatsapp-test-waba" inputMode="numeric" value={wabaId} onChange={event => setWabaId(event.target.value.replace(/\D/g, ''))} placeholder="Ex.: 123456789012345" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="whatsapp-test-phone">Phone Number ID de teste</Label>
        <Input id="whatsapp-test-phone" inputMode="numeric" value={phoneNumberId} onChange={event => setPhoneNumberId(event.target.value.replace(/\D/g, ''))} placeholder="Ex.: 123456789012345" />
      </div>
    </div>

    <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
      <input type="checkbox" className="mt-1" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
      <span>Confirmo que estes IDs pertencem ao número oficial de teste fornecido pela Meta para o app FlipForm e não a um cliente real.</span>
    </label>

    <Button type="button" onClick={bindTestNumber} disabled={busy || !tenantId || !wabaId || !phoneNumberId || !confirmed}>
      {busy ? 'Validando com a Meta...' : 'Vincular teste e assinar webhook'}
    </Button>

    {result && <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
      <p className="font-medium">Vínculo de teste concluído.</p>
      <div className="grid gap-2 md:grid-cols-2">
        <div><span className="text-emerald-700">Tenant:</span> {result.tenant.name}</div>
        <div><span className="text-emerald-700">Status:</span> {result.connection.status}</div>
        <div><span className="text-emerald-700">Número:</span> {result.connection.displayPhoneNumber || 'Validado pela Meta'}</div>
        <div><span className="text-emerald-700">Nome:</span> {result.connection.verifiedName || result.connection.wabaName || 'WhatsApp de teste'}</div>
      </div>
      <p>{result.nextStep || 'Abra o Inbox do tenant e valide a chegada de uma mensagem real.'}</p>
      <a className="inline-flex rounded border border-emerald-300 bg-white px-3 py-2 font-medium" href="/inbox">Abrir Inbox</a>
    </div>}
  </Card>;
}

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
type ConversationResult = {
  tenant: TenantOption;
  conversation: { id: string; displayName?: string | null; phone?: string | null };
  inboxUrl: string;
  note?: string;
};

export function WhatsAppMetaTestBindingCard() {
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState('');
  const [wabaId, setWabaId] = useState('');
  const [phoneNumberId, setPhoneNumberId] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<BindingResult | null>(null);
  const [recipientPhone, setRecipientPhone] = useState('');
  const [recipientName, setRecipientName] = useState('Meta Review Test');
  const [recipientConfirmed, setRecipientConfirmed] = useState(false);
  const [preparingConversation, setPreparingConversation] = useState(false);
  const [conversationResult, setConversationResult] = useState<ConversationResult | null>(null);

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
    setConversationResult(null);
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

  async function prepareReviewConversation() {
    const phone = recipientPhone.replace(/\D/g, '');
    if (!tenantId || phone.length < 8 || !recipientConfirmed) {
      toast.error('Selecione o tenant, informe o destinatário autorizado na Meta e confirme que é somente para o teste do App Review.');
      return;
    }

    setPreparingConversation(true);
    setConversationResult(null);
    try {
      const response = await fetch('/api/admin/integrations/whatsapp/test-conversation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId,
          recipientPhone: phone,
          displayName: recipientName.trim() || 'Meta Review Test',
          confirmTestRecipient: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível preparar a conversa de teste.');
      setConversationResult(data);
      toast.success('Conversa de teste preparada no Inbox sem simular mensagem recebida.');
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível preparar a conversa de teste.');
    } finally {
      setPreparingConversation(false);
    }
  }

  return <Card className="p-6 space-y-5 border-emerald-200">
    <div>
      <p className="text-xs font-semibold text-emerald-700">WHATSAPP · TESTE MÍNIMO</p>
      <h2 className="font-heading text-xl font-semibold">Vincular o número oficial de teste da Meta</h2>
      <p className="text-sm text-muted-foreground">
        Ferramenta exclusiva do Super Admin para validar o número oficial de teste e preparar o screencast do App Review. Nenhum token é solicitado ou enviado ao navegador.
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
        onChange={event => {
          setTenantId(event.target.value);
          setResult(null);
          setConversationResult(null);
        }}
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
    </div>}

    <div className="border-t pt-5 space-y-4">
      <div>
        <p className="text-xs font-semibold text-blue-700">APP REVIEW · MENSAGEM REAL</p>
        <h3 className="font-heading text-lg font-semibold">Preparar conversa para o screencast</h3>
        <p className="text-sm text-muted-foreground">
          Cria somente um contato e uma conversa vazia no tenant de teste. Nenhuma mensagem recebida é simulada. Depois, entre no tenant e envie pelo Inbox uma mensagem real ao destinatário autorizado na Meta.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="whatsapp-review-recipient">WhatsApp destinatário autorizado</Label>
          <Input
            id="whatsapp-review-recipient"
            inputMode="tel"
            value={recipientPhone}
            onChange={event => setRecipientPhone(event.target.value)}
            placeholder="DDI + DDD + número"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="whatsapp-review-name">Nome exibido no Inbox</Label>
          <Input
            id="whatsapp-review-name"
            value={recipientName}
            onChange={event => setRecipientName(event.target.value)}
            maxLength={80}
          />
        </div>
      </div>

      <label className="flex items-start gap-2 rounded-md border p-3 text-sm">
        <input type="checkbox" className="mt-1" checked={recipientConfirmed} onChange={event => setRecipientConfirmed(event.target.checked)} />
        <span>Confirmo que este destinatário é um número meu/autorizado para o teste do App Review e que não é um contato de cliente real.</span>
      </label>

      <Button
        type="button"
        variant="outline"
        onClick={prepareReviewConversation}
        disabled={preparingConversation || !tenantId || recipientPhone.replace(/\D/g, '').length < 8 || !recipientConfirmed}
      >
        {preparingConversation ? 'Preparando conversa...' : 'Preparar conversa no Inbox'}
      </Button>

      {conversationResult && <div className="rounded-md border border-blue-200 bg-blue-50 p-4 text-sm text-blue-950 space-y-2">
        <p className="font-medium">Conversa preparada para o screencast.</p>
        <p>{conversationResult.note}</p>
        <p><strong>Tenant:</strong> {conversationResult.tenant.name}</p>
        <p><strong>Conversa:</strong> {conversationResult.conversation.displayName || 'Meta Review Test'}</p>
        <p className="text-xs">Entre como owner deste tenant e abra: <code>{conversationResult.inboxUrl}</code></p>
      </div>}
    </div>
  </Card>;
}

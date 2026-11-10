'use client';

import { useEffect, useState } from 'react';
import { FileSignature } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';

/** Super Admin: releases contracts by ZapSign for one company (the company then sets token and models). */
export function ZapSignRelease({ tenantId }: { tenantId: string }) {
  const [state, setState] = useState<{ ready: boolean; allowed: boolean; enabled: boolean; hasToken: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const response = await fetch(`/api/admin/tenants/${tenantId}/zapsign`, { cache: 'no-store' }).catch(() => null);
    setState(response?.ok ? await response.json() : null);
  };
  useEffect(() => { void load(); }, [tenantId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return null;

  async function change(allowed: boolean) {
    setSaving(true);
    try {
      const response = await fetch(`/api/admin/tenants/${tenantId}/zapsign`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ allowed }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Não foi possível salvar.');
      toast.success(allowed ? 'Contratos liberados para esta empresa.' : 'Contratos bloqueados para esta empresa.');
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-4 mb-4 flex items-center justify-between gap-3">
      <div>
        <div className="font-medium flex items-center gap-2"><FileSignature className="w-4 h-4" />Contratos (ZapSign)</div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {!state.ready ? 'As tabelas de contratos ainda não existem no banco.'
            : state.allowed
              ? `Liberado. A empresa ${state.enabled ? 'ligou' : 'ainda não ligou'} o envio${state.hasToken ? '' : ' e ainda não colou o token'}.`
              : 'Bloqueado. Libere para a empresa configurar o token e os modelos em Atendimento WhatsApp.'}
        </p>
      </div>
      <Switch checked={state.allowed} disabled={saving || !state.ready} onCheckedChange={(value) => void change(value)} aria-label="Liberar contratos" />
    </Card>
  );
}

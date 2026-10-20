'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

type Settings = {
  progressEnabled: boolean; progressIntervalDays: number; progressTemplate: string | null;
  reviewEnabled: boolean; reviewAfterDays: number; reviewTemplate: string | null;
};
type Template = { name: string; language: string; preview?: string; body?: string };

/** After-sale messages to closed clients: progress updates and the Google review request. */
export function PostSaleManager() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState({ sent30d: 0, optOuts: 0 });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/whatsapp-ai/post-sale', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data) return;
      setSettings(data.settings);
      setStats({ sent30d: data.sent30d || 0, optOuts: data.optOuts || 0 });
    }).catch(() => undefined);
    fetch('/api/inbox/whatsapp-templates', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((data) => setTemplates(Array.isArray(data?.templates) ? data.templates : [])).catch(() => undefined);
  }, []);
  if (!settings) return null;
  const update = (patch: Partial<Settings>) => setSettings((current) => (current ? { ...current, ...patch } : current));

  async function save() {
    setSaving(true);
    try {
      const response = await fetch('/api/whatsapp-ai/post-sale', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      toast.success('Pós-venda salvo.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  const templateSelect = (value: string | null, onChange: (value: string | null) => void) => (
    <select className="w-full rounded border bg-white p-2 text-sm" value={value || ''} onChange={(event) => onChange(event.target.value || null)}>
      <option value="">Escolha um modelo aprovado</option>
      {templates.map((template) => (
        <option key={`${template.name}:${template.language}`} value={`${template.name}:${template.language}`}>
          {template.name} ({template.language})
        </option>
      ))}
    </select>
  );

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Pós-venda</h2>
        <p className="text-sm text-muted-foreground">
          Mensagens automáticas para clientes fechados (leads ganhos), com modelos aprovados: atualização do andamento e pedido de avaliação no Google.
          Só de segunda a sábado, das 9h às 19h, no máximo uma por pessoa por semana. Quem responder SAIR não recebe mais.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">Últimos 30 dias: {stats.sent30d} enviadas · {stats.optOuts} contatos pediram para não receber.</p>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={settings.progressEnabled} onCheckedChange={(checked) => update({ progressEnabled: checked })} aria-label="Aviso de andamento" />
          Aviso de andamento
        </label>
        <label className="flex items-center gap-2 text-sm">
          A cada
          <input type="number" min={7} max={365} className="w-20 rounded border p-1.5" value={settings.progressIntervalDays}
            onChange={(event) => update({ progressIntervalDays: Math.max(7, Math.min(365, Number(event.target.value) || 30)) })} />
          dias
        </label>
        {templateSelect(settings.progressTemplate, (value) => update({ progressTemplate: value }))}
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={settings.reviewEnabled} onCheckedChange={(checked) => update({ reviewEnabled: checked })} aria-label="Pedido de avaliação no Google" />
          Pedido de avaliação no Google (uma vez)
        </label>
        <label className="flex items-center gap-2 text-sm">
          Enviar
          <input type="number" min={1} max={365} className="w-20 rounded border p-1.5" value={settings.reviewAfterDays}
            onChange={(event) => update({ reviewAfterDays: Math.max(1, Math.min(365, Number(event.target.value) || 15)) })} />
          dias depois do fechamento
        </label>
        {templateSelect(settings.reviewTemplate, (value) => update({ reviewTemplate: value }))}
        <p className="text-xs text-muted-foreground">O link do Google vai escrito no próprio modelo, ao criá-lo na Meta.</p>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar pós-venda'}</Button>
      </div>
    </section>
  );
}

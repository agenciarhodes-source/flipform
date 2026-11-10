'use client';

import { useEffect, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { FOLLOWUP_MAX_STEPS, FOLLOWUP_TEMPLATE_SUGGESTIONS } from '@/lib/whatsapp-ai/followup-rules';

type Step = { days: number; template: string };
type Settings = { enabled: boolean; steps: Step[]; callAfterStep: number };
type Template = { name: string; language: string; category?: string | null };

/**
 * "Sequência de retomada": approved templates on the chosen days after the customer stopped
 * answering, and a call task after the chosen message.
 */
export function FollowupManager() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState({ sent30d: 0, answered30d: 0 });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/whatsapp-ai/followups', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data?.ready) return;
      setSettings(data.settings);
      setStats({ sent30d: data.sent30d || 0, answered30d: data.answered30d || 0 });
    }).catch(() => undefined);
    fetch('/api/inbox/whatsapp-templates', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((data) => setTemplates(Array.isArray(data?.templates) ? data.templates : [])).catch(() => undefined);
  }, []);
  if (!settings) return null;

  const update = (patch: Partial<Settings>) => setSettings((current) => (current ? { ...current, ...patch } : current));
  const setStep = (index: number, patch: Partial<Step>) => update({ steps: settings.steps.map((step, i) => (i === index ? { ...step, ...patch } : step)) });
  const marketing = settings.steps.some((step) => templates.find((t) => `${t.name}:${t.language}` === step.template)?.category === 'MARKETING');

  async function save() {
    setSaving(true);
    try {
      const payload = { ...settings, steps: settings!.steps.filter((step) => step.template) };
      const response = await fetch('/api/whatsapp-ai/followups', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      toast.success('Sequência de retomada salva.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Sequência de retomada</h2>
        <p className="text-sm text-muted-foreground">
          Quando o cliente para de responder e passam as 24 horas do WhatsApp, o sistema envia os modelos aprovados abaixo nos dias
          escolhidos (contados da última mensagem do cliente), um de cada vez. Se ele responder, a IA continua o atendimento e a sequência
          para. Não vai para quem pediu para não receber mensagens, leads ganhos ou perdidos, "Não qualificado", "Já é cliente",
          conversas resolvidas ou assumidas pela equipe.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Últimos 30 dias: {stats.sent30d} enviados · {stats.answered30d} clientes responderam depois.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={settings.enabled} onCheckedChange={(checked) => update({ enabled: checked })} aria-label="Ligar a sequência de retomada" />
          Ligar a sequência de retomada
        </label>

        {settings.steps.map((step, index) => (
          <div key={index} className="flex flex-wrap items-center gap-2 text-sm">
            <span className="w-20 font-medium">{index + 1}º envio</span>
            <input type="number" min={1} max={90} className="w-16 rounded border p-1.5" value={step.days} aria-label={`Dias do ${index + 1}º envio`}
              onChange={(event) => setStep(index, { days: Math.max(1, Math.min(90, Number(event.target.value) || 1)) })} />
            <span>dias depois · modelo</span>
            <select className="min-w-0 flex-1 rounded border bg-white p-1.5" value={step.template}
              onChange={(event) => setStep(index, { template: event.target.value })} aria-label={`Modelo do ${index + 1}º envio`}>
              <option value="">Escolha um modelo aprovado</option>
              {templates.map((template) => (
                <option key={`${template.name}:${template.language}`} value={`${template.name}:${template.language}`}>
                  {template.name} ({template.language}){template.category === 'MARKETING' ? ' · marketing' : template.category === 'UTILITY' ? ' · utilidade' : ''}
                </option>
              ))}
            </select>
            <Button type="button" variant="ghost" size="icon" aria-label="Tirar este envio"
              onClick={() => update({ steps: settings.steps.filter((_, i) => i !== index), callAfterStep: Math.min(settings.callAfterStep, settings.steps.length - 1) })}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
        {settings.steps.length < FOLLOWUP_MAX_STEPS ? (
          <Button type="button" variant="outline" size="sm" onClick={() => update({
            steps: [...settings.steps, { days: (settings.steps[settings.steps.length - 1]?.days || 0) + 7, template: '' }],
          })}>
            <Plus className="mr-1 h-4 w-4" />Adicionar envio
          </Button>
        ) : null}

        <label className="flex flex-wrap items-center gap-2 text-sm">
          Criar tarefa de <strong>ligação</strong> para o responsável do lead depois do
          <select className="rounded border bg-white p-1.5" value={settings.callAfterStep}
            onChange={(event) => update({ callAfterStep: Number(event.target.value) })}>
            <option value={0}>não criar</option>
            {settings.steps.map((_, index) => <option key={index} value={index + 1}>{index + 1}º envio</option>)}
          </select>
          sem resposta
        </label>

        {marketing ? (
          <p className="text-xs text-amber-700">Algum modelo escolhido é de marketing, que custa mais por envio. A Meta cobra cada modelo enviado.</p>
        ) : <p className="text-xs text-muted-foreground">A Meta cobra cada modelo enviado.</p>}
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">Sugestões de texto para os modelos ({'{{1}}'} primeiro nome, {'{{3}}'} nome da empresa)</summary>
          <ul className="mt-2 list-disc space-y-1 pl-5">
            {FOLLOWUP_TEMPLATE_SUGGESTIONS.map((text) => <li key={text}>{text}</li>)}
          </ul>
        </details>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar retomada'}</Button>
      </div>
    </section>
  );
}

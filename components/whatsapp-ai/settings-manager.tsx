'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

type ScheduleMode = 'always' | 'outside_hours' | 'no_reply';
type Settings = {
  enabled: boolean;
  agentId: string | null;
  scheduleMode: ScheduleMode;
  businessHours: { days: number[]; start: string; end: string };
  noReplyMinutes: number;
  dailyCreditLimit: number | null;
  updatedAt: string | null;
};
type NumberRow = { connectionId: string; phone: string | null; name: string | null; settings: Settings };
type Workspace = { agents: Array<{ id: string; name: string }>; numbers: NumberRow[] };

const DAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MODES: Array<{ value: ScheduleMode; label: string; hint: string }> = [
  { value: 'always', label: 'Sempre (24h)', hint: 'A IA responde a qualquer hora.' },
  { value: 'outside_hours', label: 'Só fora do expediente', hint: 'No horário de expediente, a equipe atende.' },
  { value: 'no_reply', label: 'Quando ninguém responder', hint: 'A IA entra se a equipe não responder no tempo definido.' },
];

/** One card per connected number: whether the Flip AI answers there, with which agent and when. */
export function WhatsAppAiSettingsManager({ initialWorkspace }: { initialWorkspace: Workspace }) {
  const [workspace, setWorkspace] = useState(initialWorkspace);

  return (
    <section className="mx-auto max-w-4xl space-y-5 p-4 md:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold"><MessageCircle className="h-6 w-6 text-brand-600" aria-hidden="true" /> Atendimento WhatsApp</h1>
        <p className="text-sm text-muted-foreground">
          Defina, para cada número conectado, se o Flip AI faz o primeiro atendimento no WhatsApp, com qual agente e em que horário.
        </p>
      </header>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        As configurações já ficam salvas, mas a IA começará a responder no WhatsApp quando o atendimento automático for liberado. Até lá, nada muda no atendimento.
      </div>

      {workspace.numbers.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
          Nenhum número de WhatsApp conectado. Conecte o WhatsApp em Integrações.
        </div>
      ) : workspace.numbers.map((row) => (
        <NumberCard key={row.connectionId} row={row} agents={workspace.agents} onSaved={setWorkspace} />
      ))}
    </section>
  );
}

function NumberCard({ row, agents, onSaved }: { row: NumberRow; agents: Workspace['agents']; onSaved: (next: Workspace) => void }) {
  const [form, setForm] = useState<Settings>(row.settings);
  const [limitText, setLimitText] = useState(row.settings.dailyCreditLimit ? String(row.settings.dailyCreditLimit) : '');
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<Settings>) => setForm((current) => ({ ...current, ...patch }));

  async function save() {
    const limit = limitText.trim() ? Number(limitText.trim()) : null;
    if (limit !== null && (!Number.isInteger(limit) || limit < 1)) {
      toast.error('O limite diário deve ser um número inteiro de créditos, ou fique vazio para sem limite.');
      return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/whatsapp-ai/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          connectionId: row.connectionId,
          enabled: form.enabled,
          agentId: form.agentId,
          scheduleMode: form.scheduleMode,
          businessHours: form.businessHours,
          noReplyMinutes: form.noReplyMinutes,
          dailyCreditLimit: limit,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      onSaved(data);
      toast.success('Configuração do atendimento salva.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  const toggleDay = (day: number) => update({
    businessHours: {
      ...form.businessHours,
      days: form.businessHours.days.includes(day)
        ? form.businessHours.days.filter((item) => item !== day)
        : [...form.businessHours.days, day].sort(),
    },
  });

  return (
    <article className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold">{row.name || 'WhatsApp'}</h2>
          <p className="text-sm text-muted-foreground">{row.phone || 'Número conectado'}</p>
        </div>
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={form.enabled} onCheckedChange={(checked) => update({ enabled: checked })} aria-label="IA atende neste número" />
          {form.enabled ? 'IA ligada' : 'IA desligada'}
        </label>
      </div>

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Agente que atende</span>
        <select className="w-full rounded border bg-white p-2 text-sm" value={form.agentId || ''}
          onChange={(event) => update({ agentId: event.target.value || null })}>
          <option value="">Escolha um agente publicado</option>
          {agents.map((agent) => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
        </select>
        {agents.length === 0 && <span className="block text-xs text-amber-800">Nenhum agente publicado. Publique um agente no Flip AI primeiro.</span>}
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Quando a IA atua</legend>
        {MODES.map((mode) => (
          <label key={mode.value} className="flex items-start gap-2 text-sm">
            <input type="radio" name={`mode-${row.connectionId}`} className="mt-1" checked={form.scheduleMode === mode.value}
              onChange={() => update({ scheduleMode: mode.value })} />
            <span><span className="font-medium">{mode.label}</span> <span className="text-muted-foreground">— {mode.hint}</span></span>
          </label>
        ))}
      </fieldset>

      {form.scheduleMode === 'outside_hours' && (
        <div className="space-y-2 rounded-lg border bg-slate-50 p-3">
          <p className="text-sm font-medium">Horário de expediente (horário de Brasília)</p>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((label, day) => (
              <button key={label} type="button" onClick={() => toggleDay(day)}
                className={`rounded border px-2.5 py-1 text-xs ${form.businessHours.days.includes(day) ? 'border-brand-600 bg-brand-600 text-white' : 'bg-white'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="time" className="rounded border p-1.5" value={form.businessHours.start}
              onChange={(event) => update({ businessHours: { ...form.businessHours, start: event.target.value } })} />
            <span>até</span>
            <input type="time" className="rounded border p-1.5" value={form.businessHours.end}
              onChange={(event) => update({ businessHours: { ...form.businessHours, end: event.target.value } })} />
          </div>
        </div>
      )}

      {form.scheduleMode === 'no_reply' && (
        <label className="flex items-center gap-2 text-sm">
          A IA entra se ninguém responder em
          <input type="number" min={1} max={1440} className="w-20 rounded border p-1.5" value={form.noReplyMinutes}
            onChange={(event) => update({ noReplyMinutes: Math.max(1, Math.min(1440, Number(event.target.value) || 1)) })} />
          minutos
        </label>
      )}

      <label className="block space-y-1.5">
        <span className="text-sm font-medium">Limite de gasto por dia (créditos de IA)</span>
        <input type="number" min={1} className="w-48 rounded border p-2 text-sm" placeholder="Sem limite" value={limitText}
          onChange={(event) => setLimitText(event.target.value)} />
        <span className="block text-xs text-muted-foreground">Ao atingir o limite, a IA para até o dia seguinte e o atendimento volta para a equipe.</span>
      </label>

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {row.settings.updatedAt ? `Última alteração: ${new Date(row.settings.updatedAt).toLocaleString('pt-BR')}` : 'Ainda não configurado'}
        </span>
        <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar'}</Button>
      </div>
    </article>
  );
}

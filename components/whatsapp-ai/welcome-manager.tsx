'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';

type Settings = { enabled: boolean; template: string | null; delaySeconds: number };

/** 90 -> "1 min 30 s". */
function waitLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return [minutes ? `${minutes} min` : '', rest ? `${rest} s` : ''].filter(Boolean).join(' ');
}
type Template = { name: string; language: string; category?: string | null };

/** Welcome template on WhatsApp for people who sent a form and did not write. */
export function WelcomeManager() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [stats, setStats] = useState({ sent30d: 0, customerWrote30d: 0 });
  const [templates, setTemplates] = useState<Template[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/whatsapp-ai/welcome', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data) return;
      setSettings(data.settings);
      setStats({ sent30d: data.sent30d || 0, customerWrote30d: data.customerWrote30d || 0 });
    }).catch(() => undefined);
    fetch('/api/inbox/whatsapp-templates', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null))
      .then((data) => setTemplates(Array.isArray(data?.templates) ? data.templates : [])).catch(() => undefined);
  }, []);
  if (!settings) return null;
  const update = (patch: Partial<Settings>) => setSettings((current) => (current ? { ...current, ...patch } : current));
  const chosen = templates.find((template) => `${template.name}:${template.language}` === settings.template);

  async function save() {
    setSaving(true);
    try {
      const response = await fetch('/api/whatsapp-ai/welcome', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      toast.success('Boas-vindas salvas.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Boas-vindas no WhatsApp para novos cadastros</h2>
        <p className="text-sm text-muted-foreground">
          Quem enviar um formulário, autorizar o contato pelo WhatsApp e não escrever para a empresa recebe um modelo aprovado,
          uma única vez. Se a pessoa já tiver escrito, a IA responde normalmente e o modelo não é enviado.
          Quando ela responder ao modelo, a IA continua o atendimento. Vale só para cadastros que chegarem depois de ligar.
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Últimos 30 dias: {stats.sent30d} enviadas · {stats.customerWrote30d} pessoas escreveram antes e não precisaram do modelo.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border p-3">
        <label className="flex items-center gap-2 text-sm font-medium">
          <Switch checked={settings.enabled} onCheckedChange={(checked) => update({ enabled: checked })} aria-label="Enviar boas-vindas" />
          Enviar boas-vindas aos novos cadastros
        </label>
        <label className="flex flex-wrap items-center gap-2 text-sm">
          Esperar
          <input type="number" min={30} max={3600} step={30} className="w-24 rounded border p-1.5" value={settings.delaySeconds}
            onChange={(event) => update({ delaySeconds: Math.max(30, Math.min(3600, Number(event.target.value) || 90)) })} />
          segundos ({waitLabel(settings.delaySeconds)}) pela mensagem da pessoa antes de enviar
        </label>
        <p className="text-xs text-muted-foreground">
          O sistema confere a cada minuto, então o modelo sai entre {waitLabel(settings.delaySeconds)} e {waitLabel(settings.delaySeconds + 60)} depois do cadastro.
        </p>
        <select className="w-full rounded border bg-white p-2 text-sm" value={settings.template || ''}
          onChange={(event) => update({ template: event.target.value || null })}>
          <option value="">Escolha um modelo aprovado</option>
          {templates.map((template) => (
            <option key={`${template.name}:${template.language}`} value={`${template.name}:${template.language}`}>
              {template.name} ({template.language}){template.category ? ` · ${template.category === 'UTILITY' ? 'utilidade' : template.category === 'MARKETING' ? 'marketing' : template.category}` : ''}
            </option>
          ))}
        </select>
        {chosen?.category === 'MARKETING' ? (
          <p className="text-xs text-amber-700">
            Este modelo é de marketing e custa cerca de 9 vezes mais por envio. Um modelo de utilidade (que confirma o cadastro, com o nome e a data) sai bem mais barato.
          </p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          A Meta cobra cada modelo enviado. As variáveis são preenchidas sozinhas: {'{{1}}'} primeiro nome, {'{{2}}'} data do cadastro, {'{{3}}'} nome da empresa.
        </p>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={() => void save()} disabled={saving}>{saving ? 'Salvando...' : 'Salvar boas-vindas'}</Button>
      </div>
    </section>
  );
}

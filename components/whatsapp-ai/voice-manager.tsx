'use client';

import { useEffect, useRef, useState } from 'react';
import { Play } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

type Settings = { mode: 'off' | 'test' | 'on_request' | 'auto'; provider: 'elevenlabs' | 'openai'; voiceId: string };

const MODES: Array<{ value: Settings['mode']; label: string; help: string }> = [
  { value: 'off', label: 'Desligado', help: 'A IA responde sempre por texto.' },
  { value: 'test', label: 'Só números de teste', help: 'Todas as respostas viram áudio, mas só para os números de teste. Bom para ouvir antes de ligar.' },
  { value: 'on_request', label: 'Quando o cliente pedir', help: 'Áudio para quem pedir para ser atendido por áudio ou disser que não consegue ler.' },
  { value: 'auto', label: 'Automático', help: 'Quando o cliente pedir, e também nas explicações longas.' },
];

const OPENAI_VOICES = ['marin', 'cedar', 'coral', 'nova', 'shimmer', 'sage', 'alloy', 'ash', 'ballad', 'echo', 'fable', 'onyx', 'verse'];

/**
 * "Respostas em áudio": the WhatsApp attendant answers with a voice note (ElevenLabs or OpenAI).
 * Long texts, links and numbers always go as text, and a voice that fails becomes text.
 */
export function VoiceManager() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [elevenLabsReady, setElevenLabsReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioUrl = useRef<string | null>(null);

  useEffect(() => {
    fetch('/api/whatsapp-ai/voice', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((data) => {
      if (!data?.ready) return;
      setSettings(data.settings);
      setElevenLabsReady(Boolean(data.elevenLabsReady));
    }).catch(() => undefined);
    return () => { if (audioUrl.current) URL.revokeObjectURL(audioUrl.current); };
  }, []);
  if (!settings) return null;

  const update = (patch: Partial<Settings>) => setSettings({ ...settings, ...patch });

  async function sample() {
    setPlaying(true);
    try {
      const response = await fetch('/api/whatsapp-ai/voice/sample', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: settings!.provider, voiceId: settings!.voiceId }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Não foi possível gerar a amostra.');
      }
      if (audioUrl.current) URL.revokeObjectURL(audioUrl.current);
      audioUrl.current = URL.createObjectURL(await response.blob());
      await new Audio(audioUrl.current).play();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível gerar a amostra.');
    } finally {
      setPlaying(false);
    }
  }

  async function save() {
    setSaving(true);
    try {
      const response = await fetch('/api/whatsapp-ai/voice', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível salvar.');
      toast.success('Respostas em áudio salvas.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Não foi possível salvar.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-4 rounded-xl border bg-white p-5 shadow-sm">
      <div>
        <h2 className="text-lg font-semibold">Respostas em áudio</h2>
        <p className="text-sm text-muted-foreground">
          A IA responde com um áudio de voz em vez de texto. Textos longos, links e números vão sempre por texto, e se o
          áudio falhar a resposta vai por texto. No Inbox, a equipe vê o que foi falado.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Quando responder em áudio</p>
        {MODES.map((mode) => (
          <label key={mode.value} className="flex items-start gap-2 text-sm">
            <input type="radio" name="voice-mode" className="mt-1" checked={settings.mode === mode.value} onChange={() => update({ mode: mode.value })} />
            <span><span className="font-medium">{mode.label}</span> <span className="text-muted-foreground">— {mode.help}</span></span>
          </label>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm">
          <span className="font-medium">Voz de</span>
          <select
            className="w-full rounded-lg border px-3 py-2"
            value={settings.provider}
            onChange={(event) => update({ provider: event.target.value as Settings['provider'], voiceId: event.target.value === 'openai' ? 'marin' : '' })}
          >
            <option value="elevenlabs">ElevenLabs</option>
            <option value="openai">OpenAI</option>
          </select>
        </label>
        {settings.provider === 'elevenlabs' ? (
          <label className="space-y-1 text-sm">
            <span className="font-medium">ID da voz (ElevenLabs)</span>
            <input
              className="w-full rounded-lg border px-3 py-2 font-mono text-xs"
              placeholder="Ex.: 21m00Tcm4TlvDq8ikWAM"
              value={settings.voiceId}
              onChange={(event) => update({ voiceId: event.target.value.trim() })}
            />
          </label>
        ) : (
          <label className="space-y-1 text-sm">
            <span className="font-medium">Voz (OpenAI)</span>
            <select className="w-full rounded-lg border px-3 py-2" value={settings.voiceId || 'marin'} onChange={(event) => update({ voiceId: event.target.value })}>
              {OPENAI_VOICES.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
            </select>
          </label>
        )}
      </div>
      {settings.provider === 'elevenlabs' && !elevenLabsReady && (
        <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
          A chave da ElevenLabs ainda não está configurada no servidor (variável ELEVENLABS_API_KEY na Vercel).
        </p>
      )}
      {settings.provider === 'elevenlabs' && (
        <p className="text-xs text-muted-foreground">
          Na ElevenLabs, abra a voz na biblioteca, clique nos três pontinhos e em “Copy voice ID”. A voz precisa estar em “My Voices”.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={playing} onClick={sample}>
          <Play className="mr-1 h-4 w-4" /> {playing ? 'Gerando…' : 'Ouvir amostra'}
        </Button>
        <Button size="sm" disabled={saving} onClick={save}>{saving ? 'Salvando…' : 'Salvar'}</Button>
      </div>
    </section>
  );
}

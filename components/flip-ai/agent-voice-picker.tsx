'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Volume2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Lets the company choose, by ear, the voice an attendant uses in audio replies. */
export function AgentVoicePicker({ agentId }: { agentId: string }) {
  const [voices, setVoices] = useState<string[]>([]);
  const [saved, setSaved] = useState<string | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState<'sample' | 'save' | 'mode' | null>(null);
  const [audioMode, setAudioMode] = useState('on_request');
  const playerRef = useRef<HTMLAudioElement | null>(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/flip-ai/agents/${agentId}/voice`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Erro');
      setVoices(Array.isArray(payload.voices) ? payload.voices : []);
      setSaved(payload.voice);
      setSelected(payload.voice);
      if (typeof payload.audioMode === 'string') setAudioMode(payload.audioMode);
    } catch {
      // The picker is optional: without it the attendant keeps the default voice.
      setVoices([]);
    }
  }, [agentId]);

  useEffect(() => { void load(); }, [load]);

  const listen = async () => {
    if (!selected || busy) return;
    setBusy('sample');
    try {
      const response = await fetch('/api/flip-ai/voices/sample', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: selected }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(payload.error || 'Não foi possível gerar a amostra agora.');
      }
      playerRef.current?.pause();
      const player = new Audio(URL.createObjectURL(await response.blob()));
      playerRef.current = player;
      await player.play();
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível gerar a amostra agora.');
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!selected || selected === saved || busy) return;
    setBusy('save');
    try {
      const response = await fetch(`/api/flip-ai/agents/${agentId}/voice`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ voice: selected }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar a voz.');
      setSaved(payload.voice);
      toast.success('Voz do atendente salva.');
    } catch (error: any) {
      toast.error(error.message || 'Não foi possível salvar a voz.');
    } finally {
      setBusy(null);
    }
  };

  const changeMode = async (next: string) => {
    if (busy || next === audioMode) return;
    const previous = audioMode;
    setAudioMode(next);
    setBusy('mode');
    try {
      const response = await fetch(`/api/flip-ai/agents/${agentId}/voice`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ audioMode: next }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar.');
      toast.success('Uso de áudio atualizado.');
    } catch (error: any) {
      setAudioMode(previous);
      toast.error(error.message || 'Não foi possível salvar.');
    } finally {
      setBusy(null);
    }
  };

  if (!voices.length) return null;
  return (
    <div className="mt-4 rounded-md border p-3">
      <p className="text-xs font-medium">Respostas em áudio</p>
      <select
        aria-label="Quando responder em áudio"
        className="mt-2 h-9 w-full rounded-md border bg-background px-2 text-sm"
        value={audioMode}
        disabled={busy !== null}
        onChange={(event) => void changeMode(event.target.value)}
      >
        <option value="on_request">Só quando a pessoa pedir ou não souber ler (recomendado)</option>
        <option value="auto">Automático: também nas explicações longas</option>
        <option value="never">Nunca responder em áudio</option>
      </select>
      <p className="mt-1 text-xs text-muted-foreground">
        Áudio consome bem mais créditos que texto. Escolha quanto este atendente pode usar.
      </p>
      <p className="mt-3 text-xs font-medium">Voz nas respostas em áudio</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Usada quando o atendente explica algo em áudio. Ouça as opções e escolha a que combina com a sua empresa.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <select
          aria-label="Voz do atendente"
          className="h-9 rounded-md border bg-background px-2 text-sm capitalize"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          {voices.map((voice) => <option key={voice} value={voice}>{voice}</option>)}
        </select>
        <Button type="button" variant="outline" size="sm" disabled={busy !== null} onClick={() => void listen()}>
          <Volume2 className="mr-2 h-4 w-4" aria-hidden="true" />{busy === 'sample' ? 'Gerando...' : 'Ouvir'}
        </Button>
        <Button type="button" size="sm" disabled={busy !== null || selected === saved} onClick={() => void save()}>
          {busy === 'save' ? 'Salvando...' : 'Salvar voz'}
        </Button>
      </div>
    </div>
  );
}

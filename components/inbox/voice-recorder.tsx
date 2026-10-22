'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Send, Square, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const MAX_SECONDS = 180;

/** The best format this browser can record that WhatsApp (after the server step) accepts. */
function pickMimeType() {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/webm', 'audio/mp4']) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/** Records a voice note (up to 3 minutes), lets the person listen, then sends or discards it. */
export function VoiceRecorder({ disabled, onSend }: { disabled?: boolean; onSend: (audio: Blob) => Promise<boolean> }) {
  const [state, setState] = useState<'idle' | 'recording' | 'preview' | 'sending'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const cancelledRef = useRef(false);

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (timerRef.current) window.clearInterval(timerRef.current);
    timerRef.current = null;
  };
  useEffect(() => () => { stopTracks(); if (preview) URL.revokeObjectURL(preview.url); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function start() {
    setError(null);
    const mimeType = pickMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setError('Este navegador não grava áudio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      chunksRef.current = [];
      cancelledRef.current = false;
      recorder.ondataavailable = (event) => { if (event.data.size) chunksRef.current.push(event.data); };
      recorder.onstop = () => {
        stopTracks();
        if (cancelledRef.current) { setState('idle'); return; }
        const blob = new Blob(chunksRef.current, { type: mimeType.split(';')[0] });
        setPreview({ blob, url: URL.createObjectURL(blob) });
        setState('preview');
      };
      recorder.start();
      setSeconds(0);
      setState('recording');
      timerRef.current = window.setInterval(() => {
        setSeconds((current) => {
          if (current + 1 >= MAX_SECONDS) recorderRef.current?.stop();
          return current + 1;
        });
      }, 1_000);
    } catch (failure) {
      stopTracks();
      const name = failure instanceof DOMException ? failure.name : '';
      setError(name === 'NotFoundError' || name === 'OverconstrainedError'
        ? 'Nenhum microfone encontrado. Conecte um microfone e tente de novo.'
        : name === 'NotReadableError' || name === 'AbortError'
          ? 'O microfone está em uso por outro programa (chamada, gravador). Feche-o e tente de novo.'
          : 'Permita o uso do microfone no navegador para gravar (cadeado ao lado do endereço › Microfone).');
    }
  }

  function stop(cancel = false) {
    cancelledRef.current = cancel;
    recorderRef.current?.stop();
  }

  function discard() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
    setState('idle');
  }

  async function send() {
    if (!preview) return;
    setState('sending');
    const ok = await onSend(preview.blob);
    if (ok) discard();
    else setState('preview');
  }

  if (state === 'recording') {
    return (
      <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2">
        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
        <span className="text-sm tabular-nums text-red-700">{clock(seconds)} / {clock(MAX_SECONDS)}</span>
        <Button type="button" size="sm" variant="outline" onClick={() => stop(true)} aria-label="Cancelar gravação"><Trash2 className="h-4 w-4" /></Button>
        <Button type="button" size="sm" onClick={() => stop(false)} aria-label="Parar gravação"><Square className="mr-1 h-4 w-4" />Parar</Button>
      </div>
    );
  }
  if ((state === 'preview' || state === 'sending') && preview) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-2 py-1">
        <audio controls src={preview.url} className="h-9 w-56 max-w-full" />
        <Button type="button" size="sm" variant="outline" onClick={discard} disabled={state === 'sending'} aria-label="Descartar áudio"><Trash2 className="h-4 w-4" /></Button>
        <Button type="button" size="sm" onClick={() => void send()} disabled={state === 'sending'} aria-label="Enviar áudio">
          <Send className="mr-1 h-4 w-4" />{state === 'sending' ? 'Enviando...' : 'Enviar'}
        </Button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end">
      <Button type="button" size="icon" variant="outline" className="h-11 w-11 shrink-0" onClick={() => void start()} disabled={disabled} aria-label="Gravar áudio">
        <Mic className="h-4 w-4" />
      </Button>
      {error && <p className="mt-1 max-w-[12rem] text-right text-xs text-red-600">{error}</p>}
    </div>
  );
}

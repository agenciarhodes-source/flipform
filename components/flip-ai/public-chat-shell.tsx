'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, LoaderCircle, Mic, RotateCcw, Send, Square } from 'lucide-react';
import type { PublicFlipAiAgent } from '@/lib/flip-ai/public-agent';
import { FlipAiRealtimeVoiceClient, type FlipAiVoiceState } from '@/lib/flip-ai/realtime-client';
import { buildPublicAttribution, ensureMetaFbcCookie } from '@/lib/attribution';
import { fireMetaLeadPixel } from '@/lib/tracking/meta-pixel-client';
import { firePublicGtmLeadEvent } from '@/lib/tracking/gtm-client';

type ChatSource = { title: string; url: string; domain: string; consultedAt: string };
type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  streaming?: boolean;
  sources?: ChatSource[];
};

type RetryTurn = { messageId: string; text: string; speakReply: boolean };

function safeColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#2563EB';
}

function parseEvent(block: string) {
  const event = block.split(/\r?\n/).find((line) => line.startsWith('event:'))?.slice(6).trim();
  const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart()).join('\n');
  if (!event || !data) return null;
  try {
    return { event, data: JSON.parse(data) as Record<string, unknown> };
  } catch {
    return null;
  }
}

const VOICE_LABEL: Record<FlipAiVoiceState, string> = {
  idle: '',
  connecting: 'Conectando ao microfone…',
  listening: 'Pode falar. Estou ouvindo.',
  processing: 'Entendi. Preparando a resposta…',
  speaking: 'Respondendo por voz…',
  error: '',
};

export function PublicFlipAiChatShell({ agent }: { agent: PublicFlipAiAgent }) {
  const color = safeColor(agent.primaryColor);
  const initials = agent.name.trim().slice(0, 2).toUpperCase();
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const voiceRef = useRef<FlipAiRealtimeVoiceClient | null>(null);
  const voiceTurnQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'greeting',
    role: 'assistant',
    text: `Olá! Eu sou ${agent.name}, assistente virtual de ${agent.tenantName}. Posso entender melhor o que você está buscando?`,
  }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [voiceState, setVoiceState] = useState<FlipAiVoiceState>('idle');
  const [retryTurn, setRetryTurn] = useState<RetryTurn | null>(null);
  const [error, setError] = useState<string | null>(null);

  const voiceActive = voiceState !== 'idle' && voiceState !== 'error';

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, error]);

  useEffect(() => {
    ensureMetaFbcCookie(window.location.href);
  }, []);

  useEffect(() => () => {
    voiceRef.current?.stop(false);
    voiceRef.current = null;
  }, []);

  async function sendTurn(messageId: string, text: string, confirmRetry: boolean, speakReply = false) {
    if (sendingRef.current) return;
    const assistantId = `ai:${messageId}`;
    sendingRef.current = true;
    setSending(true);
    setError(null);
    setRetryTurn(null);
    setMessages((current) => {
      const withoutPreviousAssistant = current.filter((message) => message.id !== assistantId);
      const hasUser = withoutPreviousAssistant.some((message) => message.id === messageId);
      return [
        ...withoutPreviousAssistant,
        ...(hasUser ? [] : [{ id: messageId, role: 'user' as const, text }]),
        { id: assistantId, role: 'assistant' as const, text: '', streaming: true },
      ];
    });

    let assistantText = '';
    try {
      const response = await fetch(`/api/flip-ai/public/${encodeURIComponent(agent.slug)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messageId,
          text,
          confirmRetry,
          attribution: buildPublicAttribution(window.location.href, document.referrer),
        }),
      });
      if (!response.ok || !response.body) {
        const problem = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(problem.error || 'Não foi possível enviar sua mensagem.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let completed = false;
      let streamError: string | null = null;
      while (true) {
        const chunk = await reader.read();
        buffer += decoder.decode(chunk.value || new Uint8Array(), { stream: !chunk.done });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || '';
        for (const block of blocks) {
          const parsed = parseEvent(block);
          if (!parsed) continue;
          if (parsed.event === 'delta' && typeof parsed.data.delta === 'string') {
            assistantText += parsed.data.delta;
            setMessages((current) => current.map((message) =>
              message.id === assistantId ? { ...message, text: message.text + parsed.data.delta } : message));
          } else if (parsed.event === 'sources' && Array.isArray(parsed.data.sources)) {
            const sources = parsed.data.sources.flatMap((raw) => {
              if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
              const source = raw as Record<string, unknown>;
              if (typeof source.title !== 'string' || typeof source.url !== 'string'
                || typeof source.domain !== 'string' || typeof source.consultedAt !== 'string') return [];
              try {
                const url = new URL(source.url);
                if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== source.domain.toLowerCase()) return [];
              } catch { return []; }
              return [{ title: source.title.slice(0, 200), url: source.url,
                domain: source.domain.slice(0, 253), consultedAt: source.consultedAt }];
            }).slice(0, 10);
            setMessages((current) => current.map((message) =>
              message.id === assistantId ? { ...message, sources } : message));
          } else if (parsed.event === 'lead') {
            const meta = parsed.data.meta;
            if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
              const candidate = meta as Record<string, unknown>;
              if (typeof candidate.pixelId === 'string' && typeof candidate.eventId === 'string') {
                fireMetaLeadPixel({ pixelId: candidate.pixelId, eventId: candidate.eventId });
              }
            }
            if (typeof parsed.data.gtmContainerId === 'string') {
              firePublicGtmLeadEvent(parsed.data.gtmContainerId);
            }
          } else if (parsed.event === 'done') {
            completed = true;
            setMessages((current) => current.map((message) =>
              message.id === assistantId ? { ...message, streaming: false } : message));
          } else if (parsed.event === 'error') {
            streamError = typeof parsed.data.message === 'string'
              ? parsed.data.message : 'A resposta ficou incerta.';
          }
        }
        if (chunk.done) break;
      }
      if (!completed) throw new Error(streamError || 'A resposta não pôde ser confirmada.');
      if (speakReply && voiceRef.current) await voiceRef.current.speak(messageId, assistantText);
    } catch (failure) {
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, streaming: false } : message));
      setRetryTurn({ messageId, text, speakReply });
      setError(failure instanceof Error ? failure.message : 'Não foi possível enviar sua mensagem.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sendingRef.current || voiceActive) return;
    setInput('');
    void sendTurn(crypto.randomUUID(), text, false);
  }

  async function toggleVoice() {
    if (voiceRef.current) {
      voiceRef.current.stop();
      voiceRef.current = null;
      return;
    }
    setError(null);
    const client = new FlipAiRealtimeVoiceClient({
      slug: agent.slug,
      onStateChange: setVoiceState,
      onError: (message) => {
        setError(message);
        voiceRef.current = null;
      },
      onTranscript: ({ transcript }) => {
        voiceTurnQueueRef.current = voiceTurnQueueRef.current.then(() =>
          sendTurn(crypto.randomUUID(), transcript, false, true));
        return voiceTurnQueueRef.current;
      },
    });
    voiceRef.current = client;
    if (!await client.connect()) voiceRef.current = null;
  }

  return (
    <main className="min-h-dvh bg-slate-100 p-0 sm:flex sm:items-center sm:justify-center sm:p-6">
      <section className="flex min-h-dvh w-full flex-col overflow-hidden bg-white sm:min-h-[720px] sm:max-w-lg sm:rounded-2xl sm:border sm:shadow-xl">
        <header className="flex items-center gap-3 border-b bg-white px-4 py-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: color }} aria-hidden="true">
            {initials || <Bot className="h-5 w-5" />}
          </div>
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-slate-950">{agent.name}</h1>
            <p className="text-xs text-slate-600">Assistente virtual de {agent.tenantName}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Online
            </p>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-4 py-6" aria-live="polite">
          {messages.map((message) => (
            <div key={message.id}
              className={message.role === 'user'
                ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed text-white shadow-sm'
                : 'max-w-[85%] rounded-2xl rounded-bl-md border bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm'}
              style={message.role === 'user' ? { backgroundColor: color } : undefined}>
              {message.text}
              {message.sources?.length ? <ul className="mt-3 space-y-1 border-t pt-2 text-xs">
                {message.sources.map((source) => <li key={source.url}>
                  <a className="font-medium underline underline-offset-2" href={source.url}
                    target="_blank" rel="noopener noreferrer">{source.title}</a>
                  <span className="ml-1 text-slate-500">({source.domain})</span>
                </li>)}
              </ul> : null}
              {message.streaming && <LoaderCircle className="h-4 w-4 animate-spin" aria-label="Respondendo" />}
            </div>
          ))}
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>{error}</p>
              {retryTurn && (
                <button type="button" disabled={sending}
                  onClick={() => void sendTurn(retryTurn.messageId, retryTurn.text, true, retryTurn.speakReply)}
                  className="mt-2 inline-flex items-center gap-2 font-medium underline underline-offset-2">
                  <RotateCcw className="h-4 w-4" /> Confirmar nova tentativa
                </button>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={submit} className="border-t bg-white p-3">
          <div className="flex items-center gap-2 rounded-full border bg-slate-50 px-2 py-2 pl-4">
            <input value={input} onChange={(event) => setInput(event.target.value)}
              disabled={sending || voiceActive} maxLength={2_000} autoComplete="off" aria-label="Mensagem"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
              placeholder={voiceActive ? 'Conversa por voz ativa' : 'Digite sua mensagem...'} />
            <button disabled={sending && !voiceActive} type="button"
              onClick={() => void toggleVoice()}
              aria-label={voiceActive ? 'Encerrar conversa por voz' : 'Iniciar conversa por voz'}
              aria-pressed={voiceActive}
              className="flex h-9 w-9 items-center justify-center rounded-full border bg-white text-slate-700 disabled:opacity-50">
              {voiceState === 'connecting'
                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                : voiceActive ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
            </button>
            <button disabled={sending || voiceActive || !input.trim()} type="submit" aria-label="Enviar mensagem"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-50"
              style={{ backgroundColor: color }}>
              {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          {voiceActive && <p className="mt-2 text-center text-xs font-medium" style={{ color }} role="status">
            {VOICE_LABEL[voiceState]}
          </p>}
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Ao continuar, você conversa com um assistente virtual. Não envie senhas ou dados bancários.
          </p>
        </form>
      </section>
    </main>
  );
}

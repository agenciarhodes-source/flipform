'use client';

import Image from 'next/image';
import { resolveTypingDelayMs, splitReplyIntoMessages } from '@/lib/flip-ai/typing-pace';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, LoaderCircle, Mic, Paperclip, RotateCcw, Send, Square, X } from 'lucide-react';
import type { PublicFlipAiAgent } from '@/lib/flip-ai/public-agent';
import { FlipAiRealtimeVoiceClient, type FlipAiVoiceState } from '@/lib/flip-ai/realtime-client';
import { buildPublicAttribution, ensureMetaFbcCookie } from '@/lib/attribution';
import { fireMetaLeadPixel } from '@/lib/tracking/meta-pixel-client';
import { firePublicGtmLeadEvent } from '@/lib/tracking/gtm-client';
import { isValidFlipAiAvatar } from '@/lib/flip-ai/avatar';

type ChatSource = { title: string; url: string; domain: string; consultedAt: string };
type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  streaming?: boolean;
  sources?: ChatSource[];
};

type RetryTurn = {
  messageId: string;
  text: string;
  speakReply: boolean;
  inputMode: 'text' | 'voice';
  file: File | null;
};

// Mirrors the server limits; the server checks the real bytes again.
const ATTACHMENT_MAX_BYTES = 4 * 1024 * 1024;
const ATTACHMENT_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf';

function attachmentLabel(file: File) {
  return `📎 ${file.name.slice(0, 120)}`;
}

function safeColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#2563EB';
}

function optionalColor(value: string | null | undefined, fallback: string) {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function readableTextColor(color: string) {
  const [r, g, b] = [1, 3, 5].map((offset) => Number.parseInt(color.slice(offset, offset + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 >= 150 ? '#0F172A' : '#FFFFFF';
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
  const backgroundColor = optionalColor(agent.chatBackgroundColor, '#F8FAFC');
  const userMessageColor = optionalColor(agent.userMessageColor, color);
  const sendButtonColor = optionalColor(agent.sendButtonColor, color);
  const avatarUrl = agent.avatarUrl && isValidFlipAiAvatar(agent.avatarUrl) ? agent.avatarUrl : null;
  const initials = agent.name.trim().slice(0, 2).toUpperCase();
  const bottomRef = useRef<HTMLDivElement>(null);
  const sendingRef = useRef(false);
  const voiceRef = useRef<FlipAiRealtimeVoiceClient | null>(null);
  const voiceTurnQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'greeting',
    role: 'assistant',
    text: `Olá! Sou ${agent.name}, da ${agent.tenantName}. Como posso ajudar você hoje?`,
  }]);
  const [input, setInput] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  async function sendTurn(
    messageId: string,
    text: string,
    confirmRetry: boolean,
    speakReply = false,
    inputMode: 'text' | 'voice' = 'text',
    attachedFile: File | null = null,
  ) {
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
        ...(hasUser ? [] : [{
          id: messageId,
          role: 'user' as const,
          // The bubble shows the message and, below it, the name of the attached file.
          text: attachedFile && text !== attachmentLabel(attachedFile) ? `${text}\n${attachmentLabel(attachedFile)}` : text,
        }]),
        { id: assistantId, role: 'assistant' as const, text: '', streaming: true },
      ];
    });

    let assistantText = '';
    const startedAt = Date.now();
    try {
      const payload = JSON.stringify({
        messageId,
        text,
        confirmRetry,
        inputMode,
        attribution: buildPublicAttribution(window.location.href, document.referrer),
      });
      let requestInit: RequestInit = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: payload };
      if (attachedFile) {
        // With a photo or document the browser sends a multipart body and sets its own content type.
        const form = new FormData();
        form.set('payload', payload);
        form.set('file', attachedFile);
        requestInit = { method: 'POST', body: form };
      }
      const response = await fetch(`/api/flip-ai/public/${encodeURIComponent(agent.slug)}/messages`, requestInit);
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
            // Held until the typing pace elapses; the bubble keeps showing "Escrevendo...".
            assistantText += parsed.data.delta;
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
          } else if (parsed.event === 'error') {
            streamError = typeof parsed.data.message === 'string'
              ? parsed.data.message : 'A resposta ficou incerta.';
          }
        }
        if (chunk.done) break;
      }
      if (!completed) throw new Error(streamError || 'A resposta não pôde ser confirmada.');
      // A spoken reply is paced by the voice itself and stays in one bubble.
      const parts = speakReply ? [assistantText] : splitReplyIntoMessages(assistantText);
      for (let index = 0; index < parts.length; index += 1) {
        const part = parts[index] ?? '';
        const partId = index === 0 ? assistantId : `${assistantId}:${index + 1}`;
        if (index > 0) {
          setMessages((current) => [
            ...current.filter((message) => message.id !== partId),
            { id: partId, role: 'assistant' as const, text: '', streaming: true },
          ]);
        }
        // Only the first bubble discounts the time the model already took.
        const typingDelay = speakReply ? 0 : resolveTypingDelayMs(part.length, index === 0 ? Date.now() - startedAt : 0);
        if (typingDelay > 0) await new Promise((resolve) => setTimeout(resolve, typingDelay));
        setMessages((current) => current.map((message) =>
          message.id === partId ? { ...message, text: part, streaming: false } : message));
      }
      if (speakReply && voiceRef.current) await voiceRef.current.speak(messageId, assistantText);
    } catch (failure) {
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, streaming: false } : message));
      setRetryTurn({ messageId, text, speakReply, inputMode, file: attachedFile });
      setError(failure instanceof Error ? failure.message : 'Não foi possível enviar sua mensagem.');
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    // A file can go alone: its name stands in for the message.
    const text = input.trim() || (file ? attachmentLabel(file) : '');
    if (!text || sendingRef.current || voiceActive) return;
    const attachedFile = file;
    setInput('');
    setFile(null);
    void sendTurn(crypto.randomUUID(), text, false, false, 'text', attachedFile);
  }

  function chooseFile(chosen: File | null) {
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!chosen) return;
    if (chosen.size > ATTACHMENT_MAX_BYTES) {
      setError('O arquivo é maior que 4 MB. Envie um arquivo menor ou uma foto.');
      return;
    }
    if (!ATTACHMENT_ACCEPT.split(',').includes(chosen.type)) {
      setError('Envie uma foto (JPG, PNG ou WEBP) ou um documento em PDF.');
      return;
    }
    setError(null);
    setFile(chosen);
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
        if (voiceRef.current === client) voiceRef.current = null;
      },
      onTranscript: ({ transcript }) => {
        voiceTurnQueueRef.current = voiceTurnQueueRef.current.then(() =>
          sendTurn(crypto.randomUUID(), transcript, false, true, 'voice'));
        return voiceTurnQueueRef.current;
      },
    });
    voiceRef.current = client;
    if (!await client.connect() && voiceRef.current === client) voiceRef.current = null;
  }

  return (
    <main className="min-h-dvh bg-slate-100 p-0 sm:flex sm:items-center sm:justify-center sm:p-6">
      <section className="flex min-h-dvh w-full flex-col overflow-hidden bg-white sm:min-h-[720px] sm:max-w-lg sm:rounded-2xl sm:border sm:shadow-xl">
        <header className="flex items-center gap-3 border-b bg-white px-4 py-3">
          {avatarUrl ? <Image src={avatarUrl} alt={`Foto de ${agent.name}`} width={44} height={44} unoptimized
            className="h-11 w-11 shrink-0 rounded-full border object-cover" />
            : <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
              style={{ backgroundColor: color, color: readableTextColor(color) }} aria-hidden="true">
              {initials || <Bot className="h-5 w-5" />}
            </div>}
          <div className="min-w-0">
            <h1 className="truncate font-semibold text-slate-950">{agent.name}</h1>
            <p className="text-xs text-slate-600">Assistente da {agent.tenantName}</p>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-emerald-700">
              <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
              Online
            </p>
          </div>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-6" style={{ backgroundColor }} aria-live="polite">
          {messages.map((message) => (
            <div key={message.id}
              className={message.role === 'user'
                ? 'ml-auto max-w-[85%] rounded-2xl rounded-br-md px-4 py-3 text-sm leading-relaxed text-white shadow-sm'
                : 'max-w-[85%] rounded-2xl rounded-bl-md border bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm'}
              style={message.role === 'user' ? {
                backgroundColor: userMessageColor, color: readableTextColor(userMessageColor),
              } : undefined}>
              <span className="whitespace-pre-line">{message.text}</span>
              {message.sources?.length ? <ul className="mt-3 space-y-1 border-t pt-2 text-xs">
                {message.sources.map((source) => <li key={source.url}>
                  <a className="font-medium underline underline-offset-2" href={source.url}
                    target="_blank" rel="noopener noreferrer">{source.title}</a>
                  <span className="ml-1 text-slate-500">({source.domain})</span>
                </li>)}
              </ul> : null}
              {message.streaming && (
                <span role="status" className={message.text ? 'mt-1 block text-xs text-slate-500' : 'text-slate-500'}>
                  Escrevendo<span className="animate-pulse" aria-hidden="true">...</span>
                </span>
              )}
            </div>
          ))}
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>{error}</p>
              {retryTurn && (
                <button type="button" disabled={sending}
                  onClick={() => void sendTurn(
                    retryTurn.messageId,
                    retryTurn.text,
                    true,
                    retryTurn.speakReply,
                    retryTurn.inputMode,
                    retryTurn.file,
                  )}
                  className="mt-2 inline-flex items-center gap-2 font-medium underline underline-offset-2">
                  <RotateCcw className="h-4 w-4" /> Confirmar nova tentativa
                </button>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={submit} className="border-t bg-white p-3">
          {file && (
            <div className="mb-2 flex items-center gap-2 rounded-lg border bg-slate-50 px-3 py-2 text-xs text-slate-700">
              <Paperclip className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} aria-label="Remover arquivo"
                className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-slate-200">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <input ref={fileInputRef} type="file" accept={ATTACHMENT_ACCEPT} className="hidden"
            onChange={(event) => chooseFile(event.target.files?.[0] || null)} />
          <div className="flex items-center gap-2 rounded-full border bg-slate-50 px-2 py-2 pl-4">
            <input value={input} onChange={(event) => setInput(event.target.value)}
              disabled={sending || voiceActive} maxLength={2_000} autoComplete="off" aria-label="Mensagem"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
              placeholder={voiceActive ? 'Conversa por voz ativa' : 'Digite sua mensagem...'} />
            <button disabled={sending || voiceActive} type="button"
              onClick={() => fileInputRef.current?.click()}
              aria-label="Anexar foto ou documento"
              className="flex h-9 w-9 items-center justify-center rounded-full border bg-white text-slate-700 disabled:opacity-50">
              <Paperclip className="h-4 w-4" />
            </button>
            <button disabled={sending && !voiceActive} type="button"
              onClick={() => void toggleVoice()}
              aria-label={voiceActive ? 'Encerrar conversa por voz' : 'Iniciar conversa por voz'}
              aria-pressed={voiceActive}
              className="flex h-9 w-9 items-center justify-center rounded-full border bg-white text-slate-700 disabled:opacity-50">
              {voiceState === 'connecting'
                ? <LoaderCircle className="h-4 w-4 animate-spin" />
                : voiceActive ? <Square className="h-3.5 w-3.5" /> : <Mic className="h-4 w-4" />}
            </button>
            <button disabled={sending || voiceActive || (!input.trim() && !file)} type="submit" aria-label="Enviar mensagem"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-50"
              style={{ backgroundColor: sendButtonColor, color: readableTextColor(sendButtonColor) }}>
              {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          {voiceActive && <p className="mt-2 text-center text-xs font-medium" style={{ color }} role="status">
            {VOICE_LABEL[voiceState]}
          </p>}
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Você está em ambiente virtual. Não envie senhas ou dados bancários.
          </p>
        </form>
      </section>
    </main>
  );
}

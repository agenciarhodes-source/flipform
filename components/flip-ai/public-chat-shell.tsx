'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import { Bot, LoaderCircle, RotateCcw, Send } from 'lucide-react';
import type { PublicFlipAiAgent } from '@/lib/flip-ai/public-agent';

type ChatMessage = {
  id: string;
  role: 'assistant' | 'user';
  text: string;
  streaming?: boolean;
};

type RetryTurn = { messageId: string; text: string };

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

export function PublicFlipAiChatShell({ agent }: { agent: PublicFlipAiAgent }) {
  const color = safeColor(agent.primaryColor);
  const initials = agent.name.trim().slice(0, 2).toUpperCase();
  const bottomRef = useRef<HTMLDivElement>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([{
    id: 'greeting',
    role: 'assistant',
    text: `Olá! Eu sou ${agent.name}, assistente virtual de ${agent.tenantName}. Posso entender melhor o que você está buscando?`,
  }]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [retryTurn, setRetryTurn] = useState<RetryTurn | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, error]);

  async function sendTurn(messageId: string, text: string, confirmRetry: boolean) {
    const assistantId = `ai:${messageId}`;
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

    try {
      const response = await fetch(`/api/flip-ai/public/${encodeURIComponent(agent.slug)}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageId, text, confirmRetry }),
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
            setMessages((current) => current.map((message) =>
              message.id === assistantId ? { ...message, text: message.text + parsed.data.delta } : message));
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
    } catch (failure) {
      setMessages((current) => current.map((message) =>
        message.id === assistantId ? { ...message, streaming: false } : message));
      setRetryTurn({ messageId, text });
      setError(failure instanceof Error ? failure.message : 'Não foi possível enviar sua mensagem.');
    } finally {
      setSending(false);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    void sendTurn(crypto.randomUUID(), text, false);
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
              {message.streaming && <LoaderCircle className="h-4 w-4 animate-spin" aria-label="Respondendo" />}
            </div>
          ))}
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <p>{error}</p>
              {retryTurn && (
                <button type="button" disabled={sending}
                  onClick={() => void sendTurn(retryTurn.messageId, retryTurn.text, true)}
                  className="mt-2 inline-flex items-center gap-2 font-medium underline underline-offset-2">
                  <RotateCcw className="h-4 w-4" /> Confirmar nova tentativa
                </button>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <form onSubmit={submit} className="border-t bg-white p-3">
          <div className="flex items-center gap-2 rounded-full border bg-slate-50 px-4 py-2">
            <input value={input} onChange={(event) => setInput(event.target.value)}
              disabled={sending} maxLength={2_000} autoComplete="off" aria-label="Mensagem"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
              placeholder="Digite sua mensagem..." />
            <button disabled={sending || !input.trim()} type="submit" aria-label="Enviar mensagem"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white disabled:opacity-50"
              style={{ backgroundColor: color }}>
              {sending ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-500">
            Ao continuar, você conversa com um assistente virtual. Não envie senhas ou dados bancários.
          </p>
        </form>
      </section>
    </main>
  );
}

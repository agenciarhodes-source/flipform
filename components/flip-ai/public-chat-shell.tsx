import { Bot, LockKeyhole, Send } from 'lucide-react';
import type { PublicFlipAiAgent } from '@/lib/flip-ai/public-agent';

function safeColor(value: string) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#2563EB';
}

export function PublicFlipAiChatShell({ agent }: { agent: PublicFlipAiAgent }) {
  const color = safeColor(agent.primaryColor);
  const initials = agent.name.trim().slice(0, 2).toUpperCase();

  return (
    <main className="min-h-dvh bg-slate-100 p-0 sm:flex sm:items-center sm:justify-center sm:p-6">
      <section className="flex min-h-dvh w-full flex-col overflow-hidden bg-white sm:min-h-[720px] sm:max-w-lg sm:rounded-2xl sm:border sm:shadow-xl">
        <header className="flex items-center gap-3 border-b bg-white px-4 py-3">
          <div
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ backgroundColor: color }}
            aria-hidden="true"
          >
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
          <div className="max-w-[85%] rounded-2xl rounded-bl-md border bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 shadow-sm">
            Olá! Eu sou {agent.name}, assistente virtual de {agent.tenantName}. Posso entender melhor o que você está buscando?
          </div>
        </div>

        <footer className="border-t bg-white p-3">
          <div className="flex items-center gap-2 rounded-full border bg-slate-50 px-4 py-2">
            <input
              disabled
              aria-label="Mensagem"
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-slate-500"
              placeholder="Digite sua mensagem..."
            />
            <button
              disabled
              type="button"
              aria-label="Enviar mensagem"
              className="flex h-9 w-9 items-center justify-center rounded-full text-white opacity-60"
              style={{ backgroundColor: color }}
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <p className="mt-2 flex items-center justify-center gap-1 text-center text-[11px] text-slate-500">
            <LockKeyhole className="h-3 w-3" aria-hidden="true" />
            Canal seguro. O envio de mensagens será ativado na próxima etapa.
          </p>
        </footer>
      </section>
    </main>
  );
}

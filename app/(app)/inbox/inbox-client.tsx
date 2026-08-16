'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCheck,
  Clock3,
  Instagram,
  MessageSquareText,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConversationActions } from './conversation-actions';

interface InboxIdentity {
  id: string;
  externalUserId: string;
  username: string | null;
  displayName: string | null;
  phone: string | null;
  email: string | null;
}

interface InboxLead {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  assignedTo: string | null;
}

interface InboxAssignee {
  id: string;
  name: string;
}

interface InboxMessageSummary {
  id: string;
  direction: string;
  type: string;
  text: string | null;
  status: string;
  providerTimestamp: string | null;
  createdAt: string;
}

interface InboxConversation {
  id: string;
  provider: string;
  channel: string;
  status: string;
  unreadCount: number;
  assignedTo: string | null;
  lastMessageAt: string | null;
  lastInboundAt: string | null;
  lastOutboundAt: string | null;
  externalContactIdentity: InboxIdentity;
  lead: InboxLead | null;
  assignee: InboxAssignee | null;
  messages: InboxMessageSummary[];
}

interface InboxMessage extends InboxMessageSummary {
  conversationId: string;
  text: string | null;
  sentByUserId: string | null;
  sentByUser: InboxAssignee | null;
  metadata: unknown;
}

function contactName(conversation: InboxConversation) {
  return conversation.lead?.name
    || conversation.externalContactIdentity.displayName
    || conversation.externalContactIdentity.username
    || conversation.externalContactIdentity.phone
    || conversation.externalContactIdentity.externalUserId;
}

function lastMessageText(conversation: InboxConversation) {
  const message = conversation.messages[0];
  if (!message) return 'Sem mensagens';
  if (message.text?.trim()) return message.text.trim();
  return message.type === 'text' ? 'Mensagem' : `[${message.type}]`;
}

function formatListDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function formatMessageDate(value: string | null | undefined) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function createIdempotencyKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `inbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function MessageStatus({ status }: { status: string }) {
  if (status === 'read') return <CheckCheck className="h-3.5 w-3.5" aria-label="Lida" />;
  if (status === 'delivered') return <CheckCheck className="h-3.5 w-3.5 opacity-75" aria-label="Entregue" />;
  if (status === 'sent') return <Check className="h-3.5 w-3.5" aria-label="Enviada" />;
  if (status === 'failed') return <AlertCircle className="h-3.5 w-3.5" aria-label="Falha" />;
  return <Clock3 className="h-3.5 w-3.5 opacity-75" aria-label="Pendente" />;
}

export function InboxClient({
  canManage,
  canAssign,
  canSendWhatsApp,
}: {
  canManage: boolean;
  canAssign: boolean;
  canSendWhatsApp: boolean;
}) {
  const [conversations, setConversations] = useState<InboxConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<InboxMessage[]>([]);
  const [search, setSearch] = useState('');
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const selectedIdRef = useRef<string | null>(null);

  const selected = conversations.find((conversation) => conversation.id === selectedId) || null;

  const filteredConversations = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return conversations;
    return conversations.filter((conversation) => {
      const haystack = [
        contactName(conversation),
        conversation.externalContactIdentity.phone,
        conversation.externalContactIdentity.username,
        conversation.externalContactIdentity.externalUserId,
        conversation.lead?.email,
        lastMessageText(conversation),
      ]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      return haystack.includes(term);
    });
  }, [conversations, search]);

  function selectConversation(conversationId: string | null) {
    selectedIdRef.current = conversationId;
    setMessages([]);
    setLoadingMessages(Boolean(conversationId));
    setError(null);
    setWarning(null);
    setSelectedId(conversationId);
  }

  async function loadConversations(silent = false) {
    if (!silent) setLoadingConversations(true);
    try {
      const response = await fetch('/api/inbox/conversations', { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível carregar as conversas.');
      const data = await response.json();
      const next = Array.isArray(data.conversations) ? data.conversations as InboxConversation[] : [];
      setConversations(next);
      setSelectedId((current) => {
        const nextId = current && next.some((conversation) => conversation.id === current)
          ? current
          : next[0]?.id || null;
        if (nextId !== current) {
          selectedIdRef.current = nextId;
          setMessages([]);
          setLoadingMessages(Boolean(nextId));
        }
        return nextId;
      });
    } catch (loadError) {
      if (!silent) setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as conversas.');
    } finally {
      if (!silent) setLoadingConversations(false);
    }
  }

  async function loadMessages(conversationId: string, silent = false) {
    if (!silent) setLoadingMessages(true);
    try {
      const response = await fetch(`/api/inbox/conversations/${encodeURIComponent(conversationId)}/messages`, { cache: 'no-store' });
      if (!response.ok) throw new Error('Não foi possível carregar as mensagens.');
      const data = await response.json();
      if (selectedIdRef.current !== conversationId) return;
      setMessages(Array.isArray(data.messages) ? data.messages : []);
    } catch (loadError) {
      if (!silent && selectedIdRef.current === conversationId) {
        setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar as mensagens.');
      }
    } finally {
      if (!silent && selectedIdRef.current === conversationId) setLoadingMessages(false);
    }
  }

  async function markRead(conversationId: string) {
    if (!canManage) return;
    const response = await fetch(`/api/inbox/conversations/${encodeURIComponent(conversationId)}/read`, {
      method: 'POST',
    }).catch(() => null);
    if (!response?.ok) return;
    setConversations((current) => current.map((conversation) => (
      conversation.id === conversationId ? { ...conversation, unreadCount: 0 } : conversation
    )));
  }

  useEffect(() => {
    void loadConversations();
    const timer = window.setInterval(() => void loadConversations(true), 12_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      setLoadingMessages(false);
      return;
    }

    setMessages([]);
    setLoadingMessages(true);
    setError(null);
    setWarning(null);
    void loadMessages(selectedId);
    void markRead(selectedId);
    const timer = window.setInterval(() => void loadMessages(selectedId, true), 5_000);
    return () => window.clearInterval(timer);
  }, [selectedId, canManage]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages.length, selectedId]);

  async function sendMessage() {
    if (!selected || selected.channel !== 'whatsapp' || !canSendWhatsApp || sending) return;
    const text = draft.trim();
    if (!text) return;

    setSending(true);
    setError(null);
    setWarning(null);
    try {
      const response = await fetch(`/api/conversations/${encodeURIComponent(selected.id)}/messages/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          idempotencyKey: createIdempotencyKey(),
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok && response.status !== 202) {
        throw new Error(data.error || 'Não foi possível enviar a mensagem.');
      }

      setDraft('');
      if (response.status === 202) {
        setWarning(data.warning || 'O status do envio ainda está sendo confirmado. O Flipform não repetirá o envio automaticamente.');
      }
      await Promise.all([
        loadMessages(selected.id, true),
        loadConversations(true),
      ]);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="h-[calc(100vh-4rem)] min-h-[520px] bg-muted/20 p-0 md:p-4">
      <div className="mx-auto flex h-full max-w-[1600px] overflow-hidden border bg-card shadow-sm md:rounded-xl">
        <section className={`${selectedId ? 'hidden md:flex' : 'flex'} w-full shrink-0 flex-col border-r md:w-[360px]`}>
          <div className="border-b p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h1 className="font-heading text-lg font-semibold">Conversas</h1>
                <p className="text-xs text-muted-foreground">WhatsApp agora, Instagram preparado no core.</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => void loadConversations()}
                disabled={loadingConversations}
                aria-label="Atualizar conversas"
              >
                <RefreshCw className={`h-4 w-4 ${loadingConversations ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar contato ou mensagem"
                className="pl-9"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {loadingConversations && conversations.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Carregando conversas...</div>
            ) : filteredConversations.length === 0 ? (
              <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 p-8 text-center text-muted-foreground">
                <MessageSquareText className="h-9 w-9 opacity-40" />
                <div className="text-sm font-medium text-foreground">Nenhuma conversa encontrada</div>
                <div className="max-w-56 text-xs">As novas mensagens recebidas pelos canais conectados aparecerão aqui.</div>
              </div>
            ) : (
              filteredConversations.map((conversation) => {
                const last = conversation.messages[0];
                const active = conversation.id === selectedId;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => selectConversation(conversation.id)}
                    className={`flex w-full gap-3 border-b px-4 py-3 text-left transition-colors hover:bg-muted/60 ${active ? 'bg-brand-50/70' : ''}`}
                  >
                    <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                      {conversation.channel === 'instagram'
                        ? <Instagram className="h-5 w-5" />
                        : <MessageSquareText className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold">{contactName(conversation)}</span>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {formatListDate(last?.providerTimestamp || last?.createdAt || conversation.lastMessageAt)}
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                          {last?.direction === 'outbound' ? 'Você: ' : ''}{lastMessageText(conversation)}
                        </span>
                        {conversation.unreadCount > 0 && (
                          <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[10px] font-semibold text-white">
                            {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        <span className="capitalize">{conversation.channel}</span>
                        {conversation.assignee?.name && <><span>•</span><span className="truncate">{conversation.assignee.name}</span></>}
                        {conversation.status === 'resolved' && <><span>•</span><span>resolvida</span></>}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className={`${selectedId ? 'flex' : 'hidden md:flex'} min-w-0 flex-1 flex-col`}>
          {!selected ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-muted-foreground">
              <MessageSquareText className="h-12 w-12 opacity-30" />
              <div>
                <div className="font-medium text-foreground">Selecione uma conversa</div>
                <p className="mt-1 text-sm">O histórico aparecerá aqui.</p>
              </div>
            </div>
          ) : (
            <>
              <header className="flex min-h-16 items-center gap-3 border-b px-3 py-2 md:px-5">
                <Button variant="ghost" size="icon" className="md:hidden" onClick={() => selectConversation(null)} aria-label="Voltar para conversas">
                  <ArrowLeft className="h-5 w-5" />
                </Button>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                  {selected.channel === 'instagram' ? <Instagram className="h-5 w-5" /> : <MessageSquareText className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{contactName(selected)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {selected.externalContactIdentity.phone || selected.externalContactIdentity.username || selected.externalContactIdentity.externalUserId}
                    {selected.lead ? ` • Lead: ${selected.lead.name}` : ' • Sem lead vinculado'}
                  </div>
                </div>
                <div className="hidden text-right text-xs text-muted-foreground sm:block">
                  <div className="capitalize">{selected.status}</div>
                  {selected.assignee?.name && <div className="max-w-40 truncate">{selected.assignee.name}</div>}
                </div>
                <ConversationActions
                  conversationId={selected.id}
                  status={selected.status}
                  lead={selected.lead}
                  assignee={selected.assignee}
                  canManage={canManage}
                  canAssign={canAssign}
                  onChanged={() => loadConversations(true)}
                />
              </header>

              <div className="flex-1 overflow-y-auto bg-muted/20 px-3 py-4 md:px-6">
                {loadingMessages && messages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Carregando mensagens...</div>
                ) : messages.length === 0 ? (
                  <div className="py-10 text-center text-sm text-muted-foreground">Ainda não há mensagens nesta conversa.</div>
                ) : (
                  <div className="mx-auto flex max-w-4xl flex-col gap-2.5">
                    {messages.map((message) => {
                      const outbound = message.direction === 'outbound';
                      return (
                        <div key={message.id} className={`flex ${outbound ? 'justify-end' : 'justify-start'}`}>
                          <div className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 shadow-sm md:max-w-[72%] ${outbound ? 'rounded-br-md bg-brand-600 text-white' : 'rounded-bl-md border bg-card text-foreground'} ${message.status === 'failed' ? 'ring-1 ring-red-400' : ''}`}>
                            {message.text ? (
                              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
                            ) : (
                              <p className="text-sm italic opacity-75">Mensagem do tipo {message.type}</p>
                            )}
                            <div className={`mt-1 flex items-center justify-end gap-1 text-[10px] ${outbound ? 'text-white/75' : 'text-muted-foreground'}`}>
                              {message.sentByUser?.name && <span className="max-w-32 truncate">{message.sentByUser.name}</span>}
                              <span>{formatMessageDate(message.providerTimestamp || message.createdAt)}</span>
                              {outbound && <MessageStatus status={message.status} />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div ref={endRef} />
                  </div>
                )}
              </div>

              <footer className="border-t bg-card p-3 md:p-4">
                <div className="mx-auto max-w-4xl">
                  {error && (
                    <div className="mb-2 flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}
                  {warning && (
                    <div className="mb-2 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      <Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      <span>{warning}</span>
                    </div>
                  )}

                  {selected.channel !== 'whatsapp' ? (
                    <div className="rounded-md border border-dashed px-4 py-3 text-center text-sm text-muted-foreground">
                      O histórico multicanal já suporta Instagram. O envio pelo Direct entra na próxima etapa da integração Instagram.
                    </div>
                  ) : !canSendWhatsApp ? (
                    <div className="rounded-md border border-dashed px-4 py-3 text-center text-sm text-muted-foreground">
                      Seu perfil possui acesso somente de leitura para esta conversa.
                    </div>
                  ) : (
                    <div className="flex items-end gap-2">
                      <textarea
                        value={draft}
                        onChange={(event) => setDraft(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' && !event.shiftKey) {
                            event.preventDefault();
                            void sendMessage();
                          }
                        }}
                        maxLength={4096}
                        rows={2}
                        placeholder="Digite uma mensagem..."
                        className="min-h-[44px] max-h-36 flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={sending}
                      />
                      <Button
                        type="button"
                        size="icon"
                        className="h-11 w-11 shrink-0"
                        onClick={() => void sendMessage()}
                        disabled={sending || !draft.trim()}
                        aria-label="Enviar mensagem"
                      >
                        {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                  )}
                </div>
              </footer>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type {
  MessageNotification, MessageNotificationCursor, UnreadConversationNotification,
} from '@/lib/notifications/message-feed';

const POLL_MS = 10_000;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch {
    return fallback;
  }
}

function store(key: string, value: unknown) {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

/** "há 3 h · 14:05", or with the day when it was not today: "há 2 d · 14/10 09:30". */
function when(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  const hours = Math.floor(minutes / 60);
  const ago = minutes < 1 ? 'agora' : minutes < 60 ? `há ${minutes} min` : hours < 24 ? `há ${hours} h` : `há ${Math.floor(hours / 24)} d`;
  const time = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const today = date.toDateString() === new Date().toDateString();
  return `${ago} · ${today ? time : `${date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })} ${time}`}`;
}

function playChime() {
  try {
    const context = new window.AudioContext();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.36);
    oscillator.onended = () => void context.close();
  } catch {
    // Some browsers block sound until the person interacts with the page.
  }
}

/**
 * The unread conversations of the Inbox, one per customer with how many messages are waiting.
 * The number stays until each conversation is opened; new messages also ring and show a notice.
 */
export function MessageNotificationCenter({ tenantId, userId }: { tenantId: string; userId: string }) {
  const cursorKey = useMemo(() => `flipform:message-notifications:cursor:${tenantId}:${userId}`, [tenantId, userId]);
  const [unread, setUnread] = useState<{ total: number; items: UnreadConversationNotification[] }>({ total: 0, items: [] });
  const cursorRef = useRef<MessageNotificationCursor | null>(null);
  const busyRef = useRef(false);

  const go = useCallback((href: string) => { window.location.assign(href); }, []);

  const refreshUnread = useCallback(async () => {
    try {
      const response = await fetch('/api/notifications/unread-conversations', { cache: 'no-store' });
      if (!response.ok) return;
      const data = await response.json() as { total: number; items: UnreadConversationNotification[] };
      setUnread({ total: data.total || 0, items: Array.isArray(data.items) ? data.items : [] });
    } catch {
      // Keeps the last list when the network fails.
    }
  }, []);

  const announce = useCallback((fresh: MessageNotification[]) => {
    const params = new URLSearchParams(window.location.search);
    const viewing = window.location.pathname === '/inbox' ? params.get('conversationId') : null;
    const toAnnounce = fresh.filter((item) => item.conversationId !== viewing);
    if (!toAnnounce.length) return;
    playChime();
    // One notice per conversation, with the latest message of each. Messages are announced only
    // inside the system; the browser (Chrome) notification is kept for new leads alone.
    const latest = new Map(toAnnounce.map((item) => [item.conversationId, item]));
    for (const item of Array.from(latest.values()).slice(-3)) {
      toast(`Nova mensagem de ${item.contact}`, {
        description: item.preview,
        duration: 10_000,
        action: { label: 'Abrir', onClick: () => go(item.href) },
      });
    }
  }, [go]);

  const poll = useCallback(async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    try {
      const cursor = cursorRef.current;
      const params = new URLSearchParams();
      if (cursor) {
        params.set('after', cursor.createdAt);
        if (cursor.id) params.set('afterId', cursor.id);
      }
      const response = await fetch(`/api/notifications/messages${params.size ? `?${params.toString()}` : ''}`, { cache: 'no-store' });
      if (response.ok) {
        const feed = await response.json() as { items: MessageNotification[]; cursor: MessageNotificationCursor };
        cursorRef.current = feed.cursor;
        store(cursorKey, feed.cursor);
        if (feed.items.length) announce(feed.items);
      }
      await refreshUnread();
    } catch {
      // Notifications are a helper and never affect the conversations themselves.
    } finally {
      busyRef.current = false;
    }
  }, [announce, cursorKey, refreshUnread]);

  useEffect(() => {
    cursorRef.current = read<MessageNotificationCursor | null>(cursorKey, null);
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    const onFocus = () => void poll();
    const onRead = () => void refreshUnread();
    window.addEventListener('focus', onFocus);
    window.addEventListener('flipform:inbox-read', onRead);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('flipform:inbox-read', onRead);
    };
  }, [cursorKey, poll, refreshUnread]);

  const { total, items } = unread;

  return (
    <DropdownMenu onOpenChange={(isOpen) => { if (isOpen) void refreshUnread(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={total ? `${total} conversa(s) não lida(s)` : 'Mensagens'}>
          <MessageCircle className="h-5 w-5" />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-emerald-600 px-1 text-[10px] font-semibold leading-[18px] text-white">
              {total > 99 ? '99+' : total}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] max-w-[calc(100vw-24px)] p-0">
        <div className="p-3">
          <DropdownMenuLabel className="p-0">Conversas não lidas{total ? ` (${total})` : ''}</DropdownMenuLabel>
          <p className="text-xs text-muted-foreground">Clique para abrir a conversa na Inbox.</p>
        </div>
        <DropdownMenuSeparator className="m-0" />
        {items.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma conversa não lida.</p>
        ) : (
          <ul className="max-h-96 overflow-y-auto">
            {items.map((item) => (
              <li key={item.conversationId}>
                <button type="button" onClick={() => go(item.href)} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{item.contact}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{when(item.lastAt)}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{item.preview}</span>
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-[10px] font-semibold text-white"
                      title={`${item.unreadCount} mensagem(ns) não lida(s)`}>
                      {item.unreadCount > 99 ? '99+' : item.unreadCount}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

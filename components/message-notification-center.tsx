'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { MessageNotification, MessageNotificationCursor } from '@/lib/notifications/message-feed';

const POLL_MS = 10_000;
const MAX_KEPT = 30;

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

function when(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `há ${hours} h` : `há ${Math.floor(hours / 24)} d`;
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

/** Tells the attendant about new customer messages; a click opens that conversation in the Inbox. */
export function MessageNotificationCenter({ tenantId, userId }: { tenantId: string; userId: string }) {
  const keys = useMemo(() => ({
    cursor: `flipform:message-notifications:cursor:${tenantId}:${userId}`,
    items: `flipform:message-notifications:items:${tenantId}:${userId}`,
    seen: `flipform:message-notifications:seen:${tenantId}:${userId}`,
  }), [tenantId, userId]);
  const [items, setItems] = useState<MessageNotification[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const cursorRef = useRef<MessageNotificationCursor | null>(null);
  const busyRef = useRef(false);
  const itemsRef = useRef<MessageNotification[]>([]);

  const open = useCallback((item: MessageNotification) => {
    setSeen((current) => {
      const next = Array.from(new Set([...current, item.id])).slice(-200);
      store(keys.seen, next);
      return next;
    });
    window.location.assign(item.href);
  }, [keys.seen]);

  const announce = useCallback((fresh: MessageNotification[]) => {
    const params = new URLSearchParams(window.location.search);
    const viewing = window.location.pathname === '/inbox' ? params.get('conversationId') : null;
    const toAnnounce = fresh.filter((item) => item.conversationId !== viewing);
    if (!toAnnounce.length) return;
    playChime();
    // One notice per conversation, with the latest message of each.
    const latest = new Map(toAnnounce.map((item) => [item.conversationId, item]));
    for (const item of Array.from(latest.values()).slice(-3)) {
      toast(`Nova mensagem de ${item.contact}`, {
        description: item.preview,
        duration: 10_000,
        action: { label: 'Abrir', onClick: () => open(item) },
      });
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.visibilityState !== 'visible') {
        try {
          const notification = new Notification(`Nova mensagem de ${item.contact}`, { body: item.preview, tag: `conversation-${item.conversationId}` });
          notification.onclick = () => { window.focus(); open(item); };
        } catch {
          // The toast is enough when the browser refuses page notifications.
        }
      }
    }
  }, [open]);

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
      if (!response.ok) return;
      const feed = await response.json() as { items: MessageNotification[]; cursor: MessageNotificationCursor };
      cursorRef.current = feed.cursor;
      store(keys.cursor, feed.cursor);
      const known = new Set(itemsRef.current.map((item) => item.id));
      const fresh = feed.items.filter((item) => !known.has(item.id));
      if (fresh.length) {
        const next = [...itemsRef.current, ...fresh].slice(-MAX_KEPT);
        itemsRef.current = next;
        setItems(next);
        store(keys.items, next);
        announce(fresh);
      }
    } catch {
      // Notifications are a helper and never affect the conversations themselves.
    } finally {
      busyRef.current = false;
    }
  }, [announce, keys.cursor, keys.items]);

  useEffect(() => {
    cursorRef.current = read<MessageNotificationCursor | null>(keys.cursor, null);
    itemsRef.current = read<MessageNotification[]>(keys.items, []);
    setItems(itemsRef.current);
    setSeen(read<string[]>(keys.seen, []));
    void poll();
    const timer = window.setInterval(() => void poll(), POLL_MS);
    const onFocus = () => void poll();
    window.addEventListener('focus', onFocus);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', onFocus); };
  }, [keys, poll]);

  const unread = items.filter((item) => !seen.includes(item.id));
  const markAllSeen = () => {
    if (!unread.length) return;
    const next = Array.from(new Set([...seen, ...unread.map((item) => item.id)])).slice(-200);
    setSeen(next);
    store(keys.seen, next);
  };
  const recent = [...items].reverse();

  return (
    <DropdownMenu onOpenChange={(isOpen) => { if (isOpen) markAllSeen(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={unread.length ? `${unread.length} mensagem(ns) nova(s)` : 'Mensagens'}>
          <MessageCircle className="h-5 w-5" />
          {unread.length > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-emerald-600 px-1 text-[10px] font-semibold leading-[18px] text-white">
              {unread.length > 9 ? '9+' : unread.length}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[340px] max-w-[calc(100vw-24px)] p-0">
        <div className="p-3">
          <DropdownMenuLabel className="p-0">Mensagens recebidas</DropdownMenuLabel>
          <p className="text-xs text-muted-foreground">Clique para abrir a conversa na Inbox.</p>
        </div>
        <DropdownMenuSeparator className="m-0" />
        {recent.length === 0 ? (
          <p className="p-4 text-center text-sm text-muted-foreground">Nenhuma mensagem nova por enquanto.</p>
        ) : (
          <ul className="max-h-80 overflow-y-auto">
            {recent.map((item) => (
              <li key={item.id}>
                <button type="button" onClick={() => open(item)} className="block w-full px-3 py-2 text-left text-sm hover:bg-muted">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{item.contact}</span>
                    <span className="shrink-0 text-[11px] text-muted-foreground">{when(item.createdAt)}</span>
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">{item.preview}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

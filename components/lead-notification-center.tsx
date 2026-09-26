'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellRing, CheckCheck, Loader2, ShieldAlert, TestTube2, Trash2, Volume2, VolumeX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  mergeSeenNotificationIds,
  mergeStoredNotificationItems,
  NEW_LEAD_BROWSER_EVENT,
  notificationCursorStorageKey,
  notificationItemsStorageKey,
  notificationNativeEnabledStorageKey,
  notificationSeenStorageKey,
  notificationSoundEnabledStorageKey,
  parseSeenNotificationIds,
  parseStoredCursor,
  parseStoredNotificationItems,
  type LeadBrowserNotification,
  type LeadNotificationCursor,
  type LeadNotificationFeed,
} from '@/lib/notifications/browser-state';

const POLL_MS = 15_000;

function relativeTime(value: string) {
  const deltaSeconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  if (deltaSeconds < 60) return 'agora';
  const minutes = Math.floor(deltaSeconds / 60);
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours} h`;
  const days = Math.floor(hours / 24);
  return `há ${days} d`;
}

export function LeadNotificationCenter({ tenantId, userId }: { tenantId: string; userId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<LeadBrowserNotification[]>([]);
  const [seenIds, setSeenIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [browserPermission, setBrowserPermission] = useState<'unsupported' | NotificationPermission>('unsupported');
  const [nativeEnabled, setNativeEnabled] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const cursorRef = useRef<LeadNotificationCursor | null>(null);
  const pollingRef = useRef(false);
  const browserPermissionRef = useRef<'unsupported' | NotificationPermission>('unsupported');
  const nativeEnabledRef = useRef(false);
  const soundEnabledRef = useRef(false);
  const audioContextRef = useRef<AudioContext | null>(null);
  const serviceWorkerRef = useRef<ServiceWorkerRegistration | null>(null);
  const watchAbortRef = useRef<AbortController | null>(null);
  const deliveredIdsRef = useRef<Set<string>>(new Set());

  const cursorKey = useMemo(() => notificationCursorStorageKey(tenantId, userId), [tenantId, userId]);
  const seenKey = useMemo(() => notificationSeenStorageKey(tenantId, userId), [tenantId, userId]);
  const itemsKey = useMemo(() => notificationItemsStorageKey(tenantId, userId), [tenantId, userId]);
  const nativeEnabledKey = useMemo(() => notificationNativeEnabledStorageKey(tenantId, userId), [tenantId, userId]);
  const soundEnabledKey = useMemo(() => notificationSoundEnabledStorageKey(tenantId, userId), [tenantId, userId]);

  const persistSeen = useCallback((next: string[]) => {
    setSeenIds(next);
    try { window.localStorage.setItem(seenKey, JSON.stringify(next)); } catch {}
  }, [seenKey]);

  const persistItems = useCallback((next: LeadBrowserNotification[]) => {
    setItems(next);
    try { window.localStorage.setItem(itemsKey, JSON.stringify(next)); } catch {}
  }, [itemsKey]);

  const persistNativeEnabled = useCallback((enabled: boolean) => {
    nativeEnabledRef.current = enabled;
    setNativeEnabled(enabled);
    try { window.localStorage.setItem(nativeEnabledKey, enabled ? 'enabled' : 'disabled'); } catch {}
  }, [nativeEnabledKey]);

  const persistSoundEnabled = useCallback((enabled: boolean) => {
    soundEnabledRef.current = enabled;
    setSoundEnabled(enabled);
    try { window.localStorage.setItem(soundEnabledKey, enabled ? 'enabled' : 'disabled'); } catch {}
  }, [soundEnabledKey]);

  const playLeadSound = useCallback(async () => {
    if (!soundEnabledRef.current || typeof window === 'undefined' || !window.AudioContext) return;
    try {
      const context = audioContextRef.current || new window.AudioContext();
      audioContextRef.current = context;
      if (context.state === 'suspended') await context.resume();

      const ring = (offset: number, fundamental: number) => {
        const start = context.currentTime + offset;
        const partials = [
          { ratio: 1, gain: 0.12 },
          { ratio: 2.01, gain: 0.055 },
          { ratio: 3.9, gain: 0.025 },
        ];
        for (const partial of partials) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(fundamental * partial.ratio, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(partial.gain, start + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.7);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(start);
          oscillator.stop(start + 0.72);
        }
      };

      ring(0, 1046.5);
      ring(0.42, 1318.5);
    } catch {
      // Sound is best-effort and must never affect CRM flows.
    }
  }, []);

  const showNativeNotificationThroughWorker = useCallback(async (
    registration: ServiceWorkerRegistration,
    item: LeadBrowserNotification,
    body: string,
  ) => {
    const worker = registration.active;
    if (!worker || typeof MessageChannel === 'undefined') return false;

    return await new Promise<boolean>((resolve) => {
      const channel = new MessageChannel();
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        channel.port1.close();
        resolve(ok);
      };
      const timeout = window.setTimeout(() => finish(false), 1_800);

      channel.port1.onmessage = (event) => {
        finish(event.data?.ok === true);
      };

      try {
        worker.postMessage({
          type: 'SHOW_LEAD_NOTIFICATION',
          notification: {
            title: item.title,
            body,
            icon: '/icon.svg',
            badge: '/icon.svg',
            tag: item.id,
            data: { href: item.href },
            requireInteraction: true,
            renotify: true,
            timestamp: new Date(item.createdAt).getTime(),
          },
        }, [channel.port2]);
      } catch {
        finish(false);
      }
    });
  }, []);

  const showNativeNotification = useCallback(async (item: LeadBrowserNotification) => {
    if (typeof window === 'undefined' || !('Notification' in window) || !nativeEnabledRef.current) return;

    const permission = Notification.permission;
    browserPermissionRef.current = permission;
    if (permission !== 'granted') return;

    const details = [item.formName, item.source].filter(Boolean).join(' · ');
    const body = details ? `${item.leadName} — ${details}` : item.leadName;

    try {
      const registration = ('serviceWorker' in navigator)
        ? (serviceWorkerRef.current || await navigator.serviceWorker.ready)
        : null;

      if (registration?.active) {
        serviceWorkerRef.current = registration;

        const shownByWorker = await showNativeNotificationThroughWorker(registration, item, body);
        if (shownByWorker) {
          const active = await registration.getNotifications({ tag: item.id });
          if (active.some((notification) => notification.tag === item.id)) return;
        }

        await registration.showNotification(item.title, {
          body,
          icon: '/icon.svg',
          badge: '/icon.svg',
          tag: item.id,
          silent: false,
          requireInteraction: true,
          data: { href: item.href },
        });

        const active = await registration.getNotifications({ tag: item.id });
        if (active.some((notification) => notification.tag === item.id)) return;
      }
    } catch {
      // Fall back to the page Notification API below.
    }

    try {
      const notification = new Notification(item.title, {
        body,
        icon: '/icon.svg',
        tag: item.id,
        silent: false,
        requireInteraction: true,
      });
      notification.onclick = () => {
        window.focus();
        router.push(item.href);
        notification.close();
      };
    } catch {
      // Native browser notifications are best-effort and must never affect CRM flows.
    }
  }, [router, showNativeNotificationThroughWorker]);

  const deliverItems = useCallback((incoming: LeadBrowserNotification[]) => {
    const fresh = incoming.filter((item) => {
      if (deliveredIdsRef.current.has(item.id)) return false;
      deliveredIdsRef.current.add(item.id);
      return true;
    });
    if (!fresh.length) return;

    if (deliveredIdsRef.current.size > 250) {
      deliveredIdsRef.current = new Set(Array.from(deliveredIdsRef.current).slice(-200));
    }

    setItems((current) => {
      const next = mergeStoredNotificationItems(current, fresh);
      try { window.localStorage.setItem(itemsKey, JSON.stringify(next)); } catch {}
      return next;
    });

    void playLeadSound();
    for (const item of fresh) {
      window.dispatchEvent(new CustomEvent(NEW_LEAD_BROWSER_EVENT, { detail: item }));

      if (document.visibilityState === 'visible') {
        toast(item.title, {
          description: item.leadName,
          duration: 8_000,
          action: {
            label: 'Abrir lead',
            onClick: () => router.push(item.href),
          },
        });
      }

      void showNativeNotification(item);
    }
  }, [itemsKey, playLeadSound, router, showNativeNotification]);
  const poll = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const cursor = cursorRef.current;
      const params = new URLSearchParams();
      if (cursor) {
        params.set('after', cursor.createdAt);
        if (cursor.id) params.set('afterId', cursor.id);
      }

      const response = await fetch(`/api/notifications/leads${params.size ? `?${params.toString()}` : ''}`, {
        cache: 'no-store',
      });
      if (!response.ok) return;

      const feed = await response.json() as LeadNotificationFeed;
      cursorRef.current = feed.cursor;
      try { window.localStorage.setItem(cursorKey, JSON.stringify(feed.cursor)); } catch {}

      if (feed.items.length) deliverItems(feed.items);
    } catch {
      // Notifications are best-effort and must never affect CRM flows.
    } finally {
      pollingRef.current = false;
      setLoading(false);
    }
  }, [cursorKey, deliverItems]);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/lead-notification-sw.js')
        .then(async (registration) => {
          serviceWorkerRef.current = registration;
          try { await registration.update(); } catch {}
          try { serviceWorkerRef.current = await navigator.serviceWorker.ready; } catch {}
        })
        .catch(() => {});
    }

    try {
      cursorRef.current = parseStoredCursor(window.localStorage.getItem(cursorKey));
      setSeenIds(parseSeenNotificationIds(window.localStorage.getItem(seenKey)));
      const storedItems = parseStoredNotificationItems(window.localStorage.getItem(itemsKey));
      setItems(storedItems);
      deliveredIdsRef.current = new Set(storedItems.map((item) => item.id));
      const supported = typeof window !== 'undefined' && 'Notification' in window;
      const permission = supported ? Notification.permission : 'unsupported';
      browserPermissionRef.current = permission;
      setBrowserPermission(permission);
      const savedNative = window.localStorage.getItem(nativeEnabledKey);
      const enabled = permission === 'granted' && savedNative !== 'disabled';
      nativeEnabledRef.current = enabled;
      setNativeEnabled(enabled);

      const savedSound = window.localStorage.getItem(soundEnabledKey);
      const enabledSound = savedSound !== 'disabled';
      soundEnabledRef.current = enabledSound;
      setSoundEnabled(enabledSound);
    } catch {}
    let cancelled = false;
    const fallbackTimer = window.setInterval(() => void poll(), POLL_MS);

    const waitForNewLeads = async () => {
      if (!cursorRef.current) await poll();

      while (!cancelled) {
        const cursor = cursorRef.current;
        if (!cursor) {
          await poll();
          continue;
        }

        const params = new URLSearchParams({ after: cursor.createdAt });
        if (cursor.id) params.set('afterId', cursor.id);
        const controller = new AbortController();
        watchAbortRef.current = controller;

        try {
          const response = await fetch(`/api/notifications/leads/wait?${params.toString()}`, {
            cache: 'no-store',
            signal: controller.signal,
          });
          if (!response.ok) {
            await new Promise((resolve) => window.setTimeout(resolve, 1_500));
            continue;
          }

          const feed = await response.json() as LeadNotificationFeed;
          cursorRef.current = feed.cursor;
          try { window.localStorage.setItem(cursorKey, JSON.stringify(feed.cursor)); } catch {}
          if (feed.items.length) deliverItems(feed.items);
        } catch (error) {
          if (controller.signal.aborted || cancelled) break;
          await new Promise((resolve) => window.setTimeout(resolve, 1_500));
        } finally {
          if (watchAbortRef.current === controller) watchAbortRef.current = null;
        }
      }
    };

    void waitForNewLeads();
    return () => {
      cancelled = true;
      window.clearInterval(fallbackTimer);
      watchAbortRef.current?.abort();
      watchAbortRef.current = null;
    };
  }, [cursorKey, seenKey, itemsKey, nativeEnabledKey, soundEnabledKey, deliverItems, poll]);

  useEffect(() => {
    const refreshOnFocus = () => void poll();
    const refreshOnVisibility = () => {
      if (document.visibilityState === 'visible') void poll();
    };
    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnVisibility);
    return () => {
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnVisibility);
    };
  }, [poll]);

  useEffect(() => {
    if (!soundEnabled || typeof window === 'undefined' || !window.AudioContext) return;

    const primeAudio = () => {
      try {
        const context = audioContextRef.current || new window.AudioContext();
        audioContextRef.current = context;
        if (context.state === 'suspended') void context.resume();
      } catch {}
      window.removeEventListener('pointerdown', primeAudio);
      window.removeEventListener('keydown', primeAudio);
    };

    window.addEventListener('pointerdown', primeAudio, { once: true });
    window.addEventListener('keydown', primeAudio, { once: true });
    return () => {
      window.removeEventListener('pointerdown', primeAudio);
      window.removeEventListener('keydown', primeAudio);
    };
  }, [soundEnabled]);

  const unreadIds = useMemo(
    () => items.filter((item) => !seenIds.includes(item.id)).map((item) => item.id),
    [items, seenIds],
  );
  const unreadCount = unreadIds.length;
  const readCount = items.length - unreadCount;

  function markAllSeen() {
    if (!unreadIds.length) return;
    persistSeen(mergeSeenNotificationIds(seenIds, unreadIds));
  }

  function clearReadNotifications() {
    if (!readCount) return;
    const seen = new Set(seenIds);
    const remaining = items.filter((item) => !seen.has(item.id));
    const remainingIds = new Set(remaining.map((item) => item.id));
    persistItems(remaining);
    persistSeen(seenIds.filter((id) => remainingIds.has(id)));
    toast.success('Notificações lidas removidas.');
  }

  function openNotification(item: LeadBrowserNotification) {
    persistSeen(mergeSeenNotificationIds(seenIds, [item.id]));
    router.push(item.href);
  }

  async function requestBrowserNotifications() {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      browserPermissionRef.current = 'unsupported';
      setBrowserPermission('unsupported');
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      browserPermissionRef.current = permission;
      setBrowserPermission(permission);
      persistNativeEnabled(permission === 'granted');
      if (permission === 'granted' && 'serviceWorker' in navigator) {
        try {
          serviceWorkerRef.current = await navigator.serviceWorker.ready;
        } catch {}
      }
    } catch {
      persistNativeEnabled(false);
    }
  }

  function toggleNativeNotifications() {
    if (browserPermission !== 'granted') {
      void requestBrowserNotifications();
      return;
    }
    persistNativeEnabled(!nativeEnabled);
  }

  function toggleLeadSound() {
    const next = !soundEnabled;
    persistSoundEnabled(next);
    if (next) void playLeadSound();
  }

  async function testNativeNotification() {
    if (browserPermission !== 'granted') {
      await requestBrowserNotifications();
      return;
    }
    nativeEnabledRef.current = true;
    setNativeEnabled(true);
    try { window.localStorage.setItem(nativeEnabledKey, 'enabled'); } catch {}
    await playLeadSound();
    await showNativeNotification({
      id: `lead:test:${Date.now()}`,
      type: 'lead_created',
      leadId: 'test',
      title: 'Teste de notificação do FlipForm',
      leadName: 'As notificações estão funcionando',
      source: 'FlipForm',
      formName: 'Novo lead',
      pipelineName: 'Teste',
      stageName: 'Teste',
      assignedUserName: null,
      createdAt: new Date().toISOString(),
      href: '/leads',
    });
  }

  return (
    <DropdownMenu onOpenChange={(open) => { if (open) markAllSeen(); }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notificações de leads">
          {loading && !items.length ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : <Bell className="h-5 w-5" />}
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-red-500 px-1 text-center text-[10px] font-bold leading-4 text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[360px] max-w-[calc(100vw-24px)] p-0">
        <div className="flex items-center justify-between px-3 py-3">
          <div>
            <DropdownMenuLabel className="p-0">Notificações</DropdownMenuLabel>
            <p className="mt-0.5 text-xs text-muted-foreground">Novos leads da sua operação</p>
          </div>
          <div className="flex items-center gap-1">
            {unreadCount > 0 && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={(event) => { event.preventDefault(); markAllSeen(); }}>
                <CheckCheck className="mr-1 h-3.5 w-3.5" />Marcar como vistas
              </Button>
            )}
            {readCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                title="Limpar notificações lidas"
                aria-label="Limpar notificações lidas"
                onClick={(event) => { event.preventDefault(); clearReadNotifications(); }}
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />Limpar lidas
              </Button>
            )}
          </div>
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="px-3 py-2">
          {browserPermission === 'unsupported' ? (
            <div className="flex items-start gap-2 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Este navegador não oferece notificações nativas compatíveis.</span>
            </div>
          ) : browserPermission === 'denied' ? (
            <div className="flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>Notificações estão bloqueadas no navegador. Libere a permissão nas configurações do site para ativar.</span>
            </div>
          ) : browserPermission !== 'granted' ? (
            <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={(event) => { event.preventDefault(); void requestBrowserNotifications(); }}>
              <BellRing className="mr-2 h-4 w-4" />Ativar notificações no navegador
            </Button>
          ) : (
            <Button type="button" variant={nativeEnabled ? 'secondary' : 'outline'} size="sm" className="w-full justify-start" onClick={(event) => { event.preventDefault(); toggleNativeNotifications(); }}>
              <BellRing className="mr-2 h-4 w-4" />Notificações do navegador: {nativeEnabled ? 'ativadas' : 'desativadas'}
            </Button>
          )}
          {browserPermission === 'default' && (
            <p className="mt-1.5 px-1 text-[11px] leading-relaxed text-muted-foreground">
              Ative para receber o alerta nativo do navegador mesmo quando estiver em outra aba. A posição do aviso é controlada pelo navegador e pelo sistema operacional.
            </p>
          )}
          {browserPermission === 'granted' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-2 w-full justify-start"
              onClick={(event) => { event.preventDefault(); void testNativeNotification(); }}
            >
              <TestTube2 className="mr-2 h-4 w-4" />Testar notificação
            </Button>
          )}
          <Button
            type="button"
            variant={soundEnabled ? 'secondary' : 'outline'}
            size="sm"
            className="mt-2 w-full justify-start"
            onClick={(event) => { event.preventDefault(); toggleLeadSound(); }}
          >
            {soundEnabled ? <Volume2 className="mr-2 h-4 w-4" /> : <VolumeX className="mr-2 h-4 w-4" />}
            Som de novo lead: {soundEnabled ? 'ativado' : 'desativado'}
          </Button>
        </div>
        <DropdownMenuSeparator className="m-0" />
        <div className="max-h-[420px] overflow-y-auto">
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <Bell className="mx-auto h-7 w-7 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-medium">Nenhuma notificação nova</p>
              <p className="mt-1 text-xs text-muted-foreground">Quando um novo lead entrar no seu escopo, ele aparecerá aqui.</p>
            </div>
          ) : [...items].reverse().map((item) => {
            const unseen = !seenIds.includes(item.id);
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => openNotification(item)}
                className="flex w-full gap-3 border-b px-3 py-3 text-left last:border-b-0 hover:bg-muted/60"
              >
                <div className="mt-0.5 rounded-full bg-brand-50 p-2 text-brand-700"><BellRing className="h-4 w-4" /></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-2">
                    <p className="truncate text-sm font-semibold">{item.title}</p>
                    {unseen && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-blue-600" />}
                  </div>
                  <p className="mt-0.5 truncate text-sm">{item.leadName}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {[item.formName, item.source, item.assignedUserName].filter(Boolean).join(' · ') || item.pipelineName}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{relativeTime(item.createdAt)}</p>
                </div>
              </button>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

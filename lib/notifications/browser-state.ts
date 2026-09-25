export const NEW_LEAD_BROWSER_EVENT = 'flipform:new-lead';

export type LeadBrowserNotification = {
  id: string;
  type: 'lead_created';
  leadId: string;
  title: string;
  leadName: string;
  source: string;
  formName: string | null;
  pipelineName: string;
  stageName: string;
  assignedUserName: string | null;
  createdAt: string;
  href: string;
};

export type LeadNotificationCursor = {
  createdAt: string;
  id: string | null;
};

export type LeadNotificationFeed = {
  items: LeadBrowserNotification[];
  cursor: LeadNotificationCursor;
  hasMore?: boolean;
  readOnly: true;
};

export function notificationCursorStorageKey(tenantId: string, userId: string) {
  return `flipform:lead-notification-cursor:${tenantId}:${userId}`;
}

export function notificationSeenStorageKey(tenantId: string, userId: string) {
  return `flipform:lead-notification-seen:${tenantId}:${userId}`;
}

export function parseStoredCursor(raw: string | null): LeadNotificationCursor | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<LeadNotificationCursor>;
    if (typeof value.createdAt !== 'string' || Number.isNaN(new Date(value.createdAt).getTime())) return null;
    if (value.id !== null && typeof value.id !== 'string') return null;
    return { createdAt: value.createdAt, id: value.id ?? null };
  } catch {
    return null;
  }
}

export function parseSeenNotificationIds(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string').slice(-200);
  } catch {
    return [];
  }
}

export function mergeSeenNotificationIds(current: string[], incoming: string[]) {
  return [...new Set([...current, ...incoming])].slice(-200);
}


export function notificationItemsStorageKey(tenantId: string, userId: string) {
  return `flipform:lead-notification-items:${tenantId}:${userId}`;
}

export function parseStoredNotificationItems(raw: string | null): LeadBrowserNotification[] {
  if (!raw) return [];
  try {
    const value = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value
      .filter((item): item is LeadBrowserNotification =>
        !!item
        && item.type === 'lead_created'
        && typeof item.id === 'string'
        && typeof item.leadId === 'string'
        && typeof item.title === 'string'
        && typeof item.leadName === 'string'
        && typeof item.createdAt === 'string'
        && typeof item.href === 'string'
      )
      .slice(-50);
  } catch {
    return [];
  }
}

export function mergeStoredNotificationItems(current: LeadBrowserNotification[], incoming: LeadBrowserNotification[]) {
  const byId = new Map<string, LeadBrowserNotification>();
  for (const item of [...current, ...incoming]) byId.set(item.id, item);
  return Array.from(byId.values())
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    .slice(-50);
}


export function notificationNativeEnabledStorageKey(tenantId: string, userId: string) {
  return `flipform:lead-notification-native-enabled:${tenantId}:${userId}`;
}


export function notificationSoundEnabledStorageKey(tenantId: string, userId: string) {
  return `flipform:lead-notification-sound-enabled:${tenantId}:${userId}`;
}

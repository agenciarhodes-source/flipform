import 'server-only';
import crypto from 'crypto';

export type MetaCapiPayload = {
  pixelId: string;
  accessToken: string;
  eventName: string;
  eventId: string;
  actionSource?: 'website' | 'system_generated';
  eventSourceUrl?: string | null;
  testEventCode?: string | null;
  user?: {
    email?: string | null;
    phone?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    city?: string | null;
    state?: string | null;
    externalId?: string | null;
    fbc?: string | null;
    fbp?: string | null;
    clientIpAddress?: string | null;
    clientUserAgent?: string | null;
  };
  customData?: Record<string, unknown>;
};

export type MetaCapiSendResult = {
  ok: boolean;
  reason?: string;
  eventsReceived?: number;
  traceId?: string;
};

export function normalizeMetaText(value: string): string {
  return value.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function normalizeMetaPhone(value: string): string {
  return value.replace(/\D/g, '');
}

export function normalizeMetaEmail(value: string): string {
  const normalized = normalizeMetaText(value);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : '';
}

export function normalizeMetaCity(value: string): string {
  return normalizeMetaText(value).replace(/[^a-z0-9]/g, '');
}

export function hashMetaValue(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export type MetaUserData = Partial<Record<'em' | 'ph' | 'fn' | 'ln' | 'ct' | 'st' | 'external_id', string[]>> &
  Partial<Record<'fbc' | 'fbp' | 'client_ip_address' | 'client_user_agent', string>>;

function addHashed(data: MetaUserData, key: 'em' | 'ph' | 'fn' | 'ln' | 'ct' | 'st' | 'external_id', value: string | null | undefined, normalizer = normalizeMetaText) {
  if (!value) return;
  const normalized = normalizer(value);
  if (normalized) data[key] = [hashMetaValue(normalized)];
}

function addPlain(data: MetaUserData, key: 'fbc' | 'fbp' | 'client_ip_address' | 'client_user_agent', value: string | null | undefined) {
  const normalized = value?.trim();
  if (normalized) data[key] = normalized;
}

export function buildUserData(user: MetaCapiPayload['user']): MetaUserData {
  const data: MetaUserData = {};
  addHashed(data, 'em', user?.email, normalizeMetaEmail);
  addHashed(data, 'ph', user?.phone, normalizeMetaPhone);
  addHashed(data, 'fn', user?.firstName);
  addHashed(data, 'ln', user?.lastName);
  addHashed(data, 'ct', user?.city, normalizeMetaCity);
  addHashed(data, 'st', user?.state);
  addHashed(data, 'external_id', user?.externalId, (value) => value.trim());
  addPlain(data, 'fbc', user?.fbc);
  addPlain(data, 'fbp', user?.fbp);
  addPlain(data, 'client_ip_address', user?.clientIpAddress);
  addPlain(data, 'client_user_agent', user?.clientUserAgent);
  return data;
}

export function formatMetaCapiError(data: any, fallback: string) {
  const error = data?.error;
  if (!error) return fallback;
  const parts = [error.message ? `Meta CAPI: ${error.message}` : fallback];
  if (error.code !== undefined) parts.push(`code: ${error.code}`);
  if (error.error_subcode !== undefined) parts.push(`subcode: ${error.error_subcode}`);
  if (error.type) parts.push(`type: ${error.type}`);
  if (error.error_user_title) parts.push(`title: ${error.error_user_title}`);
  if (error.error_user_msg) parts.push(`msg: ${error.error_user_msg}`);
  if (error.fbtrace_id) parts.push(`fbtrace_id: ${error.fbtrace_id}`);
  return parts.join(' | ');
}

function finiteNonNegativeInteger(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isInteger(value)
    ? value
    : undefined;
}

function stringValue(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function parseMetaCapiSuccess(data: unknown): MetaCapiSendResult {
  const payload = data && typeof data === 'object' ? data as Record<string, unknown> : {};
  const eventsReceived = finiteNonNegativeInteger(payload.events_received);
  const traceId = stringValue(payload.fbtrace_id);

  // Meta's normal success acknowledgement includes events_received. When the
  // provider explicitly says zero events were received, a HTTP 2xx alone must
  // not be treated as a delivered conversion in FlipForm.
  if (eventsReceived === 0) {
    return {
      ok: false,
      reason: `Meta CAPI não confirmou o recebimento do evento${traceId ? ` | fbtrace_id: ${traceId}` : ''}`,
      eventsReceived,
      traceId,
    };
  }

  return {
    ok: true,
    eventsReceived,
    traceId,
  };
}

export async function sendMetaCapiEvent(payload: MetaCapiPayload): Promise<MetaCapiSendResult> {
  const body = {
    data: [
      {
        event_name: payload.eventName,
        event_time: Math.floor(Date.now() / 1000),
        event_id: payload.eventId,
        action_source: payload.actionSource || 'system_generated',
        event_source_url: payload.eventSourceUrl || undefined,
        user_data: buildUserData(payload.user),
        custom_data: payload.customData || undefined,
      },
    ],
    test_event_code: payload.testEventCode || undefined,
  };

  const res = await fetch(`https://graph.facebook.com/v19.0/${encodeURIComponent(payload.pixelId)}/events?access_token=${encodeURIComponent(payload.accessToken)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  let responseData: unknown = null;
  try {
    responseData = await res.json();
  } catch {}

  if (!res.ok) {
    const reason = formatMetaCapiError(responseData, `Meta CAPI HTTP ${res.status}`);
    return { ok: false, reason };
  }

  return parseMetaCapiSuccess(responseData);
}

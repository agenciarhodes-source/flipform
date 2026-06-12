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
  user?: { email?: string | null; phone?: string | null };
  customData?: Record<string, unknown>;
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function normalizePhone(value: string): string {
  return value.replace(/\D/g, '');
}

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildUserData(user: MetaCapiPayload['user']) {
  const data: Record<string, string[]> = {};
  if (user?.email) data.em = [sha256(normalize(user.email))];
  if (user?.phone) {
    const phone = normalizePhone(user.phone);
    if (phone) data.ph = [sha256(phone)];
  }
  return data;
}

export async function sendMetaCapiEvent(payload: MetaCapiPayload): Promise<{ ok: boolean; reason?: string }> {
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

  if (!res.ok) {
    let reason = `Meta CAPI HTTP ${res.status}`;
    try {
      const data = await res.json();
      reason = data?.error?.message ? `Meta CAPI: ${data.error.message}` : reason;
    } catch {}
    return { ok: false, reason };
  }
  return { ok: true };
}

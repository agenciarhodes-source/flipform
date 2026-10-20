import 'server-only';

import { META_PLATFORM_GRAPH_API_VERSION } from '@/lib/meta/oauth';

/**
 * Shows "digitando…" to the customer while the AI prepares the answer. Meta keeps it for up to
 * 25 seconds or until the reply arrives, and marks the customer's message as read. Best effort:
 * a failure never stops the reply.
 */
export async function showWhatsAppTyping(input: { phoneNumberId: string; accessToken: string; messageId: string }) {
  if (!/^\d{1,64}$/.test(input.phoneNumberId) || !input.messageId.startsWith('wamid.')) return false;
  try {
    const response = await fetch(`https://graph.facebook.com/${META_PLATFORM_GRAPH_API_VERSION}/${input.phoneNumberId}/messages`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: input.messageId,
        typing_indicator: { type: 'text' },
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

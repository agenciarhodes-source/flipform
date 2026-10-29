import 'server-only';

import { prisma } from '@/lib/prisma';
import { INSTAGRAM_GRAPH_VERSION } from '@/lib/meta/instagram';
import { getInstagramSendConnection } from '@/lib/meta/instagram-send-credentials';
import { normalizeInstagramUsername } from './rules';

/**
 * The @ and name of who wrote to the Direct. Meta's webhook only sends an internal id, so the
 * profile is read once from Meta (User Profile API, allowed for people who messaged the account)
 * and kept on the contact. Best effort: without it the AI still answers when released to everyone.
 */
export async function instagramSenderProfile(input: {
  tenantId: string;
  identity: { id: string; externalUserId: string; username: string | null; displayName: string | null };
  accessToken: string;
}): Promise<{ username: string | null; name: string | null }> {
  if (input.identity.username) return { username: input.identity.username, name: input.identity.displayName };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const url = new URL(`https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}/${encodeURIComponent(input.identity.externalUserId)}`);
    url.searchParams.set('fields', 'username,name');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${input.accessToken}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) return { username: null, name: input.identity.displayName };
    const data = await response.json().catch(() => ({})) as { username?: unknown; name?: unknown };
    const username = typeof data.username === 'string' ? normalizeInstagramUsername(data.username) : null;
    const name = typeof data.name === 'string' && data.name.trim() ? data.name.trim().slice(0, 120) : input.identity.displayName;
    if (username) {
      await prisma.externalContactIdentity.updateMany({
        where: { id: input.identity.id, tenantId: input.tenantId },
        data: { username, ...(name && !input.identity.displayName ? { displayName: name } : {}) },
      }).catch(() => undefined);
    }
    return { username, name };
  } catch {
    return { username: null, name: input.identity.displayName };
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Reads the @ and name of who wrote as soon as the message arrives, AI on or off, so the Direct
 * shows the person (not a number) and the AI recognizes the test profiles even in a paused chat.
 */
export async function learnInstagramSender(input: { tenantId: string; conversationId: string }) {
  const conversation = await prisma.conversation.findFirst({
    where: { id: input.conversationId, tenantId: input.tenantId, channel: 'instagram' },
    select: { externalContactIdentity: { select: { id: true, externalUserId: true, username: true, displayName: true } } },
  });
  const identity = conversation?.externalContactIdentity;
  if (!identity || identity.username) return;
  const send = await getInstagramSendConnection(input.tenantId);
  if (!send) return;
  await instagramSenderProfile({ tenantId: input.tenantId, identity, accessToken: send.accessToken });
}

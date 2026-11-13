import 'server-only';

import { prisma } from '@/lib/prisma';
import { getPlatformWhatsAppRuntimeCredentials } from './platform-settings';
import { listSendableWhatsAppTemplates } from './whatsapp-templates';
import { connectionAccessToken } from './whatsapp-connection-token';
import { whatsappNumberForConversation } from './whatsapp-conversation-number';

export class WhatsAppSendableTemplatesError extends Error {
  constructor(readonly code: 'NOT_CONNECTED' | 'PLATFORM_NOT_READY' | 'PROVIDER_UNAVAILABLE') {
    super(code);
  }
}

/**
 * The approved templates of the company's connected WhatsApp that can be sent from the Inbox.
 * With a conversation, the templates of the number that answers it (each WhatsApp Business
 * account has its own templates).
 */
export async function loadSendableWhatsAppTemplates(tenantId: string, conversationId?: string | null) {
  const [connection, credentials] = await Promise.all([
    conversationId
      ? whatsappNumberForConversation(tenantId, conversationId).catch(() => null)
      : prisma.tenantWhatsAppConnection.findFirst({
        where: { tenantId, status: 'connected' },
        orderBy: { connectedAt: 'desc' },
        select: { wabaId: true, accessTokenEncrypted: true },
      }),
    getPlatformWhatsAppRuntimeCredentials(),
  ]);
  if (!connection) throw new WhatsAppSendableTemplatesError('NOT_CONNECTED');
  if (!credentials) throw new WhatsAppSendableTemplatesError('PLATFORM_NOT_READY');
  try {
    return await listSendableWhatsAppTemplates({
      accessToken: connectionAccessToken(connection.accessTokenEncrypted) || credentials.systemUserAccessToken,
      appSecret: credentials.appSecret,
      wabaId: connection.wabaId,
    });
  } catch {
    throw new WhatsAppSendableTemplatesError('PROVIDER_UNAVAILABLE');
  }
}

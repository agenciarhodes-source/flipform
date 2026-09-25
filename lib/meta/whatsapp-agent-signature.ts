import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const WHATSAPP_AGENT_SIGNATURE_MODES = ['disabled', 'handoff', 'always'] as const;
export type WhatsAppAgentSignatureMode = (typeof WHATSAPP_AGENT_SIGNATURE_MODES)[number];

const MAX_WHATSAPP_TEXT_LENGTH = 4096;

export function isWhatsAppAgentSignatureMode(value: unknown): value is WhatsAppAgentSignatureMode {
  return typeof value === 'string'
    && (WHATSAPP_AGENT_SIGNATURE_MODES as readonly string[]).includes(value);
}

function schemaUnavailable(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError
    && (error.code === 'P2021' || error.code === 'P2022');
}

export async function getWhatsAppAgentSignatureSettings(tenantId: string): Promise<{
  mode: WhatsAppAgentSignatureMode;
  schemaReady: boolean;
}> {
  try {
    const settings = await prisma.tenantWhatsAppSettings.findUnique({
      where: { tenantId },
      select: { agentSignatureMode: true },
    });
    const mode = isWhatsAppAgentSignatureMode(settings?.agentSignatureMode)
      ? settings.agentSignatureMode
      : 'disabled';
    return { mode, schemaReady: true };
  } catch (error) {
    if (schemaUnavailable(error)) return { mode: 'disabled', schemaReady: false };
    throw error;
  }
}

function cleanPublicName(value: string) {
  return value
    .replace(/[\r\n*_~`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function buildPublicAgentSignature(input: {
  mode: WhatsAppAgentSignatureMode;
  senderUserId: string;
  senderName: string;
  previousOutboundSenderId: string | null;
  text: string;
}): {
  signature: string | null;
  skippedReason: 'message_limit' | null;
} {
  if (input.mode === 'disabled') return { signature: null, skippedReason: null };

  const shouldSign = input.mode === 'always'
    || input.previousOutboundSenderId !== input.senderUserId;
  if (!shouldSign) return { signature: null, skippedReason: null };

  const publicName = cleanPublicName(input.senderName) || 'Atendente';
  const signature = `*${publicName} · Atendente*`;
  const providerLength = signature.length + 1 + input.text.length;
  if (providerLength > MAX_WHATSAPP_TEXT_LENGTH) {
    // Preserve the customer's full message rather than silently truncating it.
    return { signature: null, skippedReason: 'message_limit' };
  }

  return { signature, skippedReason: null };
}

export function isWhatsAppAgentSignatureSchemaUnavailable(error: unknown) {
  return schemaUnavailable(error);
}

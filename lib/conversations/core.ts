import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export type ConversationChannel = 'whatsapp' | 'instagram';
export type ConversationProvider = 'meta';
export type ConversationStatus = 'open' | 'pending' | 'resolved';
export type MessageDirection = 'inbound' | 'outbound';
export type MessageType = 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'interactive' | 'system' | 'unknown';
export type MessageStatus = 'received' | 'queued' | 'sent' | 'delivered' | 'read' | 'failed';

const CHANNELS = new Set<ConversationChannel>(['whatsapp', 'instagram']);
const PROVIDERS = new Set<ConversationProvider>(['meta']);

function required(value: string, field: string) {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${field} is required`);
  return normalized;
}

function optional(value: string | null | undefined) {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

function assertChannel(channel: string): asserts channel is ConversationChannel {
  if (!CHANNELS.has(channel as ConversationChannel)) throw new Error('Unsupported conversation channel');
}

function assertProvider(provider: string): asserts provider is ConversationProvider {
  if (!PROVIDERS.has(provider as ConversationProvider)) throw new Error('Unsupported conversation provider');
}

function isUniqueViolation(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export type RecordInboundMessageInput = {
  tenantId: string;
  channel: ConversationChannel;
  provider?: ConversationProvider;
  externalUserId: string;
  externalMessageId: string;
  username?: string | null;
  displayName?: string | null;
  phone?: string | null;
  email?: string | null;
  text?: string | null;
  type?: MessageType;
  providerTimestamp?: Date | null;
  metadata?: Prisma.InputJsonValue;
};

async function getExistingInboundMessage(input: {
  tenantId: string;
  provider: ConversationProvider;
  channel: ConversationChannel;
  externalMessageId: string;
}) {
  return prisma.message.findFirst({
    where: {
      tenantId: input.tenantId,
      provider: input.provider,
      channel: input.channel,
      externalMessageId: input.externalMessageId,
      direction: 'inbound',
    },
    include: { conversation: { include: { externalContactIdentity: true } } },
  });
}

export async function recordInboundMessage(rawInput: RecordInboundMessageInput) {
  const tenantId = required(rawInput.tenantId, 'tenantId');
  const externalUserId = required(rawInput.externalUserId, 'externalUserId');
  const externalMessageId = required(rawInput.externalMessageId, 'externalMessageId');
  const provider = rawInput.provider ?? 'meta';
  const channel = rawInput.channel;
  assertProvider(provider);
  assertChannel(channel);

  const existing = await getExistingInboundMessage({ tenantId, provider, channel, externalMessageId });
  if (existing) {
    return {
      identity: existing.conversation.externalContactIdentity,
      conversation: existing.conversation,
      message: existing,
      duplicate: true as const,
    };
  }

  const timestamp = rawInput.providerTimestamp ?? new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const identity = await tx.externalContactIdentity.upsert({
        where: {
          tenant_provider_channel_external_user: {
            tenantId,
            provider,
            channel,
            externalUserId,
          },
        },
        create: {
          tenantId,
          provider,
          channel,
          externalUserId,
          username: optional(rawInput.username),
          displayName: optional(rawInput.displayName),
          phone: optional(rawInput.phone),
          email: optional(rawInput.email),
          metadata: rawInput.metadata,
          lastSeenAt: timestamp,
        },
        update: {
          username: optional(rawInput.username),
          displayName: optional(rawInput.displayName),
          phone: optional(rawInput.phone),
          email: optional(rawInput.email),
          ...(rawInput.metadata === undefined ? {} : { metadata: rawInput.metadata }),
          lastSeenAt: timestamp,
        },
      });

      const conversation = await tx.conversation.upsert({
        where: {
          tenant_provider_channel_identity: {
            tenantId,
            provider,
            channel,
            externalContactIdentityId: identity.id,
          },
        },
        create: {
          tenantId,
          provider,
          channel,
          externalContactIdentityId: identity.id,
          status: 'open',
          startedAt: timestamp,
        },
        update: {},
      });

      const message = await tx.message.create({
        data: {
          tenantId,
          conversationId: conversation.id,
          provider,
          channel,
          externalMessageId,
          direction: 'inbound',
          type: rawInput.type ?? 'text',
          text: rawInput.text ?? null,
          status: 'received',
          senderExternalId: externalUserId,
          providerTimestamp: timestamp,
          metadata: rawInput.metadata,
        },
      });

      const updatedConversation = await tx.conversation.update({
        where: { id: conversation.id },
        data: {
          status: conversation.status === 'resolved' ? 'open' : conversation.status,
          resolvedAt: conversation.status === 'resolved' ? null : conversation.resolvedAt,
          lastMessageAt: timestamp,
          lastInboundAt: timestamp,
          unreadCount: { increment: 1 },
        },
      });

      return { identity, conversation: updatedConversation, message, duplicate: false as const };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const duplicate = await getExistingInboundMessage({ tenantId, provider, channel, externalMessageId });
    if (!duplicate) throw error;
    return {
      identity: duplicate.conversation.externalContactIdentity,
      conversation: duplicate.conversation,
      message: duplicate,
      duplicate: true as const,
    };
  }
}

export type RecordOutboundMessageInput = {
  tenantId: string;
  conversationId: string;
  externalMessageId: string;
  text?: string | null;
  type?: MessageType;
  status?: MessageStatus;
  sentByUserId?: string | null;
  providerTimestamp?: Date | null;
  metadata?: Prisma.InputJsonValue;
};

export async function recordOutboundMessage(rawInput: RecordOutboundMessageInput) {
  const tenantId = required(rawInput.tenantId, 'tenantId');
  const conversationId = required(rawInput.conversationId, 'conversationId');
  const externalMessageId = required(rawInput.externalMessageId, 'externalMessageId');

  const conversation = await prisma.conversation.findFirst({ where: { id: conversationId, tenantId } });
  if (!conversation) throw new Error('Conversation not found for tenant');

  const existing = await prisma.message.findFirst({
    where: {
      tenantId,
      provider: conversation.provider,
      channel: conversation.channel,
      externalMessageId,
      direction: 'outbound',
    },
  });
  if (existing) return { conversation, message: existing, duplicate: true as const };

  if (rawInput.sentByUserId) {
    const membership = await prisma.tenantUser.findFirst({
      where: { tenantId, userId: rawInput.sentByUserId, status: 'active' },
      select: { id: true },
    });
    if (!membership) throw new Error('Sender is not an active tenant user');
  }

  const timestamp = rawInput.providerTimestamp ?? new Date();

  try {
    return await prisma.$transaction(async (tx) => {
      const message = await tx.message.create({
        data: {
          tenantId,
          conversationId,
          provider: conversation.provider,
          channel: conversation.channel,
          externalMessageId,
          direction: 'outbound',
          type: rawInput.type ?? 'text',
          text: rawInput.text ?? null,
          status: rawInput.status ?? 'sent',
          sentByUserId: rawInput.sentByUserId ?? null,
          providerTimestamp: timestamp,
          metadata: rawInput.metadata,
        },
      });
      const updatedConversation = await tx.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: timestamp, lastOutboundAt: timestamp },
      });
      return { conversation: updatedConversation, message, duplicate: false as const };
    });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const duplicate = await prisma.message.findFirst({
      where: {
        tenantId,
        provider: conversation.provider,
        channel: conversation.channel,
        externalMessageId,
        direction: 'outbound',
      },
    });
    if (!duplicate) throw error;
    return { conversation, message: duplicate, duplicate: true as const };
  }
}

export async function linkConversationToLead(input: { tenantId: string; conversationId: string; leadId: string }) {
  const tenantId = required(input.tenantId, 'tenantId');
  const conversationId = required(input.conversationId, 'conversationId');
  const leadId = required(input.leadId, 'leadId');

  return prisma.$transaction(async (tx) => {
    const conversation = await tx.conversation.findFirst({ where: { id: conversationId, tenantId } });
    if (!conversation) throw new Error('Conversation not found for tenant');
    const lead = await tx.lead.findFirst({ where: { id: leadId, tenantId }, select: { id: true } });
    if (!lead) throw new Error('Lead not found for tenant');

    const updatedConversation = await tx.conversation.update({
      where: { id: conversation.id },
      data: { leadId },
    });
    await tx.externalContactIdentity.updateMany({
      where: { id: conversation.externalContactIdentityId, tenantId },
      data: { leadId },
    });
    return updatedConversation;
  });
}

export async function assignConversation(input: { tenantId: string; conversationId: string; userId: string | null }) {
  const tenantId = required(input.tenantId, 'tenantId');
  const conversationId = required(input.conversationId, 'conversationId');

  if (input.userId) {
    const membership = await prisma.tenantUser.findFirst({
      where: { tenantId, userId: input.userId, status: 'active' },
      select: { id: true },
    });
    if (!membership) throw new Error('Assignee is not an active tenant user');
  }

  const updated = await prisma.conversation.updateMany({
    where: { id: conversationId, tenantId },
    data: { assignedTo: input.userId },
  });
  if (updated.count !== 1) throw new Error('Conversation not found for tenant');
  return prisma.conversation.findFirstOrThrow({ where: { id: conversationId, tenantId } });
}

export async function resolveConversation(input: { tenantId: string; conversationId: string }) {
  const tenantId = required(input.tenantId, 'tenantId');
  const conversationId = required(input.conversationId, 'conversationId');
  const resolvedAt = new Date();
  const updated = await prisma.conversation.updateMany({
    where: { id: conversationId, tenantId },
    data: { status: 'resolved', resolvedAt, unreadCount: 0 },
  });
  if (updated.count !== 1) throw new Error('Conversation not found for tenant');
  return prisma.conversation.findFirstOrThrow({ where: { id: conversationId, tenantId } });
}

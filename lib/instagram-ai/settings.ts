import 'server-only';

import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { requireFlipAiAccess } from '@/lib/flip-ai/access';
import { normalizeInstagramUsername } from './rules';

/**
 * How the Flip AI answers the Direct of each connected Instagram account. Global for every
 * company: one row per account, switched off until the company turns it on.
 */
export const instagramAiSettingsInputSchema = z.object({
  connectionId: z.string().trim().min(1).max(128),
  enabled: z.boolean(),
  agentId: z.string().trim().min(1).max(128).nullable(),
  liveEnabled: z.boolean(),
  testUsernames: z.array(z.string().trim().min(1).max(40)).max(20),
  dailyCreditLimit: z.number().int().min(1).max(10_000_000).nullable(),
  resumeAfterHours: z.number().int().min(1).max(720).nullable(),
  introduction: z.string().trim().max(120).nullable(),
}).strict();
export type InstagramAiSettingsInput = z.infer<typeof instagramAiSettingsInputSchema>;

export class InstagramAiSettingsError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

/** The connected Instagram accounts of the company, each with its settings, and the agents that can answer. */
export async function getInstagramAiWorkspace(session: SessionPayload) {
  const access = await requireFlipAiAccess(prisma, session);
  const [connections, agents] = await Promise.all([
    prisma.tenantInstagramConnection.findMany({
      where: { tenantId: access.tenantId, status: 'connected' },
      orderBy: { connectedAt: 'asc' },
      select: {
        id: true,
        username: true,
        aiSettings: {
          select: {
            enabled: true, agentId: true, liveEnabled: true, testUsernames: true,
            dailyCreditLimit: true, resumeAfterHours: true, introduction: true, updatedAt: true,
          },
        },
      },
    }),
    prisma.flipAiAgent.findMany({
      where: { tenantId: access.tenantId, status: 'published' },
      orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }),
  ]);

  return {
    agents,
    accounts: connections.map((connection) => {
      const settings = connection.aiSettings;
      return {
        connectionId: connection.id,
        username: connection.username,
        settings: {
          enabled: settings?.enabled ?? false,
          agentId: settings?.agentId ?? null,
          liveEnabled: settings?.liveEnabled ?? false,
          testUsernames: settings?.testUsernames ?? [],
          dailyCreditLimit: settings?.dailyCreditLimit ?? null,
          resumeAfterHours: settings?.resumeAfterHours ?? null,
          introduction: settings?.introduction ?? null,
          updatedAt: settings?.updatedAt?.toISOString() ?? null,
        },
      };
    }),
  };
}

/** Saves the settings of one Instagram account of the company and records who changed what. */
export async function saveInstagramAiSettings(session: SessionPayload, input: InstagramAiSettingsInput) {
  const access = await requireFlipAiAccess(prisma, session);
  const connection = await prisma.tenantInstagramConnection.findFirst({
    where: { id: input.connectionId, tenantId: access.tenantId, status: 'connected' },
    select: { id: true, aiSettings: true },
  });
  if (!connection) throw new InstagramAiSettingsError(404, 'Conta do Instagram não encontrada nesta empresa.');

  if (input.agentId) {
    const agent = await prisma.flipAiAgent.findFirst({
      where: { id: input.agentId, tenantId: access.tenantId, status: 'published' },
      select: { id: true },
    });
    if (!agent) throw new InstagramAiSettingsError(400, 'Escolha um atendente publicado do Flip AI desta empresa.');
  }
  if (input.enabled && !input.agentId) {
    throw new InstagramAiSettingsError(400, 'Para ligar a IA no Instagram, escolha o atendente que vai responder.');
  }

  const testUsernames = Array.from(new Set(input.testUsernames.map(normalizeInstagramUsername).filter((name): name is string => Boolean(name))));
  if (testUsernames.length !== input.testUsernames.filter((name) => name.trim()).length) {
    throw new InstagramAiSettingsError(400, 'Algum perfil de teste é inválido. Use o @ do Instagram, por exemplo @maria.silva.');
  }

  const data = {
    enabled: input.enabled,
    agentId: input.agentId,
    liveEnabled: input.liveEnabled,
    testUsernames,
    dailyCreditLimit: input.dailyCreditLimit,
    resumeAfterHours: input.resumeAfterHours,
    introduction: input.introduction?.replace(/\s+/g, ' ').trim() || null,
    updatedBy: access.userId,
  };
  const saved = await prisma.tenantInstagramAiSettings.upsert({
    where: { connectionId: connection.id },
    create: { tenantId: access.tenantId, connectionId: connection.id, ...data },
    update: data,
  });

  const before = connection.aiSettings;
  await prisma.auditLog.create({
    data: {
      tenantId: access.tenantId,
      userId: access.userId,
      entityType: 'tenant_instagram_ai_settings',
      entityId: saved.id,
      action: 'instagram_ai.settings_updated',
      metadata: {
        connectionId: connection.id,
        before: before ? {
          enabled: before.enabled, agentId: before.agentId, liveEnabled: before.liveEnabled,
          testUsernames: before.testUsernames.length, dailyCreditLimit: before.dailyCreditLimit,
        } : null,
        after: {
          enabled: saved.enabled, agentId: saved.agentId, liveEnabled: saved.liveEnabled,
          testUsernames: saved.testUsernames.length, dailyCreditLimit: saved.dailyCreditLimit,
        },
      },
    },
  }).catch(() => undefined);

  return saved;
}

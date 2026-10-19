import 'server-only';

import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import type { SessionPayload } from '@/lib/auth';
import { requireFlipAiAccess } from '@/lib/flip-ai/access';

/**
 * How the Flip AI answers on each connected WhatsApp number. This only stores the choices;
 * nothing answers customers until the WhatsApp attendance itself is released.
 */
export const WHATSAPP_AI_SCHEDULE_MODES = ['always', 'outside_hours', 'no_reply'] as const;
export type WhatsAppAiScheduleMode = (typeof WHATSAPP_AI_SCHEDULE_MODES)[number];
export const WHATSAPP_AI_TIMEZONE = 'America/Sao_Paulo';

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato HH:MM.');

export const businessHoursSchema = z.object({
  /** 0 = domingo ... 6 = sábado. */
  days: z.array(z.number().int().min(0).max(6)).max(7),
  start: time,
  end: time,
}).strict().refine((value) => value.start < value.end, { message: 'O fim do expediente precisa ser depois do início.' });
export type WhatsAppAiBusinessHours = z.infer<typeof businessHoursSchema>;

export const DEFAULT_BUSINESS_HOURS: WhatsAppAiBusinessHours = { days: [1, 2, 3, 4, 5], start: '08:00', end: '18:00' };

export const whatsappAiSettingsInputSchema = z.object({
  connectionId: z.string().trim().min(1).max(128),
  enabled: z.boolean(),
  agentId: z.string().trim().min(1).max(128).nullable(),
  scheduleMode: z.enum(WHATSAPP_AI_SCHEDULE_MODES),
  businessHours: businessHoursSchema,
  noReplyMinutes: z.number().int().min(1).max(1440),
  dailyCreditLimit: z.number().int().min(1).max(10_000_000).nullable(),
  resumeAfterHours: z.number().int().min(1).max(720).nullable().optional().default(null),
}).strict();
export type WhatsAppAiSettingsInput = z.infer<typeof whatsappAiSettingsInputSchema>;

export class WhatsAppAiSettingsError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function parseBusinessHours(value: Prisma.JsonValue | null): WhatsAppAiBusinessHours {
  const parsed = businessHoursSchema.safeParse(value);
  return parsed.success ? parsed.data : DEFAULT_BUSINESS_HOURS;
}

/** The connected numbers of the company, each with its settings, and the agents that can answer. */
export async function getWhatsAppAiWorkspace(session: SessionPayload) {
  const access = await requireFlipAiAccess(prisma, session);
  const [connections, agents] = await Promise.all([
    prisma.tenantWhatsAppConnection.findMany({
      where: { tenantId: access.tenantId, status: 'connected' },
      orderBy: { connectedAt: 'asc' },
      select: {
        id: true,
        displayPhoneNumber: true,
        verifiedName: true,
        aiSettings: {
          select: {
            enabled: true, agentId: true, scheduleMode: true, businessHours: true,
            noReplyMinutes: true, dailyCreditLimit: true, resumeAfterHours: true, updatedAt: true,
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
    numbers: connections.map((connection) => {
      const settings = connection.aiSettings;
      return {
        connectionId: connection.id,
        phone: connection.displayPhoneNumber,
        name: connection.verifiedName,
        settings: {
          enabled: settings?.enabled ?? false,
          agentId: settings?.agentId ?? null,
          scheduleMode: (settings?.scheduleMode as WhatsAppAiScheduleMode) || 'always',
          businessHours: parseBusinessHours(settings?.businessHours ?? null),
          noReplyMinutes: settings?.noReplyMinutes ?? 10,
          dailyCreditLimit: settings?.dailyCreditLimit ?? null,
          resumeAfterHours: settings?.resumeAfterHours ?? null,
          updatedAt: settings?.updatedAt?.toISOString() ?? null,
        },
      };
    }),
  };
}

/** Saves the settings of one number of the company and records who changed what. */
export async function saveWhatsAppAiSettings(session: SessionPayload, input: WhatsAppAiSettingsInput) {
  const access = await requireFlipAiAccess(prisma, session);
  const connection = await prisma.tenantWhatsAppConnection.findFirst({
    where: { id: input.connectionId, tenantId: access.tenantId },
    select: { id: true, aiSettings: true },
  });
  if (!connection) throw new WhatsAppAiSettingsError(404, 'Número de WhatsApp não encontrado nesta empresa.');

  if (input.agentId) {
    const agent = await prisma.flipAiAgent.findFirst({
      where: { id: input.agentId, tenantId: access.tenantId, status: 'published' },
      select: { id: true },
    });
    if (!agent) throw new WhatsAppAiSettingsError(400, 'Escolha um agente publicado do Flip AI desta empresa.');
  }
  if (input.enabled && !input.agentId) {
    throw new WhatsAppAiSettingsError(400, 'Para ligar a IA neste número, escolha o agente que vai atender.');
  }
  if (input.scheduleMode === 'outside_hours' && input.businessHours.days.length === 0) {
    throw new WhatsAppAiSettingsError(400, 'Marque ao menos um dia de expediente.');
  }

  const data = {
    enabled: input.enabled,
    agentId: input.agentId,
    scheduleMode: input.scheduleMode,
    businessHours: input.businessHours as Prisma.InputJsonValue,
    noReplyMinutes: input.noReplyMinutes,
    dailyCreditLimit: input.dailyCreditLimit,
    resumeAfterHours: input.resumeAfterHours,
    updatedBy: access.userId,
  };
  const saved = await prisma.tenantWhatsAppAiSettings.upsert({
    where: { connectionId: connection.id },
    create: { tenantId: access.tenantId, connectionId: connection.id, ...data },
    update: data,
  });

  const before = connection.aiSettings;
  await prisma.auditLog.create({
    data: {
      tenantId: access.tenantId,
      userId: access.userId,
      entityType: 'tenant_whatsapp_ai_settings',
      entityId: saved.id,
      action: 'whatsapp_ai.settings_updated',
      metadata: {
        connectionId: connection.id,
        before: before ? {
          enabled: before.enabled, agentId: before.agentId, scheduleMode: before.scheduleMode,
          noReplyMinutes: before.noReplyMinutes, dailyCreditLimit: before.dailyCreditLimit,
        } : null,
        after: {
          enabled: saved.enabled, agentId: saved.agentId, scheduleMode: saved.scheduleMode,
          noReplyMinutes: saved.noReplyMinutes, dailyCreditLimit: saved.dailyCreditLimit,
        },
      },
    },
  }).catch(() => undefined);

  return saved;
}

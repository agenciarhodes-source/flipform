import { z } from 'zod';
import { funnelEventNames } from '@/lib/tracking';
import { whatsappMatchTypes } from '@/lib/tracking/whatsapp-funnel';

export const whatsappTriggerSchema = z.object({
  name: z.string().trim().min(1, 'Nome obrigatório.').max(120),
  orderIndex: z.coerce.number().int().min(0).default(0),
  triggerPhrase: z.string().trim().min(1, 'Frase-gatilho obrigatória.').max(500),
  matchType: z.enum(whatsappMatchTypes).default('exact'),
  eventName: z.enum(funnelEventNames),
  customEventName: z.string().trim().max(64).optional().or(z.literal('')),
  conversionValue: z.coerce.number().nonnegative().optional().nullable(),
  currency: z.string().trim().length(3).default('BRL'),
  pipelineId: z.string().optional().nullable().or(z.literal('')),
  stageId: z.string().optional().nullable().or(z.literal('')),
  oncePerLead: z.boolean().default(true),
  enabled: z.boolean().default(true),
});

export type WhatsAppTriggerInput = z.infer<typeof whatsappTriggerSchema>;

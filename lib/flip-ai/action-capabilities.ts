import { z } from 'zod';

export const FLIP_AI_ACTION_CAPABILITIES_VERSION = '2026-10-05.1';

export const flipAiActionCapabilitiesSchema = z.object({
  inPersonService: z.boolean().default(false),
  customerVisit: z.boolean().default(false),
  productDemo: z.boolean().default(false),
  inPersonScheduling: z.boolean().default(false),
}).strict();

export type FlipAiActionCapabilities = z.output<typeof flipAiActionCapabilitiesSchema>;

export const EMPTY_FLIP_AI_ACTION_CAPABILITIES: FlipAiActionCapabilities = {
  inPersonService: false,
  customerVisit: false,
  productDemo: false,
  inPersonScheduling: false,
};

export function parseFlipAiActionCapabilities(value: unknown): FlipAiActionCapabilities {
  const parsed = flipAiActionCapabilitiesSchema.safeParse(value);
  return parsed.success ? parsed.data : { ...EMPTY_FLIP_AI_ACTION_CAPABILITIES };
}

export function hasAnyFlipAiActionCapability(capabilities: FlipAiActionCapabilities) {
  return Object.values(capabilities).some(Boolean);
}

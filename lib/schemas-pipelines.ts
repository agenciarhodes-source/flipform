import { z } from 'zod';

export const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export const pipelineCreateSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').max(80),
});

export const pipelineUpdateSchema = z.object({
  name: z.string().min(2).max(80).optional(),
  isDefault: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});

export const stageCreateSchema = z.object({
  name: z.string().min(1).max(60),
  color: z.string().regex(HEX_COLOR, 'Cor inválida (use #RRGGBB)').optional(),
});

export const stageUpdateSchema = z.object({
  name: z.string().min(1).max(60).optional(),
  color: z.string().regex(HEX_COLOR, 'Cor inválida').optional(),
  isArchived: z.boolean().optional(),
});

export const stagesReorderSchema = z.object({
  stageIds: z.array(z.string().uuid()).min(1),
});

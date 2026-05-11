import { z } from 'zod';

export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

export const tenantUpdateSchema = z.object({
  name: z.string().min(2, 'Nome muito curto').max(80).optional(),
  slug: z.string()
    .min(3, 'Slug muito curto (mínimo 3 caracteres)')
    .max(40, 'Slug muito longo')
    .regex(SLUG_REGEX, 'Slug deve conter apenas letras minúsculas, números e hífens (ex: minha-empresa)')
    .optional(),
  primaryColor: z.string().regex(HEX_COLOR_REGEX, 'Cor inválida. Use formato #RRGGBB').optional(),
  logoUrl: z.union([z.string().url('URL inválida'), z.literal('')]).optional().nullable(),
}).refine((d) => Object.keys(d).length > 0, { message: 'Nenhum campo para atualizar' });

export type TenantUpdateInput = z.infer<typeof tenantUpdateSchema>;

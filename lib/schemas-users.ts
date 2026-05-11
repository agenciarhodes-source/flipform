import { z } from 'zod';

export const ROLE_VALUES = ['owner', 'admin', 'manager', 'agent', 'viewer'] as const;
export const roleSchema = z.enum(ROLE_VALUES);

export const inviteCreateSchema = z.object({
  email: z.string().email('E-mail inválido'),
  role: roleSchema,
});

export const userCreateSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  role: roleSchema,
});

export const userUpdateSchema = z.object({
  name: z.string().min(2).optional(),
  role: roleSchema.optional(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const inviteAcceptSchema = z.object({
  name: z.string().min(2),
  password: z.string().min(6),
});

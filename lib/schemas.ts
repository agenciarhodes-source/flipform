import { z } from 'zod';

export const registerSchema = z.object({
  companyName: z.string().min(2, 'Nome da empresa muito curto'),
  name: z.string().min(2, 'Informe seu nome'),
  email: z.string().email('E-mail inválido'),
  password: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
});

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Informe a senha'),
});

export const fieldTypeEnum = z.enum([
  'short_text',
  'long_text',
  'name',
  'email',
  'phone',
  'number',
  'date',
  'document',
  'single_select',
  'multi_select',
  'checkbox',
  'dropdown',
  'rating',
  'file',
  'hidden',
  'url',
  'city_state',
]);

export const formFieldSchema = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  placeholder: z.string().optional().nullable(),
  description: z.string().optional().nullable(),
  fieldType: fieldTypeEnum,
  options: z.array(z.string()).optional().nullable(),
  isRequired: z.boolean().default(false),
  orderIndex: z.number().int(),
});

export const formCreateSchema = z.object({
  name: z.string().min(1),
  publicTitle: z.string().min(1),
  publicDescription: z.string().optional().nullable(),
  primaryColor: z.string().optional(),
  bgColor: z.string().optional().nullable(),
  buttonColor: z.string().optional().nullable(),
  textColor: z.string().optional().nullable(),
  theme: z.enum(['light', 'dark']).optional(),
  coverImageUrl: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  successMessage: z.string().optional(),
  pipelineId: z.string().optional(),
  initialStageId: z.string().optional(),
  isActive: z.boolean().optional(),
  fields: z.array(formFieldSchema).default([]),
});

export const leadCreateSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional().nullable(),
  phone: z.string().optional().nullable(),
  pipelineId: z.string(),
  stageId: z.string(),
  source: z.string().optional(),
});

export const publicSubmitSchema = z.object({
  answers: z
    .array(
      z
        .object({
          fieldId: z.string().min(1, 'fieldId obrigatório'),
          // label é opcional — derivamos do form no servidor por segurança
          label: z.string().optional(),
          // aceita tanto `value` quanto `answer` como nome do valor
          value: z.any().optional(),
          answer: z.any().optional(),
        })
        .transform((a) => ({
          fieldId: a.fieldId,
          label: a.label,
          value: a.value !== undefined ? a.value : a.answer,
        })),
    )
    .default([]),
});


export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Informe a senha atual.'),
  newPassword: z.string().min(8, 'A nova senha deve ter no mínimo 8 caracteres.'),
  confirmNewPassword: z.string().min(8, 'Confirme a nova senha.'),
});

export type FieldType = z.infer<typeof fieldTypeEnum>;

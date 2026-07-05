import { z } from 'zod';
import { MANUAL_LEAD_SOURCE_VALUES } from './leads';
import { isValidBrazilCity, isValidBrazilState, normalizeBrazilCity, normalizeBrazilState } from './brazil-locations';

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
  'phone_br',
  'number',
  'date',
  'document',
  'cpf',
  'cnpj',
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
  options: z.array(z.union([z.string(), z.object({ id: z.string().optional(), label: z.string(), qualifies: z.boolean().optional() })])).optional().nullable(),
  validationRules: z.object({ selectionMode: z.enum(['single', 'multiple']).optional(), isQualifier: z.boolean().optional(), qualificationMode: z.enum(['any', 'all']).optional() }).passthrough().optional().nullable(),
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
  disqualificationSettings: z.object({
    title: z.string().optional(),
    message: z.string().optional(),
    buttonText: z.string().optional(),
    redirectUrl: z.string().optional().nullable(),
  }).optional().nullable(),
  pipelineId: z.string().optional(),
  initialStageId: z.string().optional(),
  isActive: z.boolean().optional(),
  fields: z.array(formFieldSchema).default([]),
});

export const leadCreateSchema = z.object({
  name: z.string().min(1, 'Informe o nome do lead.'),
  email: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  source: z.string().refine((source) => MANUAL_LEAD_SOURCE_VALUES.includes(source as any), 'Selecione a origem do lead.'),
  pipelineId: z.string().min(1, 'Selecione o pipeline.'),
  stageId: z.string().min(1, 'Selecione a etapa.'),
  assignedTo: z.string().optional().nullable(),
  temperature: z.enum(['cold', 'warm', 'hot']).default('cold'),
  saleValueCents: z.number().int().min(0).optional().nullable(),
  state: z.string().length(2, 'Estado inválido.').optional().nullable(),
  city: z.string().min(1).max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
}).superRefine((value, ctx) => {
  const state = value.state ? normalizeBrazilState(value.state) : null;
  if (value.state && !state) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['state'], message: 'Estado inválido.' });
  if (value.city && !state) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['state'], message: 'Selecione o estado.' });
  if (value.city && state && !normalizeBrazilCity(state, value.city)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['city'], message: 'Cidade inválida para o estado selecionado.' });
});

export const leadLocationSchema = z.object({
  state: z.string().length(2, 'Estado inválido.').optional().nullable(),
  city: z.string().min(1).max(100).optional().nullable(),
}).superRefine((value, ctx) => {
  if (!value.state && value.city) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['state'], message: 'Selecione o estado.' });
  if (value.state && !isValidBrazilState(value.state)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['state'], message: 'Estado inválido.' });
  if (value.state && value.city && !isValidBrazilCity(value.state, value.city)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['city'], message: 'Cidade inválida para o estado selecionado.' });
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

export const requestCodeSchema = z.object({
  email: z.string().email('E-mail inválido'),
  tenantId: z.string().optional(),
});

export const verifyCodeSchema = z.object({
  email: z.string().email('E-mail inválido'),
  code: z.string().regex(/^\d{6}$/, 'Código inválido'),
  tenantId: z.string().optional(),
});

export const completeOnboardingSchema = z.object({
  onboardingToken: z.string().min(10),
  password: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
  confirmPassword: z.string().min(8, 'Senha deve ter ao menos 8 caracteres'),
});

export type FieldType = z.infer<typeof fieldTypeEnum>;

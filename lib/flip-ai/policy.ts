import { z } from 'zod';

export const FLIP_AI_PLAN_SLUGS = ['premium', 'premium-pro'] as const;
type Plan = { slug: string | null; isActive: boolean } | null;
export function hasFlipAiPlan(plan: Plan): boolean {
  return !!plan?.isActive && FLIP_AI_PLAN_SLUGS.some((slug) => slug === plan.slug);
}
type FlipAiBillingInput = {
  tenantStatus: string;
  plan: Plan;
  subscription?: { status: string; gracePeriodEndsAt: Date | null; plan: Plan } | null;
  now?: Date;
};

export function canServeFlipAiPublic(input: FlipAiBillingInput): boolean {
  if (!['active', 'trial', 'past_due'].includes(input.tenantStatus) || !hasFlipAiPlan(input.plan)) return false;
  const sub = input.subscription;
  if (sub && (!hasFlipAiPlan(sub.plan) || !['active', 'trialing', 'courtesy', 'past_due'].includes(sub.status))) return false;
  if (input.tenantStatus === 'past_due' || sub?.status === 'past_due') {
    return !!sub?.gracePeriodEndsAt && sub.gracePeriodEndsAt.getTime() > (input.now || new Date()).getTime();
  }
  return true;
}

export function canServeFlipAiPilot(input: Pick<FlipAiBillingInput, 'tenantStatus' | 'subscription'>): boolean {
  if (!['active', 'trial'].includes(input.tenantStatus)) return false;
  return !input.subscription
    || ['active', 'trialing', 'courtesy'].includes(input.subscription.status);
}

export function canAccessFlipAi(input: FlipAiBillingInput & { role: string | null }): boolean {
  return ['owner', 'admin'].includes(input.role || '') && canServeFlipAiPublic(input);
}
export const agentDraftSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(''),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  style: z.enum(['welcoming', 'professional', 'direct']),
  pipelineId: z.string().uuid(),
  initialStageId: z.string().uuid(),
  rotationId: z.string().uuid().nullable().optional().default(null),
  slug: z.string().min(3).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
}).strict();
export const createAgentDraftSchema = agentDraftSchema.extend({ requestId: z.string().uuid() });
export const updateAgentDraftSchema = agentDraftSchema.extend({ version: z.number().int().positive() });
export const agentPublicationSchema = z.object({
  action: z.enum(['publish', 'unpublish']),
  version: z.number().int().positive(),
}).strict();
export type AgentDraftInput = z.infer<typeof agentDraftSchema>;
export type KnowledgeMasterSummary = { title: string; revision: number; byteSize: number; contentHash: string; updatedAt: string };
export type KnowledgeMaster = KnowledgeMasterSummary & { content: string };
export const knowledgeMasterSchema = z.object({
  title: z.string().trim().min(3).max(120),
  content: z.string().min(20).refine((value) => !value.includes('\0'), 'Conteúdo inválido'),
  expectedRevision: z.number().int().min(0),
}).strict();
export const externalSourceCreateSchema = z.object({
  requestId: z.string().uuid(),
  label: z.string().trim().min(2).max(80),
  domain: z.string().trim().min(3).max(253),
}).strict();
export const externalSourceUpdateSchema = z.object({
  label: z.string().trim().min(2).max(80),
  status: z.enum(['active', 'inactive']),
  version: z.number().int().positive(),
}).strict();
export type FlipAiExternalSource = {
  id: string;
  label: string;
  domain: string;
  status: 'active' | 'inactive';
  version: number;
  updatedAt: string;
};
export type AgentPublicationCheck = {
  key: 'destination' | 'knowledge' | 'openai' | 'wallet';
  label: string;
  ready: boolean;
  detail: string;
};
export type AgentPublicationReadiness = {
  ready: boolean;
  publicPath: string;
  checks: AgentPublicationCheck[];
};
export type AgentDraft = AgentDraftInput & {
  id: string;
  version: number;
  status: 'draft' | 'published';
  updatedAt: string;
  knowledge: KnowledgeMasterSummary | null;
  publication: AgentPublicationReadiness;
};
export type AgentWorkspace = {
  accessMode: 'plan' | 'pilot';
  agents: AgentDraft[];
  pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }>;
  rotations: Array<{ id: string; name: string; pipelineId: string; enabled: boolean }>;
};

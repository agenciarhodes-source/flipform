import { z } from 'zod';

export const FLIP_AI_PLAN_SLUGS = ['premium', 'premium-pro'] as const;
type Plan = { slug: string | null; isActive: boolean } | null;
export function hasFlipAiPlan(plan: Plan): boolean {
  return !!plan?.isActive && FLIP_AI_PLAN_SLUGS.some((slug) => slug === plan.slug);
}
export function canAccessFlipAi(input: {
  role: string | null; tenantStatus: string; plan: Plan;
  subscription?: { status: string; gracePeriodEndsAt: Date | null; plan: Plan } | null;
  now?: Date;
}): boolean {
  if (!['owner', 'admin'].includes(input.role || '')) return false;
  if (!['active', 'trial', 'past_due'].includes(input.tenantStatus) || !hasFlipAiPlan(input.plan)) return false;
  const sub = input.subscription;
  if (sub && (!hasFlipAiPlan(sub.plan) || !['active', 'trialing', 'courtesy', 'past_due'].includes(sub.status))) return false;
  if (input.tenantStatus === 'past_due' || sub?.status === 'past_due') {
    return !!sub?.gracePeriodEndsAt && sub.gracePeriodEndsAt.getTime() > (input.now || new Date()).getTime();
  }
  return true;
}
export const agentDraftSchema = z.object({
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(500).default(''),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  style: z.enum(['welcoming', 'professional', 'direct']),
  pipelineId: z.string().uuid(),
  initialStageId: z.string().uuid(),
  slug: z.string().min(3).max(64).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
}).strict();
export const createAgentDraftSchema = agentDraftSchema.extend({ requestId: z.string().uuid() });
export const updateAgentDraftSchema = agentDraftSchema.extend({ version: z.number().int().positive() });
export type AgentDraftInput = z.infer<typeof agentDraftSchema>;
export type KnowledgeMasterSummary = { title: string; revision: number; byteSize: number; contentHash: string; updatedAt: string };
export type KnowledgeMaster = KnowledgeMasterSummary & { content: string };
export const knowledgeMasterSchema = z.object({
  title: z.string().trim().min(3).max(120),
  content: z.string().min(20).refine((value) => !value.includes('\0'), 'Conteúdo inválido'),
  expectedRevision: z.number().int().min(0),
}).strict();
export type AgentDraft = AgentDraftInput & { id: string; version: number; status: 'draft'; updatedAt: string; knowledge: KnowledgeMasterSummary | null };
export type AgentWorkspace = { agents: AgentDraft[]; pipelines: Array<{ id: string; name: string; stages: Array<{ id: string; name: string }> }> };

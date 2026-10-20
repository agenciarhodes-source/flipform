import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { FlipAiError, requireFlipAiAccess } from '@/lib/flip-ai/access';
import { listStageRulePipelines } from '@/lib/whatsapp-ai/stage-rules-server';

const bodySchema = z.object({
  stageId: z.string().trim().min(1).max(128),
  criterion: z.string().trim().max(600),
  enabled: z.boolean(),
}).strict();

export const GET = withPermission('FLIP_AI_MANAGE', async (_req: NextRequest, session) => {
  try {
    await requireFlipAiAccess(prisma, session);
    return NextResponse.json({ pipelines: await listStageRulePipelines(session.tenantId) });
  } catch (error) {
    if (error instanceof FlipAiError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
});

/** Saves when the Flip AI should move a lead to one stage of the company. */
export const PUT = withPermission('FLIP_AI_MANAGE', async (req: NextRequest, session) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Critério inválido.' }, { status: 400 });
  try {
    await requireFlipAiAccess(prisma, session);
  } catch (error) {
    if (error instanceof FlipAiError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  const stage = await prisma.pipelineStage.findFirst({
    where: { id: parsed.data.stageId, pipeline: { tenantId: session.tenantId } },
    select: { id: true },
  });
  if (!stage) return NextResponse.json({ error: 'Etapa não encontrada.' }, { status: 404 });
  if (parsed.data.enabled && !parsed.data.criterion) {
    return NextResponse.json({ error: 'Escreva o critério antes de deixar a etapa em uso pela IA.' }, { status: 400 });
  }
  const data = { criterion: parsed.data.criterion, enabled: parsed.data.enabled, updatedBy: session.userId };
  const rule = await prisma.pipelineStageAiRule.upsert({
    where: { stageId: stage.id },
    create: { tenantId: session.tenantId, stageId: stage.id, ...data },
    update: data,
  });
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'pipeline_stage_ai_rule', entityId: rule.id,
      action: 'whatsapp_ai.stage_rule_updated', metadata: { stageId: stage.id, enabled: rule.enabled },
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true });
});

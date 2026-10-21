import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withPermission } from '@/lib/rbac-server';
import { decideLearning, LearningDecisionError } from '@/lib/flip/learning';
import { FlipAiError } from '@/lib/flip-ai/access';

const bodySchema = z.object({
  action: z.enum(['approve', 'dismiss']),
  title: z.string().max(120).optional(),
  content: z.string().max(1_000).optional(),
}).strict();

export const POST = withPermission('FLIP_AI_MANAGE', async (req: NextRequest, session, context: { params: { id: string } }) => {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pedido inválido.' }, { status: 400 });
  try {
    return NextResponse.json(await decideLearning(session, context.params.id, parsed.data));
  } catch (error) {
    if (error instanceof LearningDecisionError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof FlipAiError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
});

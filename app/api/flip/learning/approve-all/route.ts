import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { approveAllLearning, LearningDecisionError } from '@/lib/flip/learning';
import { FlipAiError } from '@/lib/flip-ai/access';

export const maxDuration = 60;

/** "Aprovar todas": every pending suggestion approved, the attendants updated once. */
export const POST = withPermission('FLIP_AI_MANAGE', async (_req: NextRequest, session) => {
  try {
    return NextResponse.json(await approveAllLearning(session));
  } catch (error) {
    if (error instanceof LearningDecisionError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof FlipAiError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
});

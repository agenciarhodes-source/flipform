import { NextResponse } from 'next/server';
import { getAgentDraftWorkspace, saveAgentDraft } from '@/lib/flip-ai/agents';
import { createAgentDraftSchema } from '@/lib/flip-ai/policy';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { FlipAiError } from '@/lib/flip-ai/access';
export const dynamic = 'force-dynamic';
export const GET = withFlipAiSession(async (_req, session) => NextResponse.json(await getAgentDraftWorkspace(session)));
export const POST = withFlipAiSession(async (req, session) => {
  const parsed = createAgentDraftSchema.safeParse(await readFlipAiBody(req));
  if (!parsed.success) throw new FlipAiError('INVALID_DRAFT', 400, 'Revise os dados do atendente.');
  const { requestId, ...input } = parsed.data;
  return NextResponse.json({ agent: await saveAgentDraft(session, input, { kind: 'create', requestId }) }, { status: 201 });
});

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { FlipAiError } from '@/lib/flip-ai/access';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { getCurrentKnowledgeIndexStatus, prepareKnowledgeIndex, processNextKnowledgeIndexBatch } from '@/lib/flip-ai/indexing';

export const dynamic = 'force-dynamic';
const idSchema = z.string().uuid();
const bodySchema = z.object({
  expectedRevision: z.number().int().positive(),
  indexId: z.string().uuid().optional(),
  confirmAmbiguousRetry: z.boolean().optional().default(false),
}).strict();

export const GET = withFlipAiSession<{ params: { id: string } }>(async (_request, session, context) => {
  const agentId = idSchema.safeParse(context.params.id);
  if (!agentId.success) throw new FlipAiError('INVALID_AGENT', 400, 'Atendente inválido.');
  return NextResponse.json({ index: await getCurrentKnowledgeIndexStatus(session, agentId.data) });
});

export const POST = withFlipAiSession<{ params: { id: string } }>(async (request, session, context) => {
  const agentId = idSchema.safeParse(context.params.id);
  const body = bodySchema.safeParse(await readFlipAiBody(request, 2_000));
  if (!agentId.success || !body.success) throw new FlipAiError('INVALID_INDEX_REQUEST', 400, 'Solicitação de indexação inválida.');
  const prepared = body.data.indexId
    ? { id: body.data.indexId, revision: body.data.expectedRevision }
    : await prepareKnowledgeIndex(session, agentId.data, body.data.expectedRevision);
  if ('status' in prepared && prepared.status === 'completed') return NextResponse.json({ index: prepared });
  const index = await processNextKnowledgeIndexBatch(session, agentId.data, prepared.id, body.data.confirmAmbiguousRetry);
  return NextResponse.json({ index });
});

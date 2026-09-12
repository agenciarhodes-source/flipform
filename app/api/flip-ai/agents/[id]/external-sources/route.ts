import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createExternalSource, listExternalSources } from '@/lib/flip-ai/external-sources';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { FlipAiError } from '@/lib/flip-ai/access';
export const dynamic = 'force-dynamic';
function agentId(raw: string) {
  const parsed = z.string().uuid().safeParse(raw);
  if (!parsed.success) throw new FlipAiError('AGENT_NOT_FOUND', 404, 'Atendente não encontrado.');
  return parsed.data;
}
export const GET = withFlipAiSession<{ params: { id: string } }>(async (_request, session, context) =>
  NextResponse.json({ sources: await listExternalSources(session, agentId(context.params.id)) }));
export const POST = withFlipAiSession<{ params: { id: string } }>(async (request, session, context) =>
  NextResponse.json({ source: await createExternalSource(session, agentId(context.params.id), await readFlipAiBody(request)) }, { status: 201 }));

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { deleteExternalSource, updateExternalSource } from '@/lib/flip-ai/external-sources';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { FlipAiError } from '@/lib/flip-ai/access';
export const dynamic = 'force-dynamic';
const identifier = z.string().uuid();
export const PATCH = withFlipAiSession<{ params: { id: string; sourceId: string } }>(async (request, session, context) => {
  const ids = z.object({ id: identifier, sourceId: identifier }).safeParse(context.params);
  if (!ids.success) throw new FlipAiError('EXTERNAL_SOURCE_NOT_FOUND', 404, 'Fonte externa não encontrada.');
  return NextResponse.json({ source: await updateExternalSource(session, ids.data.id, ids.data.sourceId, await readFlipAiBody(request)) });
});
export const DELETE = withFlipAiSession<{ params: { id: string; sourceId: string } }>(async (_request, session, context) => {
  const ids = z.object({ id: identifier, sourceId: identifier }).safeParse(context.params);
  if (!ids.success) throw new FlipAiError('EXTERNAL_SOURCE_NOT_FOUND', 404, 'Fonte externa não encontrada.');
  return NextResponse.json({ deleted: await deleteExternalSource(session, ids.data.id, ids.data.sourceId) });
});

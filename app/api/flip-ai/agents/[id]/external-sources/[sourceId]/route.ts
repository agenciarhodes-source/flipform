import { NextResponse } from 'next/server';
import { z } from 'zod';
import { updateExternalSource } from '@/lib/flip-ai/external-sources';
import { readFlipAiBody, withFlipAiSession } from '@/lib/flip-ai/http';
import { FlipAiError } from '@/lib/flip-ai/access';
export const dynamic = 'force-dynamic';
const identifier = z.string().uuid();
export const PATCH = withFlipAiSession<{ params: { id: string; sourceId: string } }>(async (request, session, context) => {
  const ids = z.object({ id: identifier, sourceId: identifier }).safeParse(context.params);
  if (!ids.success) throw new FlipAiError('EXTERNAL_SOURCE_NOT_FOUND', 404, 'Fonte externa não encontrada.');
  return NextResponse.json({ source: await updateExternalSource(session, ids.data.id, ids.data.sourceId, await readFlipAiBody(request)) });
});

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { askFlip, AskFlipError } from '@/lib/flip/ask';

const bodySchema = z.object({ question: z.string().trim().min(3).max(300) }).strict();

/** "Pergunte ao Flip". The question is kept in the audit log; the answer is not stored. */
export const POST = withPermission('LEADS_VIEW', async (req: NextRequest, session) => {
  const rl = rateLimit({ key: `flip-ask:${session.tenantId}:${session.userId}:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Escreva uma pergunta de 3 a 300 caracteres.' }, { status: 400 });
  try {
    const result = await askFlip(session, parsed.data.question);
    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId, userId: session.userId, entityType: 'flip', entityId: session.tenantId,
        action: 'flip.question_asked', metadata: { question: parsed.data.question, query: result.plan.query, period: result.plan.period },
      },
    }).catch(() => undefined);
    return NextResponse.json({ answer: result.answer, filters: result.filters, query: result.plan.query });
  } catch (error) {
    if (error instanceof AskFlipError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Flip ask failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'Não foi possível responder agora. Tente de novo.' }, { status: 502 });
  }
});

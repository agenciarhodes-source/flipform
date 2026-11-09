import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { can } from '@/lib/rbac';
import { withPermission } from '@/lib/rbac-server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { askFlip, AskFlipError } from '@/lib/flip/ask';
import { looksLikeLeadCommand } from '@/lib/lead-assistant/rules';
import { LeadAssistantError, previewLeadCommand } from '@/lib/lead-assistant/service';
import { FLIP_LIMIT_REACHED_MESSAGE } from '@/lib/flip/daily-limit';
import { flipRequestsLeftToday } from '@/lib/flip/daily-usage';

const bodySchema = z.object({ question: z.string().trim().min(3).max(300) }).strict();

/**
 * The Flip bar. A question about the numbers is answered ("Pergunte ao Flip"); for managers, a
 * command about leads ("distribua os leads...") becomes a preview of the lead assistant. Nothing
 * changes here: a distribution is applied only after the manager confirms it.
 * Each person has 3 requests a day (questions and commands together); a failed request does not count.
 * The question is kept in the audit log; the answer is not stored.
 */
export const POST = withPermission('LEADS_VIEW', async (req: NextRequest, session) => {
  const rl = await rateLimit({ key: `flip-ask:${session.tenantId}:${session.userId}:${getClientIp(req)}`, limit: 20, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Escreva uma pergunta de 3 a 300 caracteres.' }, { status: 400 });
  const question = parsed.data.question;
  const left = await flipRequestsLeftToday(session);
  if (left <= 0) return NextResponse.json({ error: FLIP_LIMIT_REACHED_MESSAGE, remaining: 0 }, { status: 429 });

  if (can(session.role, 'LEADS_EDIT_ALL') && looksLikeLeadCommand(question)) {
    try {
      const preview = await previewLeadCommand(session, question);
      if (preview.kind !== 'unsupported') {
        await prisma.auditLog.create({
          data: {
            tenantId: session.tenantId, userId: session.userId, entityType: 'flip', entityId: session.tenantId,
            action: 'flip.lead_command_previewed', metadata: { command: question, kind: preview.kind },
          },
        }).catch(() => undefined);
        return NextResponse.json({ command: preview, remaining: left - 1 });
      }
    } catch (error) {
      if (error instanceof LeadAssistantError) return NextResponse.json({ error: error.message }, { status: error.status });
      console.error('Flip lead command failed', { errorType: error instanceof Error ? error.name : 'unknown' });
      return NextResponse.json({ error: 'Não foi possível entender o comando agora. Tente de novo.' }, { status: 502 });
    }
  }

  try {
    const result = await askFlip(session, question);
    await prisma.auditLog.create({
      data: {
        tenantId: session.tenantId, userId: session.userId, entityType: 'flip', entityId: session.tenantId,
        action: 'flip.question_asked', metadata: { question, query: result.plan.query, period: result.plan.period },
      },
    }).catch(() => undefined);
    return NextResponse.json({ answer: result.answer, filters: result.filters, query: result.plan.query, remaining: left - 1 });
  } catch (error) {
    if (error instanceof AskFlipError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error('Flip ask failed', { errorType: error instanceof Error ? error.name : 'unknown' });
    return NextResponse.json({ error: 'Não foi possível responder agora. Tente de novo.' }, { status: 502 });
  }
});

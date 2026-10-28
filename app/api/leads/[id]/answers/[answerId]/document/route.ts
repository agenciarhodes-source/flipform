import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission, assertCanAccessLead } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { decryptIntegrationSecret } from '@/lib/tracking/crypto';
import { isProtectedAnswer } from '@/lib/privacy/documents';

/**
 * "Mostrar" on a CPF/CNPJ answer (security protocol S7): the full number, only for who can open
 * the lead, and every view is recorded (who, when, which lead).
 */
export const GET = withPermission('LEADS_VIEW', async (_req, session, ctx: { params: { id: string; answerId: string } }) => {
  const limit = await rateLimit({ key: `document-reveal:${session.userId}`, limit: 30, windowMs: 10 * 60_000 });
  if (!limit.allowed) return rateLimitResponse(limit);
  const lead = await prisma.lead.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    select: { id: true, assignedTo: true },
  });
  if (!lead) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  try { assertCanAccessLead(session, lead); } catch { return NextResponse.json({ error: 'Você não tem permissão para acessar este lead.' }, { status: 403 }); }
  const answer = await prisma.leadAnswer.findFirst({
    where: { id: ctx.params.answerId, leadId: lead.id },
    select: { id: true, answer: true, questionLabel: true },
  });
  if (!answer || !isProtectedAnswer(answer.answer)) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  const value = decryptIntegrationSecret(answer.answer.encrypted);
  if (!value) return NextResponse.json({ error: 'Não foi possível abrir este dado.' }, { status: 500 });
  await logAudit({
    tenantId: session.tenantId, userId: session.userId, entityType: 'lead', entityId: lead.id,
    action: 'lead.document_revealed', metadata: { answerId: answer.id, kind: answer.answer.protected },
  });
  return NextResponse.json({ value }, { headers: { 'Cache-Control': 'private, no-store' } });
});

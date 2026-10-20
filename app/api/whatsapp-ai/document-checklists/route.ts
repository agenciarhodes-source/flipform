import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { FlipAiError, requireFlipAiAccess } from '@/lib/flip-ai/access';
import { checklistItemsToText, parseChecklistItems, type ChecklistItem } from '@/lib/whatsapp-ai/document-rules';

const bodySchema = z.object({
  id: z.string().trim().min(1).max(128).nullable(),
  name: z.string().trim().min(1).max(80),
  itemsText: z.string().max(4_000),
  enabled: z.boolean(),
}).strict();

async function guard(session: Parameters<typeof requireFlipAiAccess>[1]) {
  try {
    await requireFlipAiAccess(prisma, session);
    return null;
  } catch (error) {
    if (error instanceof FlipAiError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
}

/** The document lists (types of case) of the company. */
export const GET = withPermission('FLIP_AI_MANAGE', async (_req: NextRequest, session) => {
  const denied = await guard(session);
  if (denied) return denied;
  const rows = await prisma.documentChecklist.findMany({
    where: { tenantId: session.tenantId },
    orderBy: { createdAt: 'asc' },
    select: { id: true, name: true, items: true, enabled: true },
  });
  return NextResponse.json({
    checklists: rows.map((row) => ({
      id: row.id, name: row.name, enabled: row.enabled,
      itemsText: checklistItemsToText((Array.isArray(row.items) ? row.items : []) as unknown as ChecklistItem[]),
    })),
  });
});

export const PUT = withPermission('FLIP_AI_MANAGE', async (req: NextRequest, session) => {
  const denied = await guard(session);
  if (denied) return denied;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Lista de documentos inválida.' }, { status: 400 });
  const items = parseChecklistItems(parsed.data.itemsText);
  if (!items.length) return NextResponse.json({ error: 'Escreva ao menos um documento, um por linha.' }, { status: 400 });
  const data = { name: parsed.data.name, items, enabled: parsed.data.enabled, updatedBy: session.userId };
  const saved = parsed.data.id
    ? await prisma.documentChecklist.updateMany({ where: { id: parsed.data.id, tenantId: session.tenantId }, data }).then(async (result) => (
      result.count ? prisma.documentChecklist.findUnique({ where: { id: parsed.data.id! } }) : null))
    : await prisma.documentChecklist.create({ data: { tenantId: session.tenantId, ...data } });
  if (!saved) return NextResponse.json({ error: 'Lista não encontrada.' }, { status: 404 });
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'document_checklist', entityId: saved.id,
      action: 'whatsapp_ai.document_checklist_saved', metadata: { name: saved.name, items: items.length, enabled: saved.enabled },
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, id: saved.id, itemsText: checklistItemsToText(items) });
});

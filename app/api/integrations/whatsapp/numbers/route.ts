import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { cleanNumberLabel } from '@/lib/meta/whatsapp-number-rules';

export const runtime = 'nodejs';

/** The company's connected WhatsApp numbers and their names ("Tráfego pago", "Carteira"). */
export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const numbers = await prisma.tenantWhatsAppConnection.findMany({
    where: { tenantId: session.tenantId, status: 'connected' },
    orderBy: { connectedAt: 'asc' },
    select: { id: true, label: true, displayPhoneNumber: true, verifiedName: true, connectedAt: true },
  });
  return NextResponse.json({ numbers });
});

const labelSchema = z.object({
  connectionId: z.string().trim().min(1).max(64),
  label: z.string().max(80).nullable(),
}).strict();

/** Names a number. Nothing of the connection itself changes. */
export const PATCH = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const parsed = labelSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Nome inválido.' }, { status: 400 });
  const label = cleanNumberLabel(parsed.data.label);
  const updated = await prisma.tenantWhatsAppConnection.updateMany({
    where: { id: parsed.data.connectionId, tenantId: session.tenantId },
    data: { label },
  });
  if (!updated.count) return NextResponse.json({ error: 'Número não encontrado.' }, { status: 404 });
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'tenant_whatsapp_connection',
      entityId: parsed.data.connectionId, action: 'WHATSAPP_NUMBER_LABELED', metadata: { label },
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, label });
});

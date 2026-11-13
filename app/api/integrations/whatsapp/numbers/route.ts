import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { cleanNumberLabel } from '@/lib/meta/whatsapp-number-rules';
import { numberAccessMap, setNumberAccess } from '@/lib/inbox/number-access';

export const runtime = 'nodejs';

/**
 * The company's connected WhatsApp numbers, their names ("Tráfego pago", "Carteira") and who sees
 * each one. A person marked in no number sees every number; the owner always sees every number.
 */
export const GET = withPermission('INTEGRATIONS_VIEW', async (_req, session) => {
  const [numbers, team, access] = await Promise.all([
    prisma.tenantWhatsAppConnection.findMany({
      where: { tenantId: session.tenantId, status: 'connected' },
      orderBy: { connectedAt: 'asc' },
      select: { id: true, label: true, displayPhoneNumber: true, verifiedName: true, connectedAt: true },
    }),
    prisma.tenantUser.findMany({
      where: { tenantId: session.tenantId, status: 'active', role: { not: 'owner' } },
      orderBy: { user: { name: 'asc' } },
      select: { userId: true, role: true, user: { select: { name: true, email: true } } },
    }),
    numberAccessMap(session.tenantId),
  ]);
  return NextResponse.json({
    numbers: numbers.map((number) => ({
      ...number,
      userIds: access.rows.filter((row) => row.connectionId === number.id).map((row) => row.userId),
    })),
    team: team.map((member) => ({ userId: member.userId, role: member.role, name: member.user.name, email: member.user.email })),
    accessReady: access.schemaReady,
  });
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

const accessSchema = z.object({
  connectionId: z.string().trim().min(1).max(64),
  userIds: z.array(z.string().trim().min(1).max(64)).max(500),
}).strict();

/** Who sees one number. Only people of this company; the owner is never restricted. */
export const PUT = withPermission('INTEGRATIONS_EDIT', async (req: NextRequest, session) => {
  const parsed = accessSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Seleção inválida.' }, { status: 400 });
  const [number, members, before] = await Promise.all([
    prisma.tenantWhatsAppConnection.findFirst({ where: { id: parsed.data.connectionId, tenantId: session.tenantId, status: 'connected' }, select: { id: true } }),
    prisma.tenantUser.findMany({
      where: { tenantId: session.tenantId, status: 'active', role: { not: 'owner' }, userId: { in: parsed.data.userIds } },
      select: { userId: true },
    }),
    numberAccessMap(session.tenantId),
  ]);
  if (!number) return NextResponse.json({ error: 'Número não encontrado.' }, { status: 404 });
  if (!before.schemaReady) return NextResponse.json({ error: 'Estrutura de acesso por número ainda não instalada.' }, { status: 503 });
  const userIds = members.map((member) => member.userId);
  await setNumberAccess({ tenantId: session.tenantId, connectionId: number.id, userIds, actorUserId: session.userId });
  // Read on every request: the new visibility applies on the next screen each person opens.
  await prisma.auditLog.create({
    data: {
      tenantId: session.tenantId, userId: session.userId, entityType: 'tenant_whatsapp_connection',
      entityId: number.id, action: 'WHATSAPP_NUMBER_ACCESS_SET', metadata: { userIds },
    },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, userIds });
});

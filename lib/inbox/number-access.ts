import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ALL_NUMBERS, numberScopeFor, type NumberScope } from './number-access-rules';

function tableMissing(error: unknown) {
  const code = String((error as { code?: string })?.code || '');
  const metaCode = String((error as { meta?: { code?: string } })?.meta?.code || '');
  const message = error instanceof Error ? error.message : String(error);
  return code === 'P2021' || metaCode === '42P01' || /relation "?whatsapp_number_access"? does not exist/i.test(message);
}

/** The company's first connected number: it holds the conversations recorded before several numbers. */
export async function legacyWhatsAppNumberId(tenantId: string) {
  const first = await prisma.tenantWhatsAppConnection.findFirst({
    where: { tenantId, status: 'connected' },
    orderBy: { connectedAt: 'asc' },
    select: { id: true },
  });
  return first?.id ?? null;
}

/** The numbers marked for a person in the company (none = every number). */
export async function markedWhatsAppNumberIds(tenantId: string, userId: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ connectionId: string }>>(Prisma.sql`
      SELECT a.connection_id AS "connectionId"
      FROM whatsapp_number_access a
      JOIN tenant_whatsapp_connections c ON c.id = a.connection_id AND c.status = 'connected'
      WHERE a.tenant_id = ${tenantId} AND a.user_id = ${userId}
    `);
    return rows.map((row) => row.connectionId);
  } catch (error) {
    if (tableMissing(error)) return [];
    throw error;
  }
}

/** Which numbers this person sees in the Inbox. */
export async function loadNumberScope(input: { tenantId: string; userId: string; role: string }): Promise<NumberScope> {
  if (input.role === 'owner') return ALL_NUMBERS;
  const marked = await markedWhatsAppNumberIds(input.tenantId, input.userId);
  if (marked.length === 0) return ALL_NUMBERS;
  return numberScopeFor({ role: input.role, markedNumberIds: marked, legacyNumberId: await legacyWhatsAppNumberId(input.tenantId) });
}

/** Everyone's marked numbers in the company: { userId: [connectionId] }. */
export async function numberAccessMap(tenantId: string) {
  try {
    const rows = await prisma.$queryRaw<Array<{ connectionId: string; userId: string }>>(Prisma.sql`
      SELECT connection_id AS "connectionId", user_id AS "userId" FROM whatsapp_number_access WHERE tenant_id = ${tenantId}
    `);
    return { schemaReady: true, rows };
  } catch (error) {
    if (tableMissing(error)) return { schemaReady: false, rows: [] as Array<{ connectionId: string; userId: string }> };
    throw error;
  }
}

/** Replaces who sees one number. */
export async function setNumberAccess(input: { tenantId: string; connectionId: string; userIds: string[]; actorUserId: string }) {
  const userIds = [...new Set(input.userIds)];
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`
      DELETE FROM whatsapp_number_access WHERE tenant_id = ${input.tenantId} AND connection_id = ${input.connectionId}
    `);
    for (const userId of userIds) {
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO whatsapp_number_access (tenant_id, connection_id, user_id, created_by, created_at)
        VALUES (${input.tenantId}, ${input.connectionId}, ${userId}, ${input.actorUserId}, NOW())
        ON CONFLICT (connection_id, user_id) DO NOTHING
      `);
    }
  });
}

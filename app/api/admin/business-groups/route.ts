import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';
import { createBusinessGroup, getBusinessGroupAdminSnapshot, BusinessGroupError } from '@/lib/business-groups';
import { logPlatformAudit } from '@/lib/platform-audit';

const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

function errorResponse(error: unknown) {
  if (error instanceof BusinessGroupError) {
    const status = error.code === 'BUSINESS_GROUP_SCHEMA_NOT_READY' ? 503 : 400;
    return NextResponse.json({ error: error.message, code: error.code }, { status });
  }
  console.error('[admin.business-groups]', error);
  return NextResponse.json({ error: 'Falha ao operar grupos empresariais.' }, { status: 500 });
}

export const GET = withPlatformAdmin(async (_req: NextRequest) => {
  try {
    return NextResponse.json(await getBusinessGroupAdminSnapshot(prisma));
  } catch (error) {
    return errorResponse(error);
  }
});

export const POST = withPlatformAdmin(async (req: NextRequest, session) => {
  try {
    const parsed = createSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });

    const group = await createBusinessGroup(prisma, { name: parsed.data.name, actorUserId: session.userId });
    try {
      await logPlatformAudit({
        tenantId: null,
        userId: session.userId,
        entityType: 'business_group',
        entityId: group.id,
        action: 'business_group.created',
        metadata: { name: group.name, slug: group.slug },
      });
    } catch (auditError) {
      console.error('[admin.business-groups][audit]', auditError);
    }
    return NextResponse.json({ ok: true, group });
  } catch (error) {
    return errorResponse(error);
  }
});

import 'server-only';

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { isFlipAiPilotTenant } from '@/lib/flip-ai/pilot-access';
import { canServeFlipAiPilot, canServeFlipAiPublic } from '@/lib/flip-ai/policy';
import { planIncludesMessaging } from './subscription-rules';

export const MESSAGING_PLAN_REQUIRED_MESSAGE = 'O atendimento por WhatsApp e Instagram está disponível a partir do plano Pro.';

/** WhatsApp and Instagram (Inbox, Direct, connecting and answering by hand): Pro and above. */
export async function tenantHasMessagingPlan(tenantId: string) {
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { plan: { select: { slug: true } } } });
  return planIncludesMessaging(tenant?.plan?.slug);
}

export function messagingPlanRequired() {
  return NextResponse.json({ error: MESSAGING_PLAN_REQUIRED_MESSAGE, code: 'PLAN_REQUIRED' }, { status: 403 });
}

/**
 * Whether the AI may answer for the company right now (WhatsApp and Instagram): the Premium plan,
 * or a pilot company authorized by the platform. Checked on every answer, so a company that leaves
 * Premium stops being answered by the AI and the conversation stays with the team.
 */
export async function tenantMayRunAiAttendant(tenantId: string) {
  const [tenant, subscription] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: tenantId }, select: { status: true, plan: { select: { slug: true, isActive: true } } } }),
    prisma.subscription.findFirst({
      where: { tenantId },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { status: true, gracePeriodEndsAt: true, plan: { select: { slug: true, isActive: true } } },
    }),
  ]);
  if (!tenant) return false;
  if (canServeFlipAiPublic({ tenantStatus: tenant.status, plan: tenant.plan, subscription })) return true;
  return isFlipAiPilotTenant(tenantId) && canServeFlipAiPilot({ tenantStatus: tenant.status, subscription });
}

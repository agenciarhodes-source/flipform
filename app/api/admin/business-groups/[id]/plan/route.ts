import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';
import { logPlatformAudit } from '@/lib/platform-audit';
import { groupTenantIds, loadGroupPlan, payerBilling } from '@/lib/billing/group-plan';
import { refreshGroupPlan } from '@/lib/billing/group-plan-billing';
import { planPriceCents } from '@/lib/billing/subscription-rules';
import { setStripeSubscriptionAmount } from '@/lib/stripe/subscription-manage';
import {
  GROUP_PLAN_ADDITIONAL_STORE_PRICE,
  GROUP_PLAN_BASE_PRICE,
  GROUP_PLAN_PROVIDER,
  groupPlanChargeCents,
  groupPlanTotalCents,
  hasOwnPaidSubscription,
  validGroupPlanPrices,
  validNegotiatedPrice,
} from '@/lib/billing/group-plan-rules';

const activateSchema = z.object({
  payerTenantId: z.string().guid(),
  basePrice: z.number().default(GROUP_PLAN_BASE_PRICE),
  additionalStorePrice: z.number().default(GROUP_PLAN_ADDITIONAL_STORE_PRICE),
  negotiatedPrice: z.number().nullable().default(null),
  notes: z.string().trim().max(1000).nullable().default(null),
});

const SCHEMA_NOT_READY = { error: 'Estrutura do Plano Grupo ainda não instalada no banco.', code: 'GROUP_PLAN_SCHEMA_NOT_READY' };

async function groupExists(groupId: string) {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`SELECT id FROM business_groups WHERE id = ${groupId} LIMIT 1`);
  return rows.length > 0;
}

/** The plan, the stores with their situation and how the paying store is charged. */
async function snapshot(groupId: string) {
  const { schemaReady, plan } = await loadGroupPlan(groupId);
  const tenantIds = await groupTenantIds(groupId);
  const tenants = await prisma.tenant.findMany({
    where: { id: { in: tenantIds } },
    select: {
      id: true, name: true, status: true,
      plan: { select: { slug: true, name: true } },
      subscriptions: {
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 10,
        select: { provider: true, providerSubscriptionId: true, status: true, paymentRequired: true, plan: { select: { slug: true, name: true } } },
      },
    },
  });
  const stores = tenantIds.map((id) => tenants.find((tenant) => tenant.id === id)).filter(Boolean).map((tenant) => {
    const latest = tenant!.subscriptions[0] || null;
    return {
      id: tenant!.id,
      name: tenant!.name,
      status: tenant!.status,
      planName: latest?.plan?.name || tenant!.plan?.name || null,
      subscriptionStatus: latest?.status || null,
      coveredByGroup: Boolean(latest && latest.provider === GROUP_PLAN_PROVIDER && latest.providerSubscriptionId === groupId && latest.status !== 'canceled'),
      ownPaidSubscription: hasOwnPaidSubscription(tenant!.subscriptions),
    };
  });
  const payer = plan ? await payerBilling(plan.payerTenantId) : null;
  return {
    schemaReady,
    plan,
    stores,
    tableCents: plan ? groupPlanTotalCents(stores.length, plan.basePrice, plan.additionalStorePrice) : 0,
    totalCents: plan ? groupPlanChargeCents({ storeCount: stores.length, ...plan }) : 0,
    payer: payer?.tenant ? {
      id: payer.tenant.id,
      name: payer.tenant.name,
      planName: payer.plan?.name || null,
      premium: payer.premium,
      billingProvider: payer.subscription?.status === 'courtesy' ? 'courtesy' : String(payer.subscription?.provider || 'none').toLowerCase(),
      subscriptionStatus: payer.subscription?.status || null,
    } : null,
  };
}

export const GET = withPlatformAdmin(async (_req: NextRequest, _session, ctx: { params: { id: string } }) => {
  if (!await groupExists(ctx.params.id)) return NextResponse.json({ error: 'Grupo empresarial não encontrado.' }, { status: 404 });
  return NextResponse.json(await snapshot(ctx.params.id));
});

/** Activates (or changes) the group plan: who pays and the prices. */
export const PUT = withPlatformAdmin(async (req: NextRequest, session, ctx: { params: { id: string } }) => {
  const groupId = ctx.params.id;
  const parsed = activateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  const { payerTenantId, basePrice, additionalStorePrice, negotiatedPrice } = parsed.data;
  const notes = parsed.data.notes || null;
  if (!validGroupPlanPrices(basePrice, additionalStorePrice) || !validNegotiatedPrice(negotiatedPrice)) {
    return NextResponse.json({ error: 'Valores inválidos.' }, { status: 400 });
  }
  if (!await groupExists(groupId)) return NextResponse.json({ error: 'Grupo empresarial não encontrado.' }, { status: 404 });
  const { schemaReady, plan: before } = await loadGroupPlan(groupId);
  if (!schemaReady) return NextResponse.json(SCHEMA_NOT_READY, { status: 503 });

  const tenantIds = await groupTenantIds(groupId);
  if (!tenantIds.includes(payerTenantId)) return NextResponse.json({ error: 'A loja pagadora precisa fazer parte do grupo.' }, { status: 400 });
  const payer = await payerBilling(payerTenantId);
  if (!payer.premium) {
    return NextResponse.json({ error: 'A loja pagadora precisa estar no plano Premium antes de ativar o Plano Grupo.', code: 'PAYER_NOT_PREMIUM' }, { status: 400 });
  }

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO business_group_plans (group_id, payer_tenant_id, base_price, additional_store_price, negotiated_price, notes, status, created_by, created_at, updated_at)
    VALUES (${groupId}, ${payerTenantId}, ${basePrice}, ${additionalStorePrice}, ${negotiatedPrice}, ${notes}, 'active', ${session.userId}, NOW(), NOW())
    ON CONFLICT (group_id) DO UPDATE SET
      payer_tenant_id = EXCLUDED.payer_tenant_id,
      base_price = EXCLUDED.base_price,
      additional_store_price = EXCLUDED.additional_store_price,
      negotiated_price = EXCLUDED.negotiated_price,
      notes = EXCLUDED.notes,
      status = 'active',
      updated_at = NOW()
  `);
  // A new paying store: the previous one goes back to its own plan price.
  if (before && before.status === 'active' && before.payerTenantId !== payerTenantId) {
    const previous = await payerBilling(before.payerTenantId);
    if (previous.plan && previous.subscription?.provider === 'stripe') {
      await setStripeSubscriptionAmount(before.payerTenantId, previous.plan, planPriceCents(previous.plan.price)).catch(() => undefined);
    }
  }
  const result = await refreshGroupPlan(groupId);
  await logPlatformAudit({
    tenantId: payerTenantId, userId: session.userId, entityType: 'business_group', entityId: groupId,
    action: before?.status === 'active' ? 'business_group.plan_updated' : 'business_group.plan_activated',
    metadata: { payerTenantId, basePrice, additionalStorePrice, negotiatedPrice, notes, previous: before, billing: result.billing, sync: result.sync },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, ...result, ...(await snapshot(groupId)) });
});

/** Re-applies the plan to the stores now (after a change made outside the group page). */
export const POST = withPlatformAdmin(async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const { schemaReady, plan } = await loadGroupPlan(ctx.params.id);
  if (!schemaReady) return NextResponse.json(SCHEMA_NOT_READY, { status: 503 });
  if (!plan) return NextResponse.json({ error: 'Este grupo não tem Plano Grupo.' }, { status: 404 });
  const result = await refreshGroupPlan(ctx.params.id);
  await logPlatformAudit({
    tenantId: plan.payerTenantId, userId: session.userId, entityType: 'business_group', entityId: ctx.params.id,
    action: 'business_group.plan_synced', metadata: { trigger: 'platform', billing: result.billing, sync: result.sync },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, ...result, ...(await snapshot(ctx.params.id)) });
});

/**
 * Ends the group plan: the covered stores lose the group subscription (their AI stops; companies,
 * teams, leads and connections stay), and the paying store goes back to its own plan price.
 */
export const DELETE = withPlatformAdmin(async (_req: NextRequest, session, ctx: { params: { id: string } }) => {
  const { schemaReady, plan } = await loadGroupPlan(ctx.params.id);
  if (!schemaReady) return NextResponse.json(SCHEMA_NOT_READY, { status: 503 });
  if (!plan || plan.status === 'ended') return NextResponse.json({ error: 'Este grupo não tem Plano Grupo ativo.' }, { status: 404 });
  await prisma.$executeRaw(Prisma.sql`UPDATE business_group_plans SET status = 'ended', updated_at = NOW() WHERE group_id = ${ctx.params.id}`);
  const result = await refreshGroupPlan(ctx.params.id);
  await logPlatformAudit({
    tenantId: plan.payerTenantId, userId: session.userId, entityType: 'business_group', entityId: ctx.params.id,
    action: 'business_group.plan_ended', metadata: { billing: result.billing, sync: result.sync },
  }).catch(() => undefined);
  return NextResponse.json({ ok: true, ...result, ...(await snapshot(ctx.params.id)) });
});

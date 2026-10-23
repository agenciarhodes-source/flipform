import { NextRequest, NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { prisma } from '@/lib/prisma';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logAudit } from '@/lib/audit';
import { validateTenantWithinPlanLimits } from '@/lib/plan-limits';
import { isSellablePlan } from '@/lib/billing/subscription-rules';
import { changeStripeSubscriptionPlan, StripeManageError } from '@/lib/stripe/subscription-manage';

export const runtime = 'nodejs';

/**
 * The owner moves the company to another plan on sale. With a Stripe subscription the new price
 * goes to Stripe first (the difference is prorated on the next invoice); only then the plan changes here.
 */
export const POST = withPermission('BILLING_MANAGE', async (req: NextRequest, session) => {
  const rl = rateLimit({ key: `billing:change-plan:user:${session.userId}:ip:${getClientIp(req)}`, limit: 20, windowMs: 60 * 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const body = await req.json().catch(() => ({}));
  const targetPlanSlug = String(body.targetPlanSlug || '').trim().toLowerCase();
  if (targetPlanSlug === 'enterprise') return NextResponse.json({ error: 'Plano Enterprise é sob consulta.', code: 'ENTERPRISE_CONTACT_REQUIRED' }, { status: 400 });

  const tenant = await prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { id: true, status: true } });
  if (!tenant || tenant.status === 'canceled') return NextResponse.json({ error: 'Empresa inválida para troca de plano.', code: 'INVALID_TENANT' }, { status: 400 });

  const currentSub = await prisma.subscription.findFirst({ where: { tenantId: session.tenantId }, include: { plan: true }, orderBy: { createdAt: 'desc' } });
  if (!currentSub?.plan) return NextResponse.json({ error: 'Assinatura não encontrada.', code: 'SUBSCRIPTION_NOT_FOUND' }, { status: 404 });
  const provider = String(currentSub.provider || '').toLowerCase();
  if (provider !== 'stripe' || currentSub.status === 'courtesy') {
    return NextResponse.json({ error: 'A troca de plano desta empresa é feita pelo administrador da plataforma. Fale com o suporte.', code: 'MANUAL_PLAN_CHANGE_REQUIRED' }, { status: 400 });
  }

  const targetPlan = await prisma.plan.findFirst({
    where: { slug: targetPlanSlug, isActive: true },
    select: { id: true, slug: true, name: true, price: true, billingCycle: true, isActive: true, maxUsers: true, maxForms: true, maxPipelines: true, maxLeadsPerMonth: true },
  });
  if (!targetPlan || !isSellablePlan(targetPlan)) return NextResponse.json({ error: 'Plano inválido ou indisponível.', code: 'INVALID_PLAN' }, { status: 400 });
  if (currentSub.plan.slug === targetPlan.slug) return NextResponse.json({ error: 'Este já é o plano atual.', code: 'SAME_PLAN' }, { status: 400 });

  const isUpgrade = Number(targetPlan.price) > Number(currentSub.plan.price);
  if (!isUpgrade) {
    const limits = await validateTenantWithinPlanLimits(session.tenantId, targetPlan);
    if (!limits.ok) {
      await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: currentSub.id, action: 'billing.plan_change.blocked_by_limits', metadata: { targetPlan: targetPlan.slug, violations: limits.violations } });
      return NextResponse.json({ error: 'Sua conta excede os limites do plano selecionado.', code: 'PLAN_LIMIT_EXCEEDED', details: limits.violations }, { status: 400 });
    }
  }

  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: currentSub.id, action: 'billing.plan_change.requested', metadata: { currentPlan: currentSub.plan.slug, targetPlan: targetPlan.slug, mode: isUpgrade ? 'upgrade' : 'downgrade' } });
  try {
    await changeStripeSubscriptionPlan(session.tenantId, { ...targetPlan, billingCycle: String(targetPlan.billingCycle) });
  } catch (error) {
    await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: currentSub.id, action: 'billing.plan_change.provider_failed', metadata: { targetPlan: targetPlan.slug } });
    const status = error instanceof StripeManageError ? error.status : 502;
    return NextResponse.json({ error: 'Não foi possível trocar o plano agora. Tente de novo em instantes.', code: 'PROVIDER_PLAN_CHANGE_FAILED' }, { status });
  }

  await prisma.subscription.update({ where: { id: currentSub.id }, data: { planId: targetPlan.id } });
  await prisma.tenant.update({ where: { id: session.tenantId }, data: { planId: targetPlan.id } });
  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'billing', entityId: currentSub.id, action: 'billing.plan_change.applied', metadata: { currentPlan: currentSub.plan.slug, targetPlan: targetPlan.slug } });

  return NextResponse.json({
    ok: true, status: 'applied', currentPlan: currentSub.plan.slug, targetPlan: targetPlan.slug,
    message: `Plano alterado para ${targetPlan.name}. A diferença proporcional entra na próxima fatura.`,
  });
});

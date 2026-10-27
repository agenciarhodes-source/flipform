import { prisma } from '@/lib/prisma';
import { isSellablePlan, planFeatures, planIncludesAi, stripeSubscriptionsEnabled, TRIAL_DAYS } from '@/lib/billing/subscription-rules';
import { CheckoutClient, type CheckoutPlan } from './checkout-client';

export const dynamic = 'force-dynamic';

/** Public checkout: the plans, prices and limits come from the plans table (what is really charged). */
export default async function CheckoutPage(props: { params: Promise<{ planSlug: string }> }) {
  const params = await props.params;
  const rows = await prisma.plan.findMany({
    where: { isActive: true },
    orderBy: { price: 'asc' },
    select: { slug: true, name: true, price: true, isActive: true, maxUsers: true, maxForms: true, maxPipelines: true, maxLeadsPerMonth: true },
  });
  const plans: CheckoutPlan[] = rows.filter(isSellablePlan).map((plan) => ({
    slug: plan.slug,
    name: plan.name,
    price: Number(plan.price),
    features: planFeatures(plan),
    recommended: plan.slug === 'growth',
    includesAi: planIncludesAi(plan.slug),
  }));
  const stripe = stripeSubscriptionsEnabled();
  return <CheckoutClient initialSlug={(params.planSlug || '').toLowerCase()} plans={plans} trialDays={stripe ? TRIAL_DAYS : 0} />;
}

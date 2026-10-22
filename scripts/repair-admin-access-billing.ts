import { prisma } from '../lib/prisma';
import { catalogPlan } from '../lib/billing/plan-catalog';

/** Creates a missing plan with the official catalog values; an existing plan is never changed. */
async function ensurePlan(slug: string) {
  const plan = catalogPlan(slug);
  if (!plan) throw new Error(`Plano ${slug} não está no catálogo oficial.`);
  await prisma.plan.upsert({
    where: { slug },
    create: { ...plan, price: plan.price.toFixed(2), billingCycle: 'monthly' },
    update: {},
  });
}

async function main() {
  await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "AllowedUser_email_key"');
  await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS allowed_users_email_key');
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS allowed_users_tenant_id_email_key ON allowed_users(tenant_id, email)');
  await ensurePlan('starter');
  await ensurePlan('growth');
  await ensurePlan('pro');
  console.log('Admin repair completed.');
}

main().finally(async () => prisma.$disconnect());

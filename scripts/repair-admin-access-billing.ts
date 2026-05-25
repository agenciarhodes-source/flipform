import { prisma } from '../lib/prisma';

async function ensurePlan(slug: string, name: string, price: number) {
  await prisma.plan.upsert({
    where: { slug },
    create: {
      slug,
      name,
      description: `${name} plan`,
      price,
      billingCycle: 'monthly',
      maxUsers: slug === 'starter' ? 3 : slug === 'growth' ? 10 : 50,
      maxForms: slug === 'starter' ? 3 : slug === 'growth' ? 20 : 100,
      maxLeadsPerMonth: slug === 'starter' ? 300 : slug === 'growth' ? 2000 : 10000,
      maxPipelines: slug === 'starter' ? 2 : slug === 'growth' ? 10 : 30,
      canUseReports: slug !== 'starter',
      canExportCsv: slug !== 'starter',
      canUseCustomBranding: slug !== 'starter',
      canUseMetaPixel: slug !== 'starter',
      canUseWebhooks: slug === 'pro',
      canUseTasks: true,
      isActive: true,
    },
    update: { isActive: true },
  });
}

async function main() {
  await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS "AllowedUser_email_key"');
  await prisma.$executeRawUnsafe('DROP INDEX IF EXISTS allowed_users_email_key');
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS allowed_users_tenant_id_email_key ON allowed_users(tenant_id, email)');
  await ensurePlan('starter', 'Starter', 99);
  await ensurePlan('growth', 'Growth', 199);
  await ensurePlan('pro', 'Pro', 399);
  console.log('Admin repair completed.');
}

main().finally(async () => prisma.$disconnect());

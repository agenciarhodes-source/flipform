import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

function requireEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;
  if (!value || !value.trim()) throw new Error(`Missing required environment variable: ${name}`);
  return value.trim();
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) throw new Error('Missing required environment variable: DATABASE_URL');

  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL_ENV === 'production';
  if (isProduction && process.env.ALLOW_MANUAL_ACCESS_REPAIR_IN_PRODUCTION !== 'true') {
    throw new Error('Refusing to repair manual access in production without ALLOW_MANUAL_ACCESS_REPAIR_IN_PRODUCTION=true');
  }

  const tenantName = requireEnv('MANUAL_ACCESS_TENANT_NAME', 'Agência Rhodes');
  const tenantSlug = requireEnv('MANUAL_ACCESS_TENANT_SLUG', 'agencia-rhodes').toLowerCase();

  const email1 = normalizeEmail(requireEnv('MANUAL_ACCESS_EMAIL_1'));
  const password1 = requireEnv('MANUAL_ACCESS_PASSWORD_1');
  const email2 = normalizeEmail(requireEnv('MANUAL_ACCESS_EMAIL_2'));
  const password2 = requireEnv('MANUAL_ACCESS_PASSWORD_2');

  for (const email of [email1, email2]) {
    if (!validateEmail(email)) throw new Error(`Invalid email format: ${email}`);
  }
  for (const pwd of [password1, password2]) {
    if (pwd.length < 8) throw new Error('Password must be at least 8 characters long.');
  }

  const plan =
    (await prisma.plan.findFirst({ where: { slug: 'pro', isActive: true }, select: { id: true } })) ||
    (await prisma.plan.findFirst({ where: { slug: 'growth', isActive: true }, select: { id: true } })) ||
    (await prisma.plan.findFirst({ where: { isActive: true }, orderBy: { price: 'asc' }, select: { id: true } }));

  if (!plan) throw new Error('No active plan available.');

  const tenant = await prisma.tenant.upsert({
    where: { slug: tenantSlug },
    update: { name: tenantName, status: 'active', planId: plan.id },
    create: { name: tenantName, slug: tenantSlug, status: 'active', planId: plan.id },
  });

  const existingSubscription = await prisma.subscription.findFirst({ where: { tenantId: tenant.id }, select: { id: true } });
  if (!existingSubscription) {
    await prisma.subscription.create({
      data: { tenantId: tenant.id, planId: plan.id, status: 'courtesy', provider: 'courtesy', paymentRequired: false },
    });
  }

  const users = [
    { email: email1, password: password1 },
    { email: email2, password: password2 },
  ];

  for (const item of users) {
    const passwordHash = await hashPassword(item.password);
    const user = await prisma.user.upsert({
      where: { email: item.email },
      update: { passwordHash },
      create: { name: item.email.split('@')[0], email: item.email, passwordHash },
    });

    await prisma.tenantUser.upsert({
      where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } },
      update: { role: 'owner', status: 'active' },
      create: { tenantId: tenant.id, userId: user.id, role: 'owner', status: 'active' },
    });

    await prisma.allowedUser.upsert({
      where: { tenantId_email: { tenantId: tenant.id, email: item.email } },
      update: { role: 'owner', status: 'active', active: true, source: 'manual-repair', acceptedAt: new Date() },
      create: { tenantId: tenant.id, email: item.email, role: 'owner', status: 'active', active: true, source: 'manual-repair', acceptedAt: new Date() },
    });
  }

  console.log('Manual access ensured.');
  console.log(`Tenant: ${tenant.slug}`);
  console.log('Users linked:');
  console.log(`- ${email1}`);
  console.log(`- ${email2}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : 'Manual access repair failed.');
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

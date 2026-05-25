import { prisma } from '../lib/prisma';

async function main() {
  const [plans, tenants, allowed, duplicates] = await Promise.all([
    prisma.plan.findMany({ where: { isActive: true }, select: { id: true, slug: true, name: true } }),
    prisma.tenant.count(),
    prisma.allowedUser.count(),
    prisma.$queryRawUnsafe<Array<{ tenant_id: string; email: string; c: bigint }>>(
      `SELECT tenant_id, email, COUNT(*) as c FROM allowed_users GROUP BY tenant_id, email HAVING COUNT(*) > 1`
    ),
  ]);

  console.log('Admin diagnose report');
  console.log(`Active plans: ${plans.length}`);
  console.log(`Tenants: ${tenants}`);
  console.log(`Allowed users: ${allowed}`);
  console.log(`Duplicate (tenant_id,email): ${duplicates.length}`);
  if (duplicates.length) console.log(duplicates.map((d) => `${d.tenant_id}:${d.email}:${String(d.c)}`).join('\n'));
}

main().finally(async () => prisma.$disconnect());

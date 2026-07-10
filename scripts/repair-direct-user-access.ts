import { prisma } from '../lib/prisma';

const dryRun = process.argv.includes('--dry-run');

async function main() {
  const activeTenantUsers = await prisma.tenantUser.findMany({
    where: { status: 'active' },
    include: {
      user: { select: { id: true, name: true, email: true } },
      tenant: { select: { id: true, name: true, status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  const affected = [] as typeof activeTenantUsers;
  for (const tenantUser of activeTenantUsers) {
    const email = tenantUser.user.email.trim().toLowerCase();
    const allowed = await prisma.allowedUser.findUnique({
      where: { tenantId_email: { tenantId: tenantUser.tenantId, email } },
      select: { id: true, active: true, status: true },
    });
    if (!allowed || !allowed.active || allowed.status !== 'active') affected.push(tenantUser);
  }

  console.log('Repair direct user access');
  console.log(`Mode: ${dryRun ? 'dry-run' : 'apply'}`);
  console.log(`Active tenant_users scanned: ${activeTenantUsers.length}`);
  console.log(`Missing or inactive allowed_users before: ${affected.length}`);

  for (const tenantUser of affected) {
    const email = tenantUser.user.email.trim().toLowerCase();
    console.log(`- ${email} | tenant=${tenantUser.tenant.name} (${tenantUser.tenantId}) | role=${tenantUser.role}`);
    if (dryRun) continue;
    await prisma.allowedUser.upsert({
      where: { tenantId_email: { tenantId: tenantUser.tenantId, email } },
      create: {
        tenantId: tenantUser.tenantId,
        email,
        role: tenantUser.role,
        active: true,
        status: 'active',
        source: 'direct_user_access_repair',
        acceptedAt: new Date(),
      },
      update: {
        role: tenantUser.role,
        active: true,
        status: 'active',
        source: 'direct_user_access_repair',
        acceptedAt: new Date(),
      },
    });
  }

  if (!dryRun) {
    let remaining = 0;
    for (const tenantUser of affected) {
      const email = tenantUser.user.email.trim().toLowerCase();
      const allowed = await prisma.allowedUser.findUnique({
        where: { tenantId_email: { tenantId: tenantUser.tenantId, email } },
        select: { active: true, status: true },
      });
      if (!allowed || !allowed.active || allowed.status !== 'active') remaining += 1;
    }
    console.log(`Missing or inactive allowed_users after: ${remaining}`);
  } else {
    console.log('Missing or inactive allowed_users after: unchanged (dry-run)');
  }
}

main()
  .catch((error) => {
    console.error('Repair failed', { message: error?.message, code: error?.code, meta: error?.meta });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

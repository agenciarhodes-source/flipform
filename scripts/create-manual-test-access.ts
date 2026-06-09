import { prisma } from '@/lib/prisma';
import { createManualAccess } from '@/services/admin/manual-access-service';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurado.');

  const email = String(process.env.ADMIN_TEST_EMAIL || '').trim().toLowerCase();
  const password = String(process.env.ADMIN_TEST_PASSWORD || '');
  const planSlug = String(process.env.ADMIN_TEST_PLAN || 'growth').trim().toLowerCase();
  const role = String(process.env.ADMIN_TEST_ROLE || 'owner').trim().toLowerCase();
  const tenantId = String(process.env.ADMIN_TEST_TENANT_ID || '').trim() || null;
  const adminUserId = String(process.env.ADMIN_USER_ID || '').trim() || null;

  if (!email) throw new Error('ADMIN_TEST_EMAIL é obrigatório.');
  if (!password || password.length < 8) throw new Error('ADMIN_TEST_PASSWORD é obrigatório e deve ter ao menos 8 caracteres.');

  const output = await createManualAccess({
    email,
    password,
    planSlug,
    role,
    status: 'active',
    active: true,
    tenantId,
    adminUserId,
  });

  console.log('Manual test access created successfully');
  console.log(`email=${output.user.email}`);
  console.log(`tenantId=${output.tenant.id}`);
  console.log(`userId=${output.user.id}`);
  console.log(`allowedUserId=${output.allowedUser.id}`);
  console.log(`subscriptionId=${output.subscription.id}`);
  console.log('success=true');
}

main()
  .catch((error) => {
    console.error('Manual test access failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

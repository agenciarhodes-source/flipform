import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_ACCESS_IN_PRODUCTION !== 'true') {
    throw new Error('Refusing to run in production without ALLOW_DEMO_ACCESS_IN_PRODUCTION=true');
  }
  const tenant = await prisma.tenant.upsert({ where: { slug: 'leadflow-demo' }, update: { status: 'active' }, create: { name: 'LeadFlow Demo', slug: 'leadflow-demo', status: 'active' } });
  const passwordHash = await bcrypt.hash('demo123', 10);
  const user = await prisma.user.upsert({ where: { email: 'demo@leadflow.com' }, update: { name: 'LeadFlow Demo', passwordHash }, create: { name: 'LeadFlow Demo', email: 'demo@leadflow.com', passwordHash } });
  await prisma.tenantUser.upsert({ where: { tenantId_userId: { tenantId: tenant.id, userId: user.id } }, update: { role: 'owner', status: 'active' }, create: { tenantId: tenant.id, userId: user.id, role: 'owner', status: 'active' } });
  await prisma.allowedUser.upsert({ where: { tenantId_email: { tenantId: tenant.id, email: 'demo@leadflow.com' } }, update: { role: 'owner', status: 'active', active: true }, create: { tenantId: tenant.id, email: 'demo@leadflow.com', role: 'owner', status: 'active', active: true } });
}

main().finally(async () => prisma.$disconnect());

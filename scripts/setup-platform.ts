/**
 * Setup idempotente da Plataforma FlipForm (Fase 8).
 * - Cria o usuário Platform Admin (admin@flipform.com.br / flipform2025) se não existir.
 * - Cria planos padrão (Free / Starter / Pro / Business) se não existirem.
 * - Não toca em tenants/leads/users existentes.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🛠  FlipForm — setup platform (idempotente)...');

  // 1. Platform Admin
  const adminEmail = 'admin@flipform.com.br';
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (!existingAdmin) {
    const hash = await bcrypt.hash('flipform2025', 10);
    await prisma.user.create({
      data: {
        name: 'FlipForm Admin',
        email: adminEmail,
        passwordHash: hash,
        globalRole: 'platform_admin',
      },
    });
    console.log(`✅ Platform Admin criado: ${adminEmail} / flipform2025`);
  } else if (existingAdmin.globalRole !== 'platform_admin') {
    await prisma.user.update({ where: { id: existingAdmin.id }, data: { globalRole: 'platform_admin' } });
    console.log(`✅ Platform Admin atualizado (globalRole set): ${adminEmail}`);
  } else {
    console.log(`ℹ️  Platform Admin já existe: ${adminEmail}`);
  }

  // 2. Planos padrão
  const plans = [
    { name: 'Free', slug: 'free', description: 'Plano gratuito para testar', price: 0, billingCycle: 'monthly', maxUsers: 2, maxForms: 1, maxLeadsPerMonth: 100, maxPipelines: 1, canUseReports: false, canExportCsv: false, canUseCustomBranding: false, canUseMetaPixel: false, canUseWebhooks: false, canUseTasks: true },
    { name: 'Starter', slug: 'starter', description: 'Para times pequenos', price: 49, billingCycle: 'monthly', maxUsers: 5, maxForms: 5, maxLeadsPerMonth: 1000, maxPipelines: 3, canUseReports: true, canExportCsv: false, canUseCustomBranding: false, canUseMetaPixel: false, canUseWebhooks: false, canUseTasks: true },
    { name: 'Pro', slug: 'pro', description: 'Para times em crescimento', price: 149, billingCycle: 'monthly', maxUsers: 15, maxForms: 20, maxLeadsPerMonth: 10000, maxPipelines: 10, canUseReports: true, canExportCsv: true, canUseCustomBranding: true, canUseMetaPixel: true, canUseWebhooks: true, canUseTasks: true },
    { name: 'Business', slug: 'business', description: 'Empresas com alto volume de leads', price: 399, billingCycle: 'monthly', maxUsers: 50, maxForms: 100, maxLeadsPerMonth: 100000, maxPipelines: 50, canUseReports: true, canExportCsv: true, canUseCustomBranding: true, canUseMetaPixel: true, canUseWebhooks: true, canUseTasks: true },
  ] as const;

  for (const p of plans) {
    const existing = await prisma.plan.findFirst({ where: { name: p.name } });
    if (!existing) {
      await prisma.plan.create({ data: { ...p, billingCycle: p.billingCycle as any } });
      console.log(`✅ Plano criado: ${p.name} — R$ ${p.price}`);
    } else {
      console.log(`ℹ️  Plano já existe: ${p.name}`);
    }
  }

  console.log('✅ Setup da plataforma concluído.');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());

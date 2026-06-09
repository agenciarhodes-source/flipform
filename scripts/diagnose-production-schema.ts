import { prisma } from '@/lib/prisma';
import { getFailedAdminSchemaChecks, runAdminSchemaReadinessChecks } from '@/lib/admin/assert-admin-schema-ready';

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurado.');

  const checks = await runAdminSchemaReadinessChecks();

  console.log('Diagnóstico do schema de produção — admin manual access');
  console.log('=======================================================');
  for (const check of checks) {
    console.log(`${check.ok ? 'OK' : 'FAIL'}: ${check.label}${check.detail ? ` — ${check.detail}` : ''}`);
    if (!check.ok && check.suggestion) console.log(`SQL sugerido: ${check.suggestion}`);
  }
  console.log('=======================================================');

  const failed = getFailedAdminSchemaChecks(checks, 'diagnostic');
  if (failed.length) {
    console.log(`Resultado: FAIL (${failed.length} item(ns) essencial(is) desalinhado(s))`);
    process.exitCode = 1;
    return;
  }

  console.log('Resultado: OK (schema alinhado para acesso manual admin)');
}

main()
  .catch((error) => {
    console.error('FAIL: diagnóstico interrompido.', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

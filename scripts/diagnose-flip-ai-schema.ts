import { prisma } from '@/lib/prisma';
import { inspectFlipAiSchema } from '@/lib/flip-ai/schema-readiness';

function list(label: string, values: string[]) {
  console.log(`${label}: ${values.length ? values.join(', ') : 'nenhum'}`);
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL não configurado.');

  const readiness = await inspectFlipAiSchema();
  console.log('Diagnóstico somente leitura — schema Flip AI');
  console.log('===========================================');
  console.log(`Schema: ${readiness.schemaReady ? 'OK' : 'FAIL'}`);
  console.log(`Catálogo Premium: ${readiness.catalogReady ? 'OK' : 'FAIL'}`);
  console.log(`Extensão vector: ${readiness.vectorReady ? 'OK' : 'FAIL'}`);
  console.log(`Planos Premium encontrados: ${readiness.premiumPlanCount}`);
  console.log(`Planos Premium ativos: ${readiness.activePremiumPlanCount}`);
  list('Tabelas ausentes', readiness.missingTables);
  list('Índices ausentes', readiness.missingIndexes);
  list('Colunas ausentes', readiness.missingColumns);
  list('Tipos incompatíveis em flip_ai_qualifications', readiness.incompatibleQualificationColumns);
  console.log('===========================================');
  console.log(`Resultado: ${readiness.ready ? 'OK' : 'FAIL'}`);
  if (!readiness.ready) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('FAIL: diagnóstico interrompido.', error);
    process.exitCode = 1;
  })
  .finally(async () => prisma.$disconnect());

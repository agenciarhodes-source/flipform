import { prisma } from '@/lib/prisma';

async function main() {
  const tenantId = process.argv.find((arg) => arg.startsWith('--tenant='))?.split('=')[1];
  const dryRun = !process.argv.includes('--apply');

  const pipelines = await prisma.pipeline.findMany({
    where: { ...(tenantId ? { tenantId } : {}), isArchived: false },
    select: { id: true, tenantId: true, name: true },
  });

  let total = 0;
  for (const pipeline of pipelines) {
    const finalStage = await prisma.pipelineStage.findFirst({
      where: { pipelineId: pipeline.id, isArchived: false },
      orderBy: { orderIndex: 'desc' },
      select: { id: true, name: true },
    });
    if (!finalStage) continue;

    const where = { tenantId: pipeline.tenantId, pipelineId: pipeline.id, stageId: finalStage.id, status: { not: 'won' as const } };
    const count = await prisma.lead.count({ where });
    total += count;
    console.log(`${dryRun ? '[dry-run]' : '[apply]'} ${pipeline.name}: ${count} lead(s) na etapa final "${finalStage.name}" seriam marcados como won/hot.`);

    if (!dryRun && count > 0) {
      await prisma.lead.updateMany({ where, data: { status: 'won', temperature: 'hot' } });
    }
  }

  console.log(`${dryRun ? 'Nenhum dado alterado.' : 'Atualização concluída.'} Total: ${total} lead(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  await prisma.$disconnect();
});

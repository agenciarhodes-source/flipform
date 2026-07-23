import { prisma } from '../lib/prisma';

const apply = process.argv.includes('--apply');
async function main() {
  const candidates = await prisma.leadPurchase.findMany({ where: { amountCents: { gte: 1, lte: 99 }, createdBy: null }, select: { id: true, tenantId: true, leadId: true, amountCents: true, purchaseDate: true } });
  console.log(`Reparo de receita suspeita (${apply ? 'APPLY' : 'dry-run'}). Candidatos inequívocos: ${candidates.length}`);
  for (const candidate of candidates) {
    console.log(`Antes: id=${candidate.id} tenant=${candidate.tenantId} lead=${candidate.leadId} amountCents=${candidate.amountCents} createdBy=null`);
    if (!apply) continue;
    // An automatic, unattributed 1–99 cent purchase is the documented bug signature.
    await prisma.leadPurchase.delete({ where: { id: candidate.id } });
    console.log(`Depois: id=${candidate.id} removido`);
  }
  if (!apply) console.log('Nenhum dado foi alterado. Use --apply somente após revisar este resultado e o diagnóstico.');
}
main().catch((error) => { console.error('Reparo falhou', error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

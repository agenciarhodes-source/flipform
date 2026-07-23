import { prisma } from '../lib/prisma';

const dryRun = process.argv.includes('--dry-run');
type Finding = { tenant: string; lead: string; purchase: string; amountCents: number | null; date: Date | null; createdBy: string | null; reason: string };

function print(finding: Finding) {
  console.log(JSON.stringify({ Tenant: finding.tenant, Lead: finding.lead, Compra: finding.purchase, 'Valor em centavos': finding.amountCents, Data: finding.date?.toISOString() ?? null, 'Criado por': finding.createdBy, 'Motivo da suspeita': finding.reason }));
}

async function main() {
  console.log(`Diagnóstico de receita suspeita (${dryRun ? 'dry-run' : 'somente leitura'})`);
  const findings: Finding[] = [];
  const purchases = await prisma.leadPurchase.findMany({ include: { tenant: { select: { name: true } }, lead: { select: { id: true } } }, orderBy: { createdAt: 'asc' } });
  for (const purchase of purchases) {
    if (purchase.amountCents >= 1 && purchase.amountCents <= 99) findings.push({ tenant: purchase.tenant.name, lead: purchase.lead.id, purchase: purchase.id, amountCents: purchase.amountCents, date: purchase.purchaseDate, createdBy: purchase.createdBy, reason: 'LeadPurchase entre 1 e 99 centavos' });
    if (!purchase.createdBy) findings.push({ tenant: purchase.tenant.name, lead: purchase.lead.id, purchase: purchase.id, amountCents: purchase.amountCents, date: purchase.purchaseDate, createdBy: null, reason: 'LeadPurchase sem createdBy (possível criação automática)' });
  }
  const legacy = await prisma.lead.findMany({ where: { saleValueCents: { gt: 0 } }, include: { tenant: { select: { name: true } } } });
  for (const lead of legacy) {
    if ((lead.saleValueCents || 0) <= 99 || !lead.saleValueUpdatedBy || !lead.saleValueUpdatedAt) findings.push({ tenant: lead.tenant.name, lead: lead.id, purchase: '—', amountCents: lead.saleValueCents, date: lead.saleValueUpdatedAt, createdBy: lead.saleValueUpdatedBy, reason: (lead.saleValueCents || 0) <= 99 ? 'saleValueCents legado entre 1 e 99 centavos' : 'saleValueCents legado sem evidência completa de atualização manual' });
  }
  findings.forEach(print);
  console.log(`Registros analisados: compras=${purchases.length}, valores legados=${legacy.length}, suspeitas=${findings.length}`);
  console.log('O Dashboard atual deve equivaler exclusivamente à soma de lead_purchases.amount_cents por purchase_date; valores legados não são receita do Dashboard.');
}
main().catch((error) => { console.error('Diagnóstico falhou', error); process.exitCode = 1; }).finally(() => prisma.$disconnect());

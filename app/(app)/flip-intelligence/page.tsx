import { redirect } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { getVerifiedSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getWorkspace360Access } from '@/lib/workspace-360/access';

export const dynamic = 'force-dynamic';
export default async function FlipIntelligencePage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');
  if (!(await getWorkspace360Access(session)).intelligence) redirect('/dashboard');
  const tenantId = session.tenantId;
  const metrics = await prisma.$transaction([
    prisma.lead.count({ where: { tenantId } }),
    prisma.lead.count({ where: { tenantId, status: 'open' } }),
    prisma.lead.count({ where: { tenantId, status: 'won' } }),
    prisma.lead.count({ where: { tenantId, status: 'lost' } }),
    prisma.pipeline.count({ where: { tenantId, isArchived: false } }),
    prisma.form.count({ where: { tenantId, isActive: true } }),
  ]).catch(() => null);
  const labels = ['Leads cadastrados','Leads em aberto','Leads ganhos','Leads perdidos','Pipelines não arquivados','Formulários ativos'];
  return <main className="p-6 max-w-7xl space-y-6">
    <header><h1 className="text-3xl font-bold">Flip Intelligence</h1><p className="text-sm text-muted-foreground mt-1">Visão empresarial baseada em dados disponíveis da empresa atual.</p></header>
    <section className="space-y-3"><h2 className="font-semibold text-lg">CRM — situação atual</h2><p className="text-sm text-muted-foreground">Contagens reais do FlipForm, de todos os períodos. Leads ganhos representam o status cadastrado, não faturamento ou contratos assinados.</p>
      {metrics ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{labels.map((label,i)=><div key={label} className="rounded-xl border bg-card p-5"><p className="text-sm text-muted-foreground">{label}</p><p className="text-3xl font-semibold mt-2">{metrics[i].toLocaleString('pt-BR')}</p></div>)}</div> : <p role="alert" className="rounded-xl border p-4 text-sm">Não foi possível consultar os dados agora. Nenhum valor foi estimado.</p>}
    </section>
    <section className="grid gap-3 md:grid-cols-3">{['Financeiro e ERP','Marketing e publicidade','Previsões e recomendações'].map(name=><div key={name} className="rounded-xl border bg-card p-5 space-y-2"><h2 className="font-semibold">{name}</h2><p className="text-sm text-muted-foreground">Dados ainda não homologados nesta seção. Indicadores serão exibidos quando houver fonte e cobertura verificadas.</p></div>)}</section>
    <Link href="/dashboard" className={buttonVariants({ variant: "outline", size: "sm" })}>Abrir dashboard existente</Link>
  </main>;
}

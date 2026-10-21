import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { listLearning } from '@/lib/flip/learning';
import { LearningBoard } from '@/components/whatsapp-ai/learning-board';

export const dynamic = 'force-dynamic';

/** The company's learnings from its own attendance, to approve for every attendant of the company. */
export default async function LearningPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.tenantId || !can(session.role, 'FLIP_AI_MANAGE')) redirect('/dashboard');
  const view = await listLearning(session.tenantId);
  return (
    <section className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <header>
        <Link href="/whatsapp-ai" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mb-2' })}>← Atendimento WhatsApp</Link>
        <h1 className="text-2xl font-semibold">Aprendizado do atendimento</h1>
        <p className="text-sm text-muted-foreground">
          O Flip estuda os atendimentos da equipe (os que deram certo e os que não avançaram) e as melhorias apontadas pela
          Supervisão da IA, e sugere lições. Nada muda sozinho: cada lição aprovada entra no Markdown Mestre de todos os
          atendentes da empresa, organizada por tema. Depois é só processar a base de cada um. Os aprendizados são só desta empresa.
        </p>
      </header>
      <LearningBoard initial={view.pending} approved={view.approved} lastRunAt={view.lastRunAt ? view.lastRunAt.toISOString() : null} agents={view.agents} />
    </section>
  );
}

import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { listLearning } from '@/lib/flip/learning';
import { LearningBoard } from '@/components/whatsapp-ai/learning-board';

export const dynamic = 'force-dynamic';

/** What the human attendance did well, to approve into the Markdown Mestre. */
export default async function LearningPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.tenantId || !can(session.role, 'FLIP_AI_MANAGE')) redirect('/dashboard');
  const view = await listLearning(session.tenantId);
  return (
    <section className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <header>
        <Link href="/whatsapp-ai" className="text-sm text-brand-700 underline">← Atendimento WhatsApp</Link>
        <h1 className="text-2xl font-semibold">Aprendizado do atendimento</h1>
        <p className="text-sm text-muted-foreground">
          O Flip estuda os atendimentos da equipe que deram certo e sugere boas práticas para a IA. Nada muda sozinho:
          cada sugestão aprovada entra no Markdown Mestre como nova revisão, e depois é só processar a base.
        </p>
      </header>
      <LearningBoard
        initial={view.pending.map(({ createdAt: _createdAt, ...item }) => item)}
        lastRunAt={view.lastRunAt ? view.lastRunAt.toISOString() : null}
        approvedCount={view.approvedCount}
      />
    </section>
  );
}

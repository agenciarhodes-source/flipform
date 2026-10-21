import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { reviewPendingConversations, supervisionView } from '@/lib/whatsapp-ai/reviews';
import { SupervisionBoard } from '@/components/whatsapp-ai/supervision-board';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Supervision of the AI on WhatsApp: opening the page reviews up to 10 conversations that stopped. */
export default async function SupervisionPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.tenantId || !can(session.role, 'FLIP_AI_MANAGE')) redirect('/dashboard');
  const { reviewed } = await reviewPendingConversations(session.tenantId).catch(() => ({ reviewed: 0 }));
  const view = await supervisionView(session.tenantId);
  return (
    <section className="mx-auto max-w-5xl space-y-4 p-4 md:p-6">
      <header>
        <Link href="/whatsapp-ai" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mb-2' })}>← Atendimento WhatsApp</Link>
        <h1 className="text-2xl font-semibold">Supervisão da IA</h1>
        <p className="text-sm text-muted-foreground">
          O Flip revisa as conversas que a IA atendeu no WhatsApp e que pararam (sem mensagens há 2 h, assumidas pela equipe ou em que o cliente pediu para sair),
          dá uma nota e aponta o que melhorar. Cada abertura desta página revisa até 10 conversas novas.
        </p>
      </header>
      <SupervisionBoard initial={view.reviews} week={view.week} reviewedNow={reviewed} />
    </section>
  );
}

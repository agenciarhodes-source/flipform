import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { AttendanceProductivityBoard } from '@/components/reports/attendance-productivity-board';

export const dynamic = 'force-dynamic';

/** How the human attendance is doing: speed, volume, results and the AI evaluation of the approach. */
export default async function AttendanceProductivityPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'REPORTS_VIEW')) redirect('/dashboard');
  return (
    <section className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <header>
        <Link href="/reports" className={buttonVariants({ variant: 'outline', size: 'sm', className: 'mb-2' })}>← Relatórios</Link>
        <h1 className="text-2xl font-semibold">Produtividade do atendimento</h1>
        <p className="text-sm text-muted-foreground">
          Como a equipe está atendendo no WhatsApp: rapidez, volume, resultados e a qualidade da abordagem.
          {can(session.role, 'REPORTS_VIEW_ALL') ? '' : ' Você vê apenas os seus números.'}
        </p>
      </header>
      <AttendanceProductivityBoard />
    </section>
  );
}

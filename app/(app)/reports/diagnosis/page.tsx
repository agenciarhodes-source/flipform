import Link from 'next/link';
import { redirect } from 'next/navigation';
import { buttonVariants } from '@/components/ui/button';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { AttendanceDiagnosisBoard } from '@/components/reports/attendance-diagnosis-board';

export const dynamic = 'force-dynamic';

/** Diagnóstico de atendimento: one written diagnosis of the whole team. */
export default async function AttendanceDiagnosisPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'REPORTS_VIEW_ALL')) redirect('/dashboard');
  return (
    <section className="mx-auto max-w-6xl space-y-4 p-4 md:p-6">
      <Link href="/reports" className={buttonVariants({ variant: 'outline', size: 'sm' })}>← Relatórios</Link>
      <AttendanceDiagnosisBoard />
    </section>
  );
}

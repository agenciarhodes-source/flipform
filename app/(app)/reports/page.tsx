import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { ReportsPageClient } from '@/components/reports-page-client';

export default async function ReportsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'REPORTS_VIEW')) {
    return (
      <div className="p-8">
        <h1 className="font-heading text-2xl font-bold mb-2">Relatórios</h1>
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6">
          <p className="text-sm">Você não tem permissão para acessar os relatórios.</p>
        </div>
      </div>
    );
  }
  const canExport = can(session.role, 'REPORTS_EXPORT');
  return <ReportsPageClient canExport={canExport} />;
}

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { getReportTenant } from '@/lib/report-tenant';
import { CommercialReport } from '@/components/print-report/commercial-report';

export default async function CommercialReportPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'REPORTS_VIEW')) redirect('/reports');
  const tenant = await getReportTenant(session.tenantId);
  return <CommercialReport tenantName={tenant.name} tenantLogoUrl={tenant.logoUrl} />;
}

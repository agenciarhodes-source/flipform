import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { getReportTenant } from '@/lib/report-tenant';
import { DashboardReport } from '@/components/print-report/dashboard-report';

export default async function DashboardReportPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'DASHBOARD_VIEW')) redirect('/dashboard');
  const tenant = await getReportTenant(session.tenantId);
  return <DashboardReport tenantName={tenant.name} tenantLogoUrl={tenant.logoUrl} />;
}

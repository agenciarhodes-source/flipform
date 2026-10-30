import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { getReportTenant } from '@/lib/report-tenant';
import { AttendanceDiagnosisReport } from '@/components/print-report/attendance-diagnosis-report';

export default async function AttendanceDiagnosisPrintPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'REPORTS_VIEW_ALL')) redirect('/reports');
  const tenant = await getReportTenant(session.tenantId);
  return <AttendanceDiagnosisReport tenantName={tenant.name} tenantLogoUrl={tenant.logoUrl} />;
}

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { computeFlipAlerts } from '@/lib/flip/alerts';
import { FlipAlertsBoard } from '@/components/flip/alerts-board';

export const dynamic = 'force-dynamic';

export default async function FlipPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!session.tenantId || !can(session.role, 'LEADS_VIEW')) redirect('/dashboard');
  return <FlipAlertsBoard initial={await computeFlipAlerts(session)} />;
}

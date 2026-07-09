import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { SalesRotationClient } from '@/components/sales-rotation-client';

export default async function SalesRotationPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'LEAD_ASSIGNMENT_ROTATION_VIEW')) redirect('/dashboard');
  return <SalesRotationClient canManage={can(session.role, 'LEAD_ASSIGNMENT_ROTATION_MANAGE')} />;
}

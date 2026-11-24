import { redirect } from 'next/navigation';
import { getVerifiedSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { AutomationWorkspaceClient } from './automation-workspace-client';

export default async function AutomationsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'INTEGRATIONS_VIEW')) redirect('/dashboard');

  return (
    <AutomationWorkspaceClient
      canEdit={can(session.role, 'INTEGRATIONS_EDIT')}
    />
  );
}

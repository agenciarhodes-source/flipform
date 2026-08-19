import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { InstagramCommentAutomationClient } from './instagram-comment-automation-client';

export default async function AutomationsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'INTEGRATIONS_VIEW')) redirect('/dashboard');

  return (
    <InstagramCommentAutomationClient
      canEdit={can(session.role, 'INTEGRATIONS_EDIT')}
    />
  );
}

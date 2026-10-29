import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { tenantHasMessagingPlan } from '@/lib/billing/plan-access';
import { MessagingPlanNotice } from '@/components/billing/messaging-plan-notice';
import { InboxClient } from './inbox-client';

export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'INBOX_VIEW')) redirect('/dashboard');
  if (!(await tenantHasMessagingPlan(session.tenantId))) return <MessagingPlanNotice channel="whatsapp" />;

  return (
    <InboxClient
      canManage={can(session.role, 'INBOX_MANAGE')}
      canAssign={['owner', 'admin', 'manager'].includes(session.role)}
      canSendWhatsApp={can(session.role, 'LEADS_CONTACT_WHATSAPP')}
      canSendInstagram={can(session.role, 'INBOX_MANAGE')}
      currentUserId={session.userId}
    />
  );
}

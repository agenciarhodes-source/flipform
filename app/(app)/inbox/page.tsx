import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { InboxClient } from './inbox-client';

export default async function InboxPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'INBOX_VIEW')) redirect('/dashboard');

  return (
    <InboxClient
      canManage={can(session.role, 'INBOX_MANAGE')}
      canSendWhatsApp={can(session.role, 'LEADS_CONTACT_WHATSAPP')}
    />
  );
}

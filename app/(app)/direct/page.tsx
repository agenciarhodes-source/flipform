import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { InboxClient } from '../inbox/inbox-client';

/** Direct: the Instagram conversations, apart from the WhatsApp ones in the Inbox. */
export default async function DirectPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'INBOX_VIEW')) redirect('/dashboard');

  return (
    <InboxClient
      channel="instagram"
      canManage={can(session.role, 'INBOX_MANAGE')}
      canAssign={['owner', 'admin', 'manager'].includes(session.role)}
      canSendWhatsApp={can(session.role, 'LEADS_CONTACT_WHATSAPP')}
      canSendInstagram={can(session.role, 'INBOX_MANAGE')}
      currentUserId={session.userId}
    />
  );
}

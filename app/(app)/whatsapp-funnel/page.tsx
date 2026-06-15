import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { WhatsAppFunnelClient } from './whatsapp-funnel-client';

export default async function WhatsAppFunnelPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'INTEGRATIONS_VIEW')) redirect('/dashboard');
  return <WhatsAppFunnelClient />;
}

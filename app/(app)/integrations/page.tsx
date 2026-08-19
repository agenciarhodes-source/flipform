import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { ClientConnectionOnboarding } from './client-connection-onboarding';
import { IntegrationsClient } from './integrations-client';
import { WhatsAppEmbeddedSignupCard } from './whatsapp-embedded-signup-card';
import { WhatsAppConnectionHealthCard } from './whatsapp-connection-health-card';
import { InstagramBusinessLoginCard } from './instagram-business-login-card';

export default async function IntegrationsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'INTEGRATIONS_VIEW')) redirect('/dashboard');
  return <>
    <ClientConnectionOnboarding />
    <IntegrationsClient />
    <div id="whatsapp-connection" className="scroll-mt-24">
      <WhatsAppEmbeddedSignupCard />
      <WhatsAppConnectionHealthCard />
    </div>
    <div id="instagram-connection" className="scroll-mt-24">
      <InstagramBusinessLoginCard />
    </div>
  </>;
}

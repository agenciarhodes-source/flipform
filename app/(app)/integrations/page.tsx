import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { ClientConnectionOnboarding } from './client-connection-onboarding';
import { IntegrationsClient } from './integrations-client';
import { WhatsAppEmbeddedSignupCard } from './whatsapp-embedded-signup-card';
import { WhatsAppTemplatesCard } from './whatsapp-templates-card';

export default async function IntegrationsPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'INTEGRATIONS_VIEW')) redirect('/dashboard');
  return <>
    <ClientConnectionOnboarding />
    <IntegrationsClient />
    <div id="whatsapp-connection" className="scroll-mt-24">
      <WhatsAppEmbeddedSignupCard />
    </div>
    <div id="whatsapp-templates" className="scroll-mt-24">
      <WhatsAppTemplatesCard />
    </div>
  </>;
}

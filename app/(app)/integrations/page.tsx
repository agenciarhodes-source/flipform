import { redirect } from 'next/navigation';
import { UniversalSandboxCard } from './universal-sandbox-card';
import { sandboxAvailable } from '@/lib/universal-connectors/sandbox-policy';
import { getVerifiedSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { ClientConnectionOnboarding } from './client-connection-onboarding';
import { GoogleFunnelCard } from './google-funnel-card';
import { IntegrationsClient } from './integrations-client';
import { ApiV1Card } from './api-v1-card';
import { apiV1Enabled } from '@/lib/api-v1/policy';
import { WhatsAppEmbeddedSignupCard } from './whatsapp-embedded-signup-card';
import { WhatsAppNumbersCard } from './whatsapp-numbers-card';
import { WhatsAppTemplatesCard } from './whatsapp-templates-card';
import { InstagramBusinessLoginCard } from './instagram-business-login-card';
import { tenantPlanSlug } from '@/lib/session-access';
import { isInboxOnlyPlan } from '@/lib/billing/inbox-plan-rules';

export default async function IntegrationsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'INTEGRATIONS_VIEW')) redirect('/dashboard');
  // Plano Inbox: only the WhatsApp numbers and their message templates.
  if (session.globalRole !== 'platform_admin' && isInboxOnlyPlan(await tenantPlanSlug(session.tenantId))) {
    return <div className="p-6 space-y-6 max-w-7xl">
      <div>
        <h1 className="text-3xl font-bold">Integrações</h1>
        <p className="text-sm text-muted-foreground mt-1">Conecte os números de WhatsApp da empresa e gerencie os modelos de mensagem.</p>
      </div>
      <div id="whatsapp-connection" className="scroll-mt-24 space-y-4">
        <WhatsAppEmbeddedSignupCard />
        <WhatsAppNumbersCard />
      </div>
      <div id="whatsapp-templates" className="scroll-mt-24">
        <WhatsAppTemplatesCard />
      </div>
    </div>;
  }
  return <>
    <ClientConnectionOnboarding />
    <IntegrationsClient />
    {session.role === 'developer' && sandboxAvailable(session.tenantId) && <UniversalSandboxCard />}
    {session.role === 'developer' && apiV1Enabled(process.env) && <ApiV1Card />}
    <div id="google-funnel" className="scroll-mt-24">
      <GoogleFunnelCard />
    </div>
    <div id="whatsapp-connection" className="scroll-mt-24">
      <WhatsAppEmbeddedSignupCard />
      <WhatsAppNumbersCard />
    </div>
    <div id="whatsapp-templates" className="scroll-mt-24">
      <WhatsAppTemplatesCard />
    </div>
    <div id="instagram-connection" className="scroll-mt-24">
      <InstagramBusinessLoginCard />
    </div>
  </>;
}

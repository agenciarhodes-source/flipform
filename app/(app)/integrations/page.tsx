import { redirect } from 'next/navigation';
import { UniversalSandboxCard } from './universal-sandbox-card';
import { sandboxAvailable } from '@/lib/universal-connectors/sandbox-policy';
import { getVerifiedSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { ClientConnectionOnboarding } from './client-connection-onboarding';
import { GoogleFunnelCard } from './google-funnel-card';
import { IntegrationsClient } from './integrations-client';
import { readCatalogConnectionCounts } from '@/lib/integration-catalog/connection-counts';
import { ConnectionCatalog } from './connection-catalog';
import { NativeApiPanel } from './native-api-panel';
import { getWorkspace360Access } from '@/lib/workspace-360/access';
import { WhatsAppEmbeddedSignupCard } from './whatsapp-embedded-signup-card';
import { WhatsAppNumbersCard } from './whatsapp-numbers-card';
import { WhatsAppTemplatesCard } from './whatsapp-templates-card';
import { InstagramBusinessLoginCard } from './instagram-business-login-card';
import { GoJusIntegrationCard } from './gojus-integration-card';
import { tenantHasFeature } from '@/lib/billing/tenant-features';
import { tenantPlanSlug } from '@/lib/session-access';
import { isInboxOnlyPlan } from '@/lib/billing/inbox-plan-rules';

export const dynamic = 'force-dynamic';
export default async function IntegrationsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'INTEGRATIONS_VIEW')) redirect('/dashboard');
  const status = await readCatalogConnectionCounts();
  // Plano Inbox: only WhatsApp numbers and templates.
  if (session.globalRole !== 'platform_admin' && isInboxOnlyPlan(await tenantPlanSlug(session.tenantId))) {
    return <div className="p-6 space-y-6 max-w-7xl">
      <div><h1 className="text-3xl font-bold">Integrações e API</h1><p className="text-sm text-muted-foreground mt-1">Conecte os números de WhatsApp da empresa e gerencie os modelos de mensagem.</p></div>
      <ConnectionCatalog universal={false} sandbox={false} api={false} inboxOnly status={{whatsapp:status.whatsapp,instagram:null,meta:null}} />
      <div id="whatsapp-connection" className="scroll-mt-24 space-y-4">
        <WhatsAppEmbeddedSignupCard />
        <WhatsAppNumbersCard />
      </div>
      <div id="whatsapp-templates" className="scroll-mt-24"><WhatsAppTemplatesCard /></div>
    </div>;
  }
  const access = await getWorkspace360Access(session);
  const sandbox = session.role === 'developer' && sandboxAvailable(session.tenantId);
  return <>
    <section className="p-6 max-w-7xl space-y-4">
      <h1 className="text-3xl font-bold">Integrações e API</h1>
      <p className="text-sm text-muted-foreground">Central de aplicativos, conexões e credenciais da empresa. Catálogo visual compartilhado pela plataforma; cada autorização é individual por empresa.</p>
      <ConnectionCatalog universal={access.universal} sandbox={sandbox} api={access.api} status={status} />
    </section>
    {access.api && <div className="px-6 max-w-7xl"><NativeApiPanel session={session} /></div>}
    <ClientConnectionOnboarding />
    <IntegrationsClient />
    {session.role === 'developer' && await tenantHasFeature(session.tenantId, 'gojus_robot') && <GoJusIntegrationCard />}
    {session.role === 'developer' && sandboxAvailable(session.tenantId) && <UniversalSandboxCard />}
    <div id="google-funnel" className="scroll-mt-24">
      <GoogleFunnelCard />
    </div>
    <div id="whatsapp-connection" className="scroll-mt-24">
      <WhatsAppEmbeddedSignupCard />
      <WhatsAppNumbersCard />
    </div>
    <div id="whatsapp-templates" className="scroll-mt-24"><WhatsAppTemplatesCard /></div>
    <div id="instagram-connection" className="scroll-mt-24"><InstagramBusinessLoginCard /></div>
  </>;
}

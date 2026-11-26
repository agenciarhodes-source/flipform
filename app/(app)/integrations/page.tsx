import { redirect } from 'next/navigation';
import { UniversalSandboxCard } from './universal-sandbox-card';
import { sandboxAvailable } from '@/lib/universal-connectors/sandbox-policy';
import { getVerifiedSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { ClientConnectionOnboarding } from './client-connection-onboarding';
import { GoogleFunnelCard } from './google-funnel-card';
import { IntegrationsClient } from './integrations-client';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { getWorkspace360Access } from '@/lib/workspace-360/access';
import { SYSTEM_CATEGORIES } from '@/lib/universal-connectors/catalog';
import { WhatsAppEmbeddedSignupCard } from './whatsapp-embedded-signup-card';
import { WhatsAppNumbersCard } from './whatsapp-numbers-card';
import { WhatsAppTemplatesCard } from './whatsapp-templates-card';
import { InstagramBusinessLoginCard } from './instagram-business-login-card';
import { GoJusIntegrationCard } from './gojus-integration-card';
import { tenantHasFeature } from '@/lib/billing/tenant-features';
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
  const access = await getWorkspace360Access(session);
  return <>
    <section className="p-6 max-w-7xl space-y-3"><h1 className="text-3xl font-bold">Integrações</h1><p className="text-sm text-muted-foreground">Conecte serviços externos ao FlipForm. As conexões existentes permanecem abaixo.</p>
      {access.api && <Link href="/developer-api" className={buttonVariants({ variant: "outline", size: "sm" })}>Administrar API e chaves do FlipForm</Link>}
      {access.universal && <div className="rounded-xl border bg-card p-5 space-y-3"><h2 className="font-semibold">Central de conexões universais</h2><p className="text-sm text-muted-foreground">Catálogo de categorias planejadas. Não representa contas conectadas nem sincronizações ativas.</p><div className="flex flex-wrap gap-2">{SYSTEM_CATEGORIES.map(category => <span key={category} className="rounded-full border px-3 py-1 text-xs">{category}</span>)}</div></div>}
    </section>
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
    <div id="whatsapp-templates" className="scroll-mt-24">
      <WhatsAppTemplatesCard />
    </div>
    <div id="instagram-connection" className="scroll-mt-24">
      <InstagramBusinessLoginCard />
    </div>
  </>;
}

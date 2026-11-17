import { notFound, redirect } from 'next/navigation';
import { getVerifiedSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { canManageTenantSupportKnowledge } from '@/lib/suporte-atendimento/access';
import { SupportKnowledgeConfig } from '@/components/suporte-atendimento/support-knowledge-config';

export const dynamic = 'force-dynamic';

export default async function SettingsSupportPage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'SETTINGS_VIEW') || !canManageTenantSupportKnowledge(session)) notFound();
  return <SupportKnowledgeConfig />;
}

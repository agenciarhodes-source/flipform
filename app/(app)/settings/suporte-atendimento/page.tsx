import { notFound, redirect } from 'next/navigation';
import { getVerifiedSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { globalSupportUploadEnabled } from '@/lib/suporte-atendimento/tenant-knowledge';
import { SupportKnowledgeConfig } from '@/components/suporte-atendimento/support-knowledge-config';

export const dynamic = 'force-dynamic';

export default async function SettingsSupportPage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');
  if (!globalSupportUploadEnabled() || !can(session.role, 'SETTINGS_VIEW')) notFound();
  return <SupportKnowledgeConfig />;
}

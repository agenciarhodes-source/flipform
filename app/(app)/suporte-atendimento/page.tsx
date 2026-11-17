import 'server-only';
import { readTenantSupportKnowledge } from '@/lib/suporte-atendimento/tenant-knowledge';
import { notFound, redirect } from 'next/navigation';
import { getVerifiedSession } from '@/lib/auth';
import { canReadTenantSupportKnowledge } from '@/lib/suporte-atendimento/access';
import { SupportKnowledgeClient } from '@/components/suporte-atendimento/support-knowledge-client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Suporte — FlipForm',
  robots: { index: false, follow: false },
};

export default async function SupportKnowledgePage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');

  // Fail closed: sem ID aprovado não há leitura nem descoberta por nome/slug.
  if (!canReadTenantSupportKnowledge(session, process.env.SUPPORT_KB_GLOBAL_ENABLED === 'true')) {
    notFound();
  }

  // Consulta somente a revisão do Markdown anexada pela própria empresa.
  const knowledge = await readTenantSupportKnowledge(session.tenantId);
  if (!knowledge) notFound();
  return <SupportKnowledgeClient markdown={knowledge.content} />;
}

import 'server-only';
import { readTenantSupportKnowledge, isTenantSupportActive } from '@/lib/suporte-atendimento/tenant-knowledge';
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

  // Consulta operacional é exclusiva do Atendente e seu próprio tenant.
  if (!canReadTenantSupportKnowledge(session) || !(await isTenantSupportActive(session.tenantId))) {
    notFound();
  }

  // Consulta somente a revisão do Markdown anexada pela própria empresa.
  try {
    const knowledge = await readTenantSupportKnowledge(session.tenantId);
    if (!knowledge) {
      return <div className="m-8 rounded-xl border p-6 text-sm">
        Nenhum manual de Suporte foi publicado para esta empresa.
        O Proprietário deve cadastrar o arquivo em Configurações → Suporte.
      </div>;
    }
    return <SupportKnowledgeClient markdown={knowledge.content} />;
  } catch {
    return <div className="m-8 rounded-xl border p-6 text-sm">
      Manual temporariamente indisponível. Comunique o Proprietário ou a equipe técnica.
    </div>;
  }
}

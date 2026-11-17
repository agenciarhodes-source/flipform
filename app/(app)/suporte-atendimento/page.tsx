import 'server-only';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { notFound, redirect } from 'next/navigation';
import { getVerifiedSession } from '@/lib/auth';
import { canReadJunqueiraSupportKnowledge } from '@/lib/suporte-atendimento/access';
import { SupportKnowledgeClient } from '@/components/suporte-atendimento/support-knowledge-client';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Suporte de Atendimento — FlipForm',
  robots: { index: false, follow: false },
};

export default async function SupportKnowledgePage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');

  // Fail closed: sem ID aprovado não há leitura nem descoberta por nome/slug.
  if (!canReadJunqueiraSupportKnowledge(session, process.env.SUPPORT_KB_JUNQUEIRA_TENANT_ID)) {
    notFound();
  }

  // Arquivo versionado. Configuração outputFileTracingIncludes garante inclusão
  // no build standalone/serverless sem usar banco, dados reais nem API externa.
  const content = await readFile(
    join(process.cwd(), 'docs', 'suporte-atendimento', 'JUNQUEIRA-BASE-DE-CONHECIMENTO.md'),
    'utf8',
  );

  return <SupportKnowledgeClient markdown={content} />;
}

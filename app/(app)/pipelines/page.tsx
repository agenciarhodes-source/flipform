import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { PipelinesPageClient } from '@/components/pipelines-page-client';

export default async function PipelinesPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'PIPELINES_VIEW')) {
    return <div className="p-8"><div className="rounded-md border border-dashed p-12 text-center text-muted-foreground">Acesso restrito.</div></div>;
  }
  return <PipelinesPageClient session={session} />;
}

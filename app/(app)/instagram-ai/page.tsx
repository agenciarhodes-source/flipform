import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Instagram } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { getVerifiedSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { FlipAiError } from '@/lib/flip-ai/access';
import { getInstagramAiWorkspace } from '@/lib/instagram-ai/settings';
import { InstagramAiSettingsManager } from '@/components/instagram-ai/settings-manager';

export const dynamic = 'force-dynamic';

export default async function InstagramAiPage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'FLIP_AI_MANAGE')) redirect('/dashboard');
  try {
    const workspace = await getInstagramAiWorkspace(session);
    return <InstagramAiSettingsManager initialWorkspace={workspace} />;
  } catch (error) {
    if (!(error instanceof FlipAiError)) throw error;
    return (
      <section className="mx-auto max-w-2xl space-y-4 p-6">
        <Instagram className="h-8 w-8 text-brand-600" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Atendimento Instagram</h1>
        <p>{error.message}</p>
        <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href="/dashboard">Voltar ao Dashboard</Link>
      </section>
    );
  }
}

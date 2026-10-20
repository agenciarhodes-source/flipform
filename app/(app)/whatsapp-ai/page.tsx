import Link from 'next/link';
import { redirect } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { FlipAiError } from '@/lib/flip-ai/access';
import { getWhatsAppAiWorkspace } from '@/lib/whatsapp-ai/settings';
import { WhatsAppAiSettingsManager } from '@/components/whatsapp-ai/settings-manager';
import { StageRulesManager } from '@/components/whatsapp-ai/stage-rules-manager';
import { listStageRulePipelines } from '@/lib/whatsapp-ai/stage-rules-server';

export const dynamic = 'force-dynamic';

export default async function WhatsAppAiPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'FLIP_AI_MANAGE')) redirect('/dashboard');
  try {
    const workspace = await getWhatsAppAiWorkspace(session);
    const pipelines = await listStageRulePipelines(session.tenantId);
    return (
      <>
        <WhatsAppAiSettingsManager initialWorkspace={workspace} />
        <div className="mx-auto max-w-4xl px-4 pb-6 md:px-6"><StageRulesManager initialPipelines={pipelines} /></div>
      </>
    );
  } catch (error) {
    if (!(error instanceof FlipAiError)) throw error;
    return (
      <section className="mx-auto max-w-2xl space-y-4 p-6">
        <MessageCircle className="h-8 w-8 text-brand-600" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Atendimento WhatsApp</h1>
        <p>{error.message}</p>
        <Link className="inline-block text-brand-600 underline" href="/dashboard">Voltar ao Dashboard</Link>
      </section>
    );
  }
}

import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { redirect } from 'next/navigation';
import { MessageCircle } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { FlipAiError } from '@/lib/flip-ai/access';
import { getWhatsAppAiWorkspace } from '@/lib/whatsapp-ai/settings';
import { WhatsAppAiSettingsManager } from '@/components/whatsapp-ai/settings-manager';
import { StageRulesManager } from '@/components/whatsapp-ai/stage-rules-manager';
import { listStageRulePipelines } from '@/lib/whatsapp-ai/stage-rules-server';
import { DocumentChecklistsManager } from '@/components/whatsapp-ai/document-checklists-manager';
import { PostSaleManager } from '@/components/whatsapp-ai/post-sale-manager';
import { prisma } from '@/lib/prisma';
import { checklistItemsToText, type ChecklistItem } from '@/lib/whatsapp-ai/document-rules';

export const dynamic = 'force-dynamic';

export default async function WhatsAppAiPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'FLIP_AI_MANAGE')) redirect('/dashboard');
  try {
    const workspace = await getWhatsAppAiWorkspace(session);
    const pipelines = await listStageRulePipelines(session.tenantId);
    const checklists = (await prisma.documentChecklist.findMany({
      where: { tenantId: session.tenantId },
      orderBy: { createdAt: 'asc' },
      select: { id: true, name: true, items: true, enabled: true },
    })).map((row) => ({
      id: row.id, name: row.name, enabled: row.enabled,
      itemsText: checklistItemsToText((Array.isArray(row.items) ? row.items : []) as unknown as ChecklistItem[]),
    }));
    return (
      <>
        <WhatsAppAiSettingsManager initialWorkspace={workspace} />
        <div className="mx-auto max-w-4xl space-y-5 px-4 pb-6 md:px-6">
          <StageRulesManager initialPipelines={pipelines} />
          <DocumentChecklistsManager initial={checklists} />
          <PostSaleManager />
        </div>
      </>
    );
  } catch (error) {
    if (!(error instanceof FlipAiError)) throw error;
    return (
      <section className="mx-auto max-w-2xl space-y-4 p-6">
        <MessageCircle className="h-8 w-8 text-brand-600" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Atendimento WhatsApp</h1>
        <p>{error.message}</p>
        <Link className={buttonVariants({ variant: 'outline', size: 'sm' })} href="/dashboard">Voltar ao Dashboard</Link>
      </section>
    );
  }
}

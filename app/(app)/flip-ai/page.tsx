import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Bot } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { getAgentDraftWorkspace } from '@/lib/flip-ai/agents';
import { FlipAiError } from '@/lib/flip-ai/access';
import { AgentDraftManager } from '@/components/flip-ai/agent-draft-manager';
export const dynamic = 'force-dynamic';

export default async function FlipAiPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  try {
    return <AgentDraftManager initialWorkspace={await getAgentDraftWorkspace(session)} />;
  } catch (error) {
    if (!(error instanceof FlipAiError)) throw error;
    return <section className="mx-auto max-w-2xl space-y-4 p-6">
      <Bot className="h-8 w-8 text-brand-600" aria-hidden="true" />
      <h1 className="text-2xl font-semibold">Flip AI</h1>
      <p>{error.message}</p>
      <Link className="inline-block text-brand-600 underline" href="/dashboard">Voltar ao Dashboard</Link>
    </section>;
  }
}

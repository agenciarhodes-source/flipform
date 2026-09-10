import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PublicFlipAiChatShell } from '@/components/flip-ai/public-chat-shell';
import { resolvePublicFlipAiAgent } from '@/lib/flip-ai/public-agent';

export const dynamic = 'force-dynamic';

export default async function CustomDomainFlipAiChatPage({ params }: { params: { slug: string } }) {
  const agent = await resolvePublicFlipAiAgent({
    slug: params.slug,
    customDomainHost: headers().get('host'),
  });
  if (!agent) notFound();
  return <PublicFlipAiChatShell agent={agent} />;
}

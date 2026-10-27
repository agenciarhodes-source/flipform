import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { PublicFlipAiChatShell } from '@/components/flip-ai/public-chat-shell';
import { chatAttachmentsEnabled } from '@/lib/flip-ai/chat-attachment-upload';
import { resolvePublicFlipAiAgent } from '@/lib/flip-ai/public-agent';

export const dynamic = 'force-dynamic';

export default async function CustomDomainFlipAiChatPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const agent = await resolvePublicFlipAiAgent({
    slug: params.slug,
    customDomainHost: (await headers()).get('host'),
  });
  if (!agent) notFound();
  return <PublicFlipAiChatShell agent={agent} attachmentsEnabled={chatAttachmentsEnabled()} />;
}

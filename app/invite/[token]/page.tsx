import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { InviteAcceptClient } from './invite-accept-client';

export default async function InvitePage({ params }: { params: { token: string } }) {
  const invite = await prisma.invite.findUnique({
    where: { token: params.token },
    include: { tenant: { select: { name: true, slug: true, primaryColor: true } } },
  });
  if (!invite) return notFound();
  const expired = invite.expiresAt < new Date();
  const inactive = invite.status !== 'pending';
  return <InviteAcceptClient
    token={params.token}
    invite={{
      email: invite.email,
      role: invite.role,
      tenant: invite.tenant,
      expired,
      inactive,
      status: invite.status,
    }}
  />;
}

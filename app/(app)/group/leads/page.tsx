import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getBusinessGroupAccessesForUser } from '@/lib/business-groups';
import { BusinessGroupLeadsClient } from '@/components/business-group-leads-client';

export default async function BusinessGroupLeadsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  const state = await getBusinessGroupAccessesForUser(prisma, session.userId);
  if (!state.schemaReady || !state.accesses.length) redirect('/dashboard');

  return <BusinessGroupLeadsClient />;
}

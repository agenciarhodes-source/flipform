import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { TeamOverviewClient } from '@/components/team-overview-client';

export default async function TeamPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!['owner', 'admin', 'manager'].includes(session.role)) redirect('/dashboard');
  return <TeamOverviewClient session={session} />;
}

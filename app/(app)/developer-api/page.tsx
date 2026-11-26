import { redirect } from 'next/navigation';
import { getVerifiedSession } from '@/lib/auth';
import { getWorkspace360Access } from '@/lib/workspace-360/access';
export const dynamic = 'force-dynamic';
export default async function DeveloperApiPage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');
  if (session.role !== 'developer' || !(await getWorkspace360Access(session)).api) redirect('/dashboard');
  redirect('/integrations#flipform-api');
}

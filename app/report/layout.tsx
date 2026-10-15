import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';

/** Printable reports: no menu or header around them, only the signed-in session is required. */
export default async function ReportLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  return <>{children}</>;
}

import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/rbac';
import { UsersPageClient } from '@/components/users-page-client';

export default async function UsersPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  if (!can(session.role, 'USERS_VIEW')) {
    return (
      <div className="p-8">
        <div className="rounded-md border border-dashed p-12 text-center">
          <h2 className="font-heading text-xl font-bold mb-2">Acesso restrito</h2>
          <p className="text-muted-foreground text-sm">Você não tem permissão para acessar a gestão de usuários.</p>
        </div>
      </div>
    );
  }
  return <UsersPageClient session={session} />;
}

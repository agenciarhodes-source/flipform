import { redirect } from 'next/navigation';
import { getVerifiedSession } from '@/lib/auth';
import { MfaCard } from '@/components/mfa/mfa-card';

/** Personal MFA is available for every authenticated role, including viewer.
 * Granting technical rights is separate and always requires verified MFA.
 */
export default async function AccountSecurityPage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');

  return (
    <main className="mx-auto max-w-2xl space-y-5 p-6">
      <div>
        <h1 className="font-heading text-2xl font-bold">Segurança da conta</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Ative a verificação em duas etapas para proteger sua conta. Se você recebeu
          uma concessão de Desenvolvedor, conclua a ativação abaixo e entre novamente
          para liberar as permissões técnicas autorizadas.
        </p>
      </div>
      <MfaCard />
    </main>
  );
}

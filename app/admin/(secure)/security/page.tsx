import { MfaCard } from '@/components/mfa/mfa-card';

/** Super Admin account security (security protocol S5). */
export default function AdminSecurityPage() {
  return (
    <div className="max-w-2xl space-y-4 p-6">
      <h1 className="font-heading text-2xl font-bold">Segurança da conta</h1>
      <MfaCard />
    </div>
  );
}

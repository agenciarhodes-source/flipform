import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PLATFORM_ADMIN_LABEL_PT_BR, ROLE_LABELS_PT_BR, type RoleName } from '@/lib/rbac';

export default async function AccountPage() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }

  const [tenant, sub] = await Promise.all([
    prisma.tenant.findUnique({ where: { id: session.tenantId }, select: { id: true, name: true, slug: true, status: true, createdAt: true } }),
    prisma.subscription.findFirst({ where: { tenantId: session.tenantId }, include: { plan: { select: { name: true } } }, orderBy: { createdAt: 'desc' } }),
  ]);

  return (
    <main className="p-8 max-w-4xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Conta</h1>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="border rounded p-4 space-y-2">
          <h2 className="font-semibold">Usuário</h2>
          <p><strong>Nome:</strong> {session.name}</p>
          <p><strong>E-mail:</strong> {session.email}</p>
          <p><strong>Perfil:</strong> {session.globalRole === 'platform_admin' ? PLATFORM_ADMIN_LABEL_PT_BR : (ROLE_LABELS_PT_BR[session.role as RoleName] || session.role)}</p>
        </section>
        <section className="border rounded p-4 space-y-2">
          <h2 className="font-semibold">Empresa</h2>
          <p><strong>Tenant:</strong> {tenant?.name || '—'}</p>
          <p><strong>Plano:</strong> {sub?.plan?.name || '—'}</p>
          <p><strong>Status da conta:</strong> {tenant?.status || '—'}</p>
          <p><strong>Status financeiro:</strong> {sub?.status || '—'}</p>
          <p><strong>Criada em:</strong> {tenant?.createdAt ? new Date(tenant.createdAt).toLocaleDateString('pt-BR') : '—'}</p>
        </section>
      </div>
      <section className="border rounded p-4 space-y-2">
        <h2 className="font-semibold">Privacidade e suporte</h2>
        <div className="flex flex-wrap gap-3 text-sm">
          <a className="px-3 py-2 border rounded" href="/api/account/export">Exportar meus dados</a>
          <Link className="px-3 py-2 border rounded" href="/billing">Solicitar exclusão</Link>
          <Link className="px-3 py-2 border rounded" href="/terms">Termos de uso</Link>
          <Link className="px-3 py-2 border rounded" href="/privacy">Política de privacidade</Link>
          <a className="px-3 py-2 border rounded" href="mailto:atendimento@flipform.com.br">Falar com suporte</a>
        </div>
      </section>
    </main>
  );
}

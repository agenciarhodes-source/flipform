import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AppShell } from '@/components/app-shell';
import Link from 'next/link';

const BLOCKED = new Set(['suspended', 'blocked', 'canceled', 'inactive']);

export default async function AppGroupLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/login');
  const tenant = await prisma.tenant.findUnique({
    where: { id: session.tenantId },
    select: { id: true, name: true, slug: true, primaryColor: true, logoUrl: true, status: true, nextDueDate: true },
  });

  // Bloqueio total: mostra tela amigável de acesso bloqueado
  if (tenant && BLOCKED.has(String(tenant.status))) {
    const labels: Record<string, string> = {
      suspended: 'O acesso da sua empresa foi suspenso.',
      blocked: 'O acesso da sua empresa foi bloqueado.',
      canceled: 'A assinatura da sua empresa foi cancelada.',
      inactive: 'A sua empresa está inativa.',
    };
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
        <div className="max-w-md bg-card border rounded-lg p-8 text-center shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 9v4M12 17h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /></svg>
          </div>
          <h1 className="font-heading text-2xl font-bold mb-2">Acesso indisponível</h1>
          <p className="text-sm text-muted-foreground mb-5">
            {labels[String(tenant.status)] || 'Acesso bloqueado.'} Entre em contato com o administrador da plataforma para regularizar.
          </p>
          <Link href="/api/auth/logout" prefetch={false} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Sair da conta</Link>
        </div>
      </div>
    );
  }

  return (
    <AppShell
      session={session}
      tenant={tenant ? {
        name: tenant.name,
        slug: tenant.slug,
        primaryColor: tenant.primaryColor,
        logoUrl: tenant.logoUrl,
        status: tenant.status,
        nextDueDate: tenant.nextDueDate ? tenant.nextDueDate.toISOString() : null,
      } : null}
    >
      {children}
    </AppShell>
  );
}

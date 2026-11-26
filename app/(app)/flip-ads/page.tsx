import { redirect } from 'next/navigation';
import Link from 'next/link';
import { buttonVariants } from '@/components/ui/button';
import { getVerifiedSession } from '@/lib/auth';
import { getWorkspace360Access } from '@/lib/workspace-360/access';

export const dynamic = 'force-dynamic';
export default async function FlipAdsPage() {
  const session = await getVerifiedSession();
  if (!session) redirect('/login');
  if (!(await getWorkspace360Access(session)).ads) redirect('/dashboard');
  return <main className="p-6 max-w-7xl space-y-6">
    <header><h1 className="text-3xl font-bold">Flip Ads</h1><p className="text-sm text-muted-foreground mt-1">Premium Pro · gestão e análise de publicidade.</p></header>
    <section className="rounded-xl border bg-card p-5 space-y-2"><h2 className="font-semibold">Disponibilidade operacional</h2><p className="text-sm">O acesso à seção está liberado pelo plano. A leitura de contas, sincronização de campanhas e publicação de anúncios ainda não foram homologadas.</p><p className="text-sm text-muted-foreground">Nenhum valor de investimento, campanha ou resultado é simulado. Conexões de Pixel e Data Manager existentes não comprovam acesso à API de anúncios.</p></section>
    <section className="grid gap-3 sm:grid-cols-2">{['Meta Ads','Google Ads','TikTok Ads','ChatGPT Ads'].map(provider=><div key={provider} className="rounded-xl border bg-card p-5 space-y-2"><h2 className="font-semibold">{provider}</h2><p className="text-sm text-muted-foreground">Relatórios de anúncios ainda indisponíveis neste módulo.</p></div>)}</section>
    <section className="rounded-xl border bg-card p-5"><h2 className="font-semibold">Campanhas, orçamento e aprovações</h2><p className="text-sm text-muted-foreground mt-2">Planejamento interno desenvolvido; operações reais permanecem bloqueadas até validação de contas, permissões, orçamento e envio.</p></section>
    {session.role === 'developer' && <Link href="/integrations" className={buttonVariants({ variant: "outline", size: "sm" })}>Abrir integrações técnicas existentes</Link>}
  </main>;
}

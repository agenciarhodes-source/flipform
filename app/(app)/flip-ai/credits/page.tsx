import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, Coins } from 'lucide-react';
import { getSession } from '@/lib/auth';
import { FlipAiError } from '@/lib/flip-ai/access';
import { getFlipAiCreditStorefront } from '@/lib/flip-ai/self-service-credits';
import { FlipAiCreditWalletClient } from '@/components/flip-ai/credit-wallet-client';

export const dynamic = 'force-dynamic';

export default async function FlipAiCreditsPage() {
  const session = await getSession();
  if (!session) redirect('/login');

  try {
    const storefront = await getFlipAiCreditStorefront(session);
    return (
      <div className="p-4 lg:p-8 space-y-6 animate-fade-in">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <Link
              href="/flip-ai"
              className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar ao Flip AI
            </Link>
            <div className="flex items-center gap-2">
              <Coins className="h-6 w-6 text-brand-600" />
              <h1 className="font-heading text-2xl font-bold lg:text-3xl">Carteira Flip AI</h1>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Consulte o saldo, acompanhe o consumo e compre créditos para sua empresa.
            </p>
          </div>
        </div>

        <FlipAiCreditWalletClient initialStorefront={storefront} />
      </div>
    );
  } catch (error) {
    if (!(error instanceof FlipAiError)) throw error;
    return (
      <section className="mx-auto max-w-2xl space-y-4 p-6">
        <Coins className="h-8 w-8 text-brand-600" aria-hidden="true" />
        <h1 className="text-2xl font-semibold">Carteira Flip AI</h1>
        <p>{error.message}</p>
        <Link className="inline-block text-brand-600 underline" href="/dashboard">Voltar ao Dashboard</Link>
      </section>
    );
  }
}

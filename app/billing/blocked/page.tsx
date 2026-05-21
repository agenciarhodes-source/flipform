import Link from 'next/link';

export default function BillingBlockedPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-muted/30 p-6">
      <div className="max-w-lg bg-card border rounded-lg p-8 text-center shadow-sm">
        <h1 className="font-heading text-2xl font-bold mb-2">Acesso temporariamente bloqueado</h1>
        <p className="text-sm text-muted-foreground mb-5">
          Seu acesso está temporariamente bloqueado por pendência na assinatura. Regularize o pagamento ou entre em contato com o suporte.
        </p>
        <Link href="/api/auth/logout" prefetch={false} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">Sair da conta</Link>
      </div>
    </div>
  );
}

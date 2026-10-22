import Link from 'next/link';
import { TRIAL_DAYS } from '@/lib/billing/subscription-rules';

export default function SuccessPage({ searchParams }: { searchParams?: { trial?: string; method?: string } }) {
  const trial = searchParams?.trial === '1';
  const method = searchParams?.method === 'card' ? 'card' : searchParams?.method === 'boleto' ? 'boleto' : searchParams?.method === 'pix' ? 'pix' : null;
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-700">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-4 inline-flex rounded-full bg-emerald-100 p-3 text-emerald-700">✓</div>
        {trial ? (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Sua assinatura começou: {TRIAL_DAYS} dias grátis</h1>
            <p className="mt-3">
              Enviamos para o e-mail cadastrado um link seguro para você definir sua senha e entrar no FlipForm.
              {method === 'card'
                ? ` A primeira cobrança no cartão acontece só depois dos ${TRIAL_DAYS} dias grátis.`
                : ` No fim dos ${TRIAL_DAYS} dias grátis, a fatura chega no seu e-mail para pagar por ${method === 'boleto' ? 'boleto' : 'Pix'} (ou outra forma, se preferir).`}
            </p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
              <li>O pagamento é processado pelo Stripe, em ambiente seguro.</li>
              <li>Se o e-mail não chegar em alguns minutos, confira a caixa de spam.</li>
              <li>Não enviamos senha padrão por e-mail.</li>
            </ul>
          </>
        ) : (
          <>
            <h1 className="text-2xl font-bold text-slate-900">Pagamento iniciado com sucesso</h1>
            <p className="mt-3">Estamos aguardando a confirmação do pagamento. Assim que o pagamento for confirmado, seu plano será ativado e você receberá no e-mail cadastrado um link seguro para definir sua senha no primeiro acesso.</p>
            <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
              <li>A ativação acontece automaticamente após confirmação.</li>
              <li>Não enviamos senha padrão por e-mail.</li>
            </ul>
          </>
        )}
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="https://app.flipform.com.br/login" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Acessar plataforma</a>
          <a href="https://flipform.com.br" className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700">Voltar para o site</a>
        </div>
        <p className="mt-5 text-xs text-slate-500"><Link href="/legal/terms" className="underline">Termos</Link> · <Link href="/legal/privacy" className="underline">Privacidade</Link></p>
      </div>
    </main>
  );
}

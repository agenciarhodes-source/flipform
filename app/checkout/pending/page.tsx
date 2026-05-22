import Link from 'next/link';

export default function PendingPage() {
  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-700">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Pagamento em processamento</h1>
        <p className="mt-3">Seu pagamento está sendo processado pelo Asaas. A ativação do plano acontece automaticamente após a confirmação.</p>
        <ul className="mt-4 list-disc space-y-1 pl-5 text-sm">
          <li>Você receberá um e-mail de ativação.</li>
          <li>O e-mail terá um link seguro para definir sua senha.</li>
          <li>Não enviamos senha padrão por e-mail.</li>
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href="https://app.flipform.com.br/login" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Ir para login</a>
          <a href="https://flipform.com.br" className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700">Voltar para o site</a>
        </div>
        <p className="mt-5 text-xs text-slate-500"><Link href="/legal/support" className="underline">Suporte</Link></p>
      </div>
    </main>
  );
}

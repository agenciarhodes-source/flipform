'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';

function ErrorPageContent() {
  const params = useSearchParams();
  const plan = (params.get('plan') || 'growth').toLowerCase();
  const safePlan = ['starter', 'growth', 'pro'].includes(plan) ? plan : 'growth';

  return (
    <main className="min-h-screen bg-slate-50 p-6 text-slate-700">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-slate-900">Não foi possível concluir o checkout</h1>
        <p className="mt-3">Ocorreu um problema ao processar sua solicitação. Você pode tentar novamente ou falar com o suporte.</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <a href={`https://app.flipform.com.br/checkout/${safePlan}`} className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white">Tentar novamente</a>
          <a href="mailto:atendimento@flipform.com.br" className="rounded-lg border border-slate-300 px-4 py-2 font-semibold text-slate-700">Falar com suporte</a>
        </div>
      </div>
    </main>
  );
}

export default function ErrorPage() {
  return (
    <Suspense fallback={<main className="min-h-screen bg-slate-50 p-6 text-slate-700"><div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">Carregando...</div></main>}>
      <ErrorPageContent />
    </Suspense>
  );
}

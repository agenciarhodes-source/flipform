'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

type PlanKey = 'starter' | 'growth' | 'pro';

type PlanDef = {
  name: string;
  price: string;
  users: string;
  forms: string;
  pipelines: string;
  leads: string;
  badge?: string;
};

const PLANS: Record<PlanKey, PlanDef> = {
  starter: {
    name: 'Starter',
    price: 'R$ 97/mês',
    users: '3 usuários',
    forms: '5 formulários',
    pipelines: '2 pipelines',
    leads: '2.500 leads/mês',
  },
  growth: {
    name: 'Growth',
    price: 'R$ 157/mês',
    badge: 'Mais recomendado',
    users: '7 usuários',
    forms: '15 formulários',
    pipelines: '5 pipelines',
    leads: '10.000 leads/mês',
  },
  pro: {
    name: 'Pro',
    price: 'R$ 397/mês',
    users: '20 usuários',
    forms: '60 formulários',
    pipelines: '25 pipelines',
    leads: '75.000 leads/mês',
  },
};

type CheckoutForm = {
  email: string;
  confirmEmail: string;
  name: string;
  cpfCnpj: string;
  phone: string;
  cep: string;
  companyName: string;
};

async function readJsonSafe(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try { return JSON.parse(text); } catch { return {}; }
}

function normalizeDigits(value: string) {
  return value.replace(/\D/g, '');
}

function maskCpfCnpj(value: string) {
  const digits = normalizeDigits(value).slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
}

function maskPhone(value: string) {
  const digits = normalizeDigits(value).slice(0, 11);
  if (digits.length <= 10) return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d{1,4})$/, '$1-$2');
  return digits.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d{1,4})$/, '$1-$2');
}

function maskCep(value: string) {
  const digits = normalizeDigits(value).slice(0, 8);
  return digits.replace(/(\d{5})(\d{1,3})$/, '$1-$2');
}

export default function CheckoutPage({ params }: { params: { planSlug: string } }) {
  const planSlug = params.planSlug?.toLowerCase();
  const plan = (PLANS as Record<string, PlanDef | undefined>)[planSlug];

  const [form, setForm] = useState<CheckoutForm>({
    email: '',
    confirmEmail: '',
    name: '',
    cpfCnpj: '',
    phone: '',
    cep: '',
    companyName: '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof CheckoutForm, string>>>({});

  const faq = useMemo(() => [
    { q: 'O pagamento é seguro?', a: 'Sim. O pagamento é processado em ambiente seguro via Asaas.' },
    { q: 'Quando recebo acesso?', a: 'Após a confirmação do pagamento, você receberá no e-mail cadastrado as instruções de acesso.' },
    { q: 'Vou receber uma senha por e-mail?', a: 'Não. Por segurança, você receberá um link seguro para definir sua senha no primeiro acesso.' },
    { q: 'Posso trocar de plano depois?', a: 'Sim, conforme disponibilidade do app e suporte.' },
    { q: 'Posso cancelar?', a: 'Sim, conforme política comercial aplicável.' },
    { q: 'Preciso instalar alguma coisa?', a: 'Não. A FlipForm funciona pelo navegador.' },
  ], []);

  if (!plan) {
    return (
      <div className="min-h-screen bg-slate-50 p-6">
        <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Plano inválido</h1>
          <p className="mt-2 text-slate-600">Não encontramos este plano de checkout.</p>
          <a href="https://flipform.com.br#planos" className="mt-4 inline-flex rounded-lg bg-blue-600 px-4 py-2 font-medium text-white">Ver planos disponíveis</a>
        </div>
      </div>
    );
  }

  function validate() {
    const errors: Partial<Record<keyof CheckoutForm, string>> = {};
    if (!form.email.trim()) errors.email = 'E-mail é obrigatório.';
    if (!form.confirmEmail.trim()) errors.confirmEmail = 'Confirme seu e-mail.';
    if (form.email.trim() && form.confirmEmail.trim() && form.email.trim().toLowerCase() !== form.confirmEmail.trim().toLowerCase()) {
      errors.confirmEmail = 'Os e-mails não conferem.';
    }
    if (!form.name.trim()) errors.name = 'Nome completo é obrigatório.';
    if (!form.companyName.trim()) errors.companyName = 'Empresa / negócio é obrigatório.';
    return errors;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    const errors = validate();
    setFieldErrors(errors);
    setError(null);
    if (Object.keys(errors).length > 0) return;

    setLoading(true);
    const payload = {
      planSlug,
      email: form.email.trim().toLowerCase(),
      name: form.name.trim(),
      phone: form.phone.trim(),
      cpfCnpj: form.cpfCnpj.trim(),
      companyName: form.companyName.trim(),
    };

    const res = await fetch('/api/public/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await readJsonSafe(res);

    if (!res.ok) {
      setLoading(false);
      return setError((data as any)?.error || 'Não foi possível iniciar o checkout. Revise os dados ou tente novamente.');
    }

    setRedirecting(true);
    window.location.href = (data as any)?.checkoutUrl || '/checkout/pending';
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3"><div className="h-9 w-9 rounded-lg bg-blue-600" /><div><p className="font-semibold">FlipForm</p><p className="text-xs text-slate-500">Checkout seguro</p></div></div>
          <a href="https://app.flipform.com.br/login" className="text-sm font-medium text-blue-700 hover:underline">Já tenho conta</a>
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-4 text-xs text-slate-500 sm:px-6 lg:px-8">Pagamento processado com segurança. Acesso liberado após confirmação.</p>
      </header>

      <section className="bg-gradient-to-b from-blue-50 to-slate-50 border-b border-slate-200">
        <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold">Comece com o FlipForm {plan.name}</h1>
          <p className="mt-2 max-w-3xl text-slate-600">Organize seus leads, formulários e funis comerciais em uma plataforma simples para acompanhar oportunidades até a venda.</p>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">Pipeline visual</p><div className="mt-2 grid grid-cols-3 gap-2 text-xs"><span className="rounded bg-blue-100 p-2">Novos</span><span className="rounded bg-amber-100 p-2">Contato</span><span className="rounded bg-emerald-100 p-2">Fechados</span></div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">Formulários inteligentes</p><div className="mt-2 space-y-2"><div className="h-2 rounded bg-slate-200" /><div className="h-2 w-2/3 rounded bg-slate-200" /><div className="h-2 w-1/2 rounded bg-slate-200" /></div></div>
            <div className="rounded-xl border border-slate-200 bg-slate-900 p-4 text-white shadow-sm"><p className="text-xs text-blue-100">Selos de confiança</p><p className="mt-2 text-sm">Checkout seguro via Asaas</p><p className="text-sm">Link seguro de primeiro acesso</p></div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-3 lg:px-8">
        <form onSubmit={submit} className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4" noValidate>
          <h2 className="text-xl font-semibold">Dados para finalizar assinatura</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div><label className="mb-1 block text-sm font-medium">E-mail</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2" type="email" value={form.email} onChange={(e)=>setForm({...form,email:e.target.value})} aria-invalid={Boolean(fieldErrors.email)} required />{fieldErrors.email && <p className="text-xs text-red-600">{fieldErrors.email}</p>}</div>
            <div><label className="mb-1 block text-sm font-medium">Confirmar e-mail</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2" type="email" value={form.confirmEmail} onChange={(e)=>setForm({...form,confirmEmail:e.target.value})} aria-invalid={Boolean(fieldErrors.confirmEmail)} required />{fieldErrors.confirmEmail && <p className="text-xs text-red-600">{fieldErrors.confirmEmail}</p>}</div>
            <div className="sm:col-span-2"><label className="mb-1 block text-sm font-medium">Nome completo</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={form.name} onChange={(e)=>setForm({...form,name:e.target.value})} aria-invalid={Boolean(fieldErrors.name)} required />{fieldErrors.name && <p className="text-xs text-red-600">{fieldErrors.name}</p>}</div>
            <div><label className="mb-1 block text-sm font-medium">CPF/CNPJ</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={form.cpfCnpj} onChange={(e)=>setForm({...form,cpfCnpj:maskCpfCnpj(e.target.value)})} /></div>
            <div><label className="mb-1 block text-sm font-medium">Celular / WhatsApp</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={form.phone} onChange={(e)=>setForm({...form,phone:maskPhone(e.target.value)})} /></div>
            <div><label className="mb-1 block text-sm font-medium">CEP</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={form.cep} onChange={(e)=>setForm({...form,cep:maskCep(e.target.value)})} /></div>
            <div><label className="mb-1 block text-sm font-medium">Empresa / Nome do negócio</label><input className="w-full rounded-lg border border-slate-300 px-3 py-2" value={form.companyName} onChange={(e)=>setForm({...form,companyName:e.target.value})} aria-invalid={Boolean(fieldErrors.companyName)} required />{fieldErrors.companyName && <p className="text-xs text-red-600">{fieldErrors.companyName}</p>}</div>
          </div>
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <p className="text-sm text-slate-600">Você receberá um link seguro para definir sua senha no primeiro acesso. Não enviamos senha padrão por e-mail. Seu plano será ativado após confirmação do pagamento.</p>
          <p className="text-xs text-slate-500">Ao continuar, você concorda com os <Link href="/legal/terms" className="underline">Termos de Uso</Link> e a <Link href="/legal/privacy" className="underline">Política de Privacidade</Link>.</p>
          <button disabled={loading || redirecting} className="w-full rounded-lg bg-blue-600 px-4 py-3 font-semibold text-white disabled:opacity-60">{loading ? 'Preparando seu checkout seguro...' : redirecting ? 'Redirecionando para pagamento...' : 'Continuar para pagamento seguro'}</button>
        </form>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><h3 className="text-lg font-semibold">Plano {plan.name}</h3>{plan.badge && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">{plan.badge}</span>}</div>
            <p className="mt-1 text-2xl font-bold text-blue-700">{plan.price}</p>
            <ul className="mt-3 space-y-1 text-sm text-slate-600"><li>{plan.users}</li><li>{plan.forms}</li><li>{plan.pipelines}</li><li>{plan.leads}</li><li>Pagamento mensal</li><li>Ativação após confirmação</li><li>Link seguro para definir senha</li><li>Suporte em atendimento@flipform.com.br</li></ul>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold">Confiança</h3><ul className="mt-2 space-y-2 text-sm text-slate-600"><li><strong>Checkout seguro:</strong> Pagamento processado por Asaas com ambiente protegido.</li><li><strong>Ativação automática:</strong> Após a confirmação do pagamento, seu plano é ativado e você recebe as instruções de acesso.</li><li><strong>Primeiro acesso seguro:</strong> Você define sua senha por um link seguro. A FlipForm não envia senha padrão por e-mail.</li><li><strong>Suporte direto:</strong> Em caso de dúvida, fale com atendimento@flipform.com.br.</li></ul></div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h3 className="font-semibold">Provas sociais</h3><blockquote className="mt-2 text-sm text-slate-600">“Antes os leads ficavam espalhados. Com um funil visual, o acompanhamento ficou mais simples.”<footer className="mt-1 text-xs text-slate-500">Equipe comercial</footer></blockquote><blockquote className="mt-3 text-sm text-slate-600">“O formulário deixou de ser só captação e passou a alimentar um processo de venda.”<footer className="mt-1 text-xs text-slate-500">Operação de marketing</footer></blockquote><blockquote className="mt-3 text-sm text-slate-600">“Agora cada oportunidade tem etapa, responsável e próximo passo.”<footer className="mt-1 text-xs text-slate-500">Gestão comercial</footer></blockquote></div>
        </aside>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-10 sm:px-6 lg:px-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"><h3 className="text-lg font-semibold">FAQ rápida</h3><div className="mt-4 grid gap-4 md:grid-cols-2">{faq.map((item) => <div key={item.q} className="rounded-lg border border-slate-200 p-4"><p className="font-medium">{item.q}</p><p className="mt-1 text-sm text-slate-600">{item.a}</p></div>)}</div></div>
      </section>
    </main>
  );
}

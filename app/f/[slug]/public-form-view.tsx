'use client';
import { PublicTypeform } from '@/components/public-typeform';

export function PublicFormView({ form }: { form: any }) {
  const submit = async (answers: any) => {
    let res: Response;
    try {
      res = await fetch(`/api/public/forms/${form.slug}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ answers }),
      });
    } catch {
      throw new Error('Falha de rede. Verifique sua conexão e tente novamente.');
    }
    if (!res.ok) {
      let msg = 'Não foi possível enviar suas respostas. Tente novamente.';
      try {
        const data = await res.json();
        if (data?.error) msg = data.error;
      } catch {}
      throw new Error(msg);
    }
  };
  return <div className="min-h-screen"><PublicTypeform form={form} onSubmit={submit} /></div>;
}

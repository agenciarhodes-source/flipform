'use client';
import { PublicTypeform } from '@/components/public-typeform';

export function PublicFormView({ form }: { form: any }) {
  const submit = async (answers: any) => {
    const res = await fetch(`/api/public/forms/${form.slug}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ answers }),
    });
    if (!res.ok) throw new Error('submit error');
  };
  return <div className="min-h-screen"><PublicTypeform form={form} onSubmit={submit} /></div>;
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(_req: Request, ctx: { params: { slug: string } }) {
  const form = await prisma.form.findFirst({
    where: { slug: ctx.params.slug, isActive: true },
    include: { fields: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!form) return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 });
  return NextResponse.json({
    form: {
      id: form.id,
      slug: form.slug,
      publicTitle: form.publicTitle,
      publicDescription: form.publicDescription,
      primaryColor: form.primaryColor,
      successMessage: form.successMessage,
      logoUrl: form.logoUrl,
      fields: form.fields,
    },
  });
}

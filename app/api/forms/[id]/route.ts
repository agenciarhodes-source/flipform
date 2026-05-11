import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';
import { formCreateSchema } from '@/lib/schemas';

export const GET = withAuth(async (_req, session, ctx: { params: { id: string } }) => {
  const form = await prisma.form.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    include: { fields: { orderBy: { orderIndex: 'asc' } } },
  });
  if (!form) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  return NextResponse.json({ form });
});

export const PUT = withAuth(async (req, session, ctx: { params: { id: string } }) => {
  try {
    const body = await req.json();
    const parsed = formCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const data = parsed.data;

    // tenant check
    const existing = await prisma.form.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.form.update({
        where: { id: ctx.params.id },
        data: {
          name: data.name,
          publicTitle: data.publicTitle,
          publicDescription: data.publicDescription ?? null,
          primaryColor: data.primaryColor || existing.primaryColor,
          successMessage: data.successMessage || existing.successMessage,
          isActive: data.isActive ?? existing.isActive,
          pipelineId: data.pipelineId || existing.pipelineId,
          initialStageId: data.initialStageId || existing.initialStageId,
        },
      });
      await tx.formField.deleteMany({ where: { formId: ctx.params.id } });
      for (let i = 0; i < data.fields.length; i++) {
        const f = data.fields[i];
        await tx.formField.create({
          data: {
            formId: ctx.params.id,
            label: f.label,
            placeholder: f.placeholder ?? null,
            description: f.description ?? null,
            fieldType: f.fieldType,
            options: f.options ? f.options : undefined,
            isRequired: f.isRequired,
            orderIndex: i,
          },
        });
      }
    });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('form update error', e);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
});

export const DELETE = withAuth(async (_req, session, ctx: { params: { id: string } }) => {
  const existing = await prisma.form.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  await prisma.form.delete({ where: { id: ctx.params.id } });
  return NextResponse.json({ ok: true });
});

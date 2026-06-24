import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { formCreateSchema } from '@/lib/schemas';
import { cleanOptions, requiresOptions, validateChoiceOptions } from '@/lib/form-field-validation';

async function validatePipelineAndStage(tenantId: string, pipelineId: string, stageId: string) {
  const pipeline = await prisma.pipeline.findFirst({
    where: { id: pipelineId, tenantId },
    include: { stages: { where: { id: stageId } } },
  });
  if (!pipeline) return { error: 'Pipeline inválido para este tenant.', status: 400 };
  if (pipeline.isArchived) return { error: 'Pipeline arquivado não pode ser usado em formulários.', status: 400 };
  const stage = pipeline.stages[0];
  if (!stage) return { error: 'Etapa inicial não pertence ao pipeline selecionado.', status: 400 };
  if (stage.isArchived) return { error: 'Etapa inicial está arquivada.', status: 400 };
  return { pipeline, stage };
}

export const GET = withPermission('FORMS_VIEW', async (_req, session, ctx: { params: { id: string } }) => {
  const form = await prisma.form.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    include: {
      fields: { orderBy: { orderIndex: 'asc' } },
      pipeline: { select: { id: true, name: true, isArchived: true, isDefault: true } },
      initialStage: { select: { id: true, name: true, color: true, isArchived: true } },
    },
  });
  if (!form) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  return NextResponse.json({ form });
});

export const PUT = withPermission('FORMS_EDIT', async (req, session, ctx: { params: { id: string } }) => {
  try {
    const body = await req.json();
    const parsed = formCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const data = { ...parsed.data, fields: parsed.data.fields.map((field) => ({ ...field })) };
    for (const field of data.fields) {
      if (requiresOptions(field.fieldType)) {
        const validation = validateChoiceOptions(field.options, field.validationRules);
        if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 });
        field.options = validation.options;
      } else {
        field.options = cleanOptions(field.options);
      }
    }

    const existing = await prisma.form.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
    if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });

    // Validar pipeline+stage SE foi informado nesta edição
    const newPipelineId = data.pipelineId || existing.pipelineId;
    const newStageId = data.initialStageId || existing.initialStageId;
    if (newPipelineId !== existing.pipelineId || newStageId !== existing.initialStageId) {
      const validation = await validatePipelineAndStage(session.tenantId, newPipelineId, newStageId);
      if ('error' in validation) return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    await prisma.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      await tx.form.update({
        where: { id: ctx.params.id },
        data: {
          name: data.name,
          publicTitle: data.publicTitle,
          publicDescription: data.publicDescription ?? null,
          primaryColor: data.primaryColor || existing.primaryColor,
          bgColor: data.bgColor ?? null,
          buttonColor: data.buttonColor ?? null,
          textColor: data.textColor ?? null,
          theme: data.theme || existing.theme || 'light',
          coverImageUrl: data.coverImageUrl ?? null,
          logoUrl: data.logoUrl ?? null,
          successMessage: data.successMessage || existing.successMessage,
          disqualificationSettings: data.disqualificationSettings ? (data.disqualificationSettings as Prisma.InputJsonValue) : undefined,
          isActive: data.isActive ?? existing.isActive,
          pipelineId: newPipelineId,
          initialStageId: newStageId,
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
            validationRules: f.validationRules ? (f.validationRules as Prisma.InputJsonValue) : undefined,
            isRequired: f.isRequired,
            orderIndex: i,
          },
        });
      }
    });

    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'form', entityId: ctx.params.id, action: 'form.updated',
      metadata: { pipelineId: newPipelineId, initialStageId: newStageId },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('form update error', e);
    return NextResponse.json({ error: 'Erro ao salvar' }, { status: 500 });
  }
});

export const DELETE = withPermission('FORMS_DELETE', async (_req, session, ctx: { params: { id: string } }) => {
  const existing = await prisma.form.findFirst({ where: { id: ctx.params.id, tenantId: session.tenantId } });
  if (!existing) return NextResponse.json({ error: 'Não encontrado' }, { status: 404 });
  await prisma.form.delete({ where: { id: ctx.params.id } });
  await logAudit({
    tenantId: session.tenantId, userId: session.userId,
    entityType: 'form', entityId: existing.id, action: 'form.deleted',
    metadata: { name: existing.name, slug: existing.slug },
  });
  return NextResponse.json({ ok: true });
});

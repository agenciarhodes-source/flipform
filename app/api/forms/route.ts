import { Prisma } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { formCreateSchema } from '@/lib/schemas';
import { cleanOptions, requiresOptions, validateChoiceOptions } from '@/lib/form-field-validation';
import { slugify } from '@/lib/utils';
import { getConfiguredAppDomain } from '@/lib/custom-form-domains';
import { buildPublicFormUrlState } from '@/lib/forms/public-form-url';

export const GET = withPermission('FORMS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const pipelineFilter = searchParams.get('pipelineId');
  const forms = await prisma.form.findMany({
    where: { tenantId: session.tenantId, ...(pipelineFilter ? { pipelineId: pipelineFilter } : {}) },
    include: {
      _count: { select: { leads: true, fields: true } },
      pipeline: { select: { id: true, name: true, isArchived: true, isDefault: true } },
      initialStage: { select: { id: true, name: true, color: true, isArchived: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  const primaryDomain = await prisma.customFormDomain.findFirst({
    where: { tenantId: session.tenantId, isPrimary: true, status: 'active', verificationStatus: 'verified', sslStatus: 'active' },
    orderBy: { updatedAt: 'desc' },
    select: { domain: true, status: true, verificationStatus: true, sslStatus: true },
  });
  const appDomain = getConfiguredAppDomain();

  return NextResponse.json({
    forms: forms.map((form) => {
      const urlState = buildPublicFormUrlState({ slug: form.slug, primaryDomain, appDomain });
      return {
        ...form,
        publicUrl: urlState.activeUrl,
        publicUrlState: urlState.state,
        publicUrlLabel: urlState.label,
        customDomainUrl: urlState.customUrl,
        customDomainStatus: primaryDomain ? {
          status: primaryDomain.status,
          verificationStatus: primaryDomain.verificationStatus,
          sslStatus: primaryDomain.sslStatus,
        } : null,
      };
    }),
  });
});

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

export const POST = withPermission('FORMS_CREATE', async (req, session) => {
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

    // Pipeline padrão
    let pipelineId = data.pipelineId;
    let initialStageId = data.initialStageId;
    if (!pipelineId) {
      const def = await prisma.pipeline.findFirst({
        where: { tenantId: session.tenantId, isDefault: true, isArchived: false },
        include: { stages: { where: { isArchived: false }, orderBy: { orderIndex: 'asc' }, take: 1 } },
      });
      if (!def) return NextResponse.json({ error: 'Sem pipeline padrão ativo. Crie um pipeline antes.' }, { status: 400 });
      if (!def.stages.length) return NextResponse.json({ error: 'O pipeline padrão não possui etapas ativas.' }, { status: 400 });
      pipelineId = def.id;
      initialStageId = def.stages[0].id;
    } else {
      if (!initialStageId) return NextResponse.json({ error: 'Etapa inicial obrigatória quando o pipeline for especificado.' }, { status: 400 });
      const validation = await validatePipelineAndStage(session.tenantId, pipelineId, initialStageId);
      if ('error' in validation) return NextResponse.json({ error: validation.error }, { status: validation.status });
    }

    // Slug único por tenant
    let slug = slugify(data.name);
    let attempt = 0;
    while (await prisma.form.findFirst({ where: { tenantId: session.tenantId, slug } })) {
      attempt++;
      slug = `${slugify(data.name)}-${attempt}`;
    }

    const form = await prisma.form.create({
      data: {
        tenantId: session.tenantId,
        name: data.name,
        publicTitle: data.publicTitle,
        publicDescription: data.publicDescription ?? null,
        slug,
        primaryColor: data.primaryColor || '#2563EB',
        bgColor: data.bgColor ?? null,
        buttonColor: data.buttonColor ?? null,
        textColor: data.textColor ?? null,
        theme: data.theme || 'light',
        coverImageUrl: data.coverImageUrl ?? null,
        logoUrl: data.logoUrl ?? null,
        successMessage: data.successMessage || 'Obrigado pelo envio!',
        disqualificationSettings: data.disqualificationSettings == null ? Prisma.JsonNull : (data.disqualificationSettings as Prisma.InputJsonValue),
        pipelineId: pipelineId!,
        initialStageId: initialStageId!,
        isActive: data.isActive ?? true,
        fields: {
          create: data.fields.map((f, idx) => ({
            label: f.label,
            placeholder: f.placeholder ?? null,
            description: f.description ?? null,
            fieldType: f.fieldType,
            options: f.options ? f.options : undefined,
            validationRules: f.validationRules ? (f.validationRules as Prisma.InputJsonValue) : undefined,
            isRequired: f.isRequired,
            orderIndex: idx,
          })),
        },
      },
      include: { fields: true },
    });
    await logAudit({
      tenantId: session.tenantId, userId: session.userId,
      entityType: 'form', entityId: form.id, action: 'form.created',
      metadata: { name: form.name, slug: form.slug, pipelineId: form.pipelineId, initialStageId: form.initialStageId },
    });
    return NextResponse.json({ form });
  } catch (e: unknown) {
    console.error('form create error', e);

    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const target = Array.isArray(e.meta?.target) ? e.meta.target.join(',') : String(e.meta?.target ?? '');
      if (target.includes('slug') || target.includes('forms_tenant_id_slug_key') || target.includes('forms_slug_key')) {
        return NextResponse.json(
          { error: 'Já existe um formulário com esse nome nesta conta. Tente outro nome.' },
          { status: 409 },
        );
      }
    }

    return NextResponse.json({ error: 'Erro ao criar formulário' }, { status: 500 });
  }
});

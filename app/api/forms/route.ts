import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/auth';
import { formCreateSchema } from '@/lib/schemas';
import { slugify } from '@/lib/utils';

export const GET = withAuth(async (_req, session) => {
  const forms = await prisma.form.findMany({
    where: { tenantId: session.tenantId },
    include: { _count: { select: { leads: true, fields: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ forms });
});

export const POST = withAuth(async (req, session) => {
  try {
    const body = await req.json();
    const parsed = formCreateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const data = parsed.data;

    // Pipeline padrão
    let pipelineId = data.pipelineId;
    let initialStageId = data.initialStageId;
    if (!pipelineId) {
      const def = await prisma.pipeline.findFirst({
        where: { tenantId: session.tenantId, isDefault: true },
        include: { stages: { orderBy: { orderIndex: 'asc' }, take: 1 } },
      });
      if (!def) return NextResponse.json({ error: 'Sem pipeline padrão' }, { status: 400 });
      pipelineId = def.id;
      initialStageId = def.stages[0].id;
    }

    // Slug único
    let slug = slugify(data.name);
    let attempt = 0;
    while (await prisma.form.findUnique({ where: { slug } })) {
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
        successMessage: data.successMessage || 'Obrigado pelo envio!',
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
            isRequired: f.isRequired,
            orderIndex: idx,
          })),
        },
      },
      include: { fields: true },
    });
    return NextResponse.json({ form });
  } catch (e: any) {
    console.error('form create error', e);
    return NextResponse.json({ error: 'Erro ao criar formulário' }, { status: 500 });
  }
});

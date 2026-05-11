import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { publicSubmitSchema } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';

export async function POST(req: Request, ctx: { params: { slug: string } }) {
  try {
    const body = await req.json();
    const parsed = publicSubmitSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const form = await prisma.form.findFirst({
      where: { slug: ctx.params.slug, isActive: true },
      include: {
        fields: true,
        pipeline: { select: { id: true, isArchived: true } },
        initialStage: { select: { id: true, isArchived: true } },
      },
    });
    if (!form) return NextResponse.json({ error: 'Formulário não encontrado' }, { status: 404 });

    // Validar pipeline e etapa não arquivados (forms existentes que tiveram pipeline/stage arquivado depois)
    if (form.pipeline?.isArchived) {
      return NextResponse.json({ error: 'Este formulário está temporariamente indisponível.' }, { status: 410 });
    }
    if (form.initialStage?.isArchived) {
      return NextResponse.json({ error: 'Este formulário está temporariamente indisponível.' }, { status: 410 });
    }

    const answers = parsed.data.answers;

    // Extrair name/email/phone
    const findVal = (types: string[]) => {
      for (const a of answers) {
        const field = form.fields.find((f) => f.id === a.fieldId);
        if (field && types.includes(field.fieldType) && a.value) return String(a.value);
      }
      return null;
    };
    const name = findVal(['name', 'short_text']) || 'Lead sem nome';
    const email = findVal(['email']);
    const phone = findVal(['phone']);

    const lead = await prisma.lead.create({
      data: {
        tenantId: form.tenantId,
        formId: form.id,
        pipelineId: form.pipelineId,
        stageId: form.initialStageId,
        name,
        email,
        phone,
        source: 'formulario',
        status: 'open',
        temperature: 'warm',
        answers: {
          create: answers.map((a) => ({
            fieldId: a.fieldId,
            questionLabel: a.label,
            answer: a.value as any,
          })),
        },
        history: {
          create: [{ fromStageId: null, toStageId: form.initialStageId }],
        },
      },
    });

    await logAudit({
      tenantId: form.tenantId, userId: null,
      entityType: 'form', entityId: form.id, action: 'form.submitted',
      metadata: { leadId: lead.id, source: 'public_form', slug: ctx.params.slug },
    });
    await logAudit({
      tenantId: form.tenantId, userId: null,
      entityType: 'lead', entityId: lead.id, action: 'lead.created',
      metadata: { formId: form.id, pipelineId: form.pipelineId, stageId: form.initialStageId, source: 'formulario' },
    });

    return NextResponse.json({ ok: true, leadId: lead.id, successMessage: form.successMessage });
  } catch (e: any) {
    console.error('public submit error', e);
    return NextResponse.json({ error: 'Erro ao enviar' }, { status: 500 });
  }
}
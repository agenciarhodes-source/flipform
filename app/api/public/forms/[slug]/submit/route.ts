import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { publicSubmitSchema } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';
import { dispatchFormSubmissionTracking } from '@/lib/tracking';
import { normalizeHostname } from '@/lib/host-routing';

/**
 * Public form submit endpoint.
 *
 * Hardening:
 * - Aceita tanto `value` quanto `answer` no payload (compat).
 * - Deriva `label` do form no servidor (não confia no cliente).
 * - Valida que `fieldId` pertence ao form.
 * - Valida que todos os campos obrigatórios foram respondidos.
 * - Cria lead + answers + history dentro de uma transaction Prisma.
 * - Bloqueia formulário inativo, pipeline arquivado ou stage arquivado.
 * - Retorna mensagens de erro amigáveis em português.
 */
export async function POST(req: Request, ctx: { params: { slug: string } }) {
  const slug = ctx.params.slug;
  try {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Corpo da requisição inválido (JSON malformado).' }, { status: 400 });
    }

    const parsed = publicSubmitSchema.safeParse(body);
    if (!parsed.success) {
      const msg = parsed.error.errors[0]?.message || 'Dados inválidos.';
      return NextResponse.json({ error: msg }, { status: 400 });
    }

    const host = normalizeHostname(req.headers.get('host'));
    const appDomain = normalizeHostname(process.env.NEXT_PUBLIC_APP_DOMAIN || 'app.flipform.com.br');
    const isPlatformHost = !host || host === appDomain || host === 'localhost' || host === '127.0.0.1' || host.endsWith('.vercel.app');
    const customDomain = isPlatformHost
      ? null
      : await prisma.customFormDomain.findFirst({
        where: { domain: host, status: 'active', verificationStatus: 'verified', sslStatus: 'active' },
        select: { tenantId: true },
      });

    const form = await prisma.form.findFirst({
      where: { slug, isActive: true, ...(customDomain ? { tenantId: customDomain.tenantId } : {}) },
      include: {
        fields: { orderBy: { orderIndex: 'asc' } },
        pipeline: { select: { id: true, isArchived: true } },
        initialStage: { select: { id: true, isArchived: true, name: true } },
        tenant: { select: { id: true, status: true } },
      },
    });
    if (!form) {
      return NextResponse.json({ error: 'Formulário não encontrado ou inativo.' }, { status: 404 });
    }

    const BLOCKED_TENANT_STATUSES = new Set(['suspended', 'blocked', 'canceled', 'inactive']);
    if (BLOCKED_TENANT_STATUSES.has(String(form.tenant.status))) {
      return NextResponse.json({ error: 'Este formulário está temporariamente indisponível.' }, { status: 410 });
    }

    if (form.pipeline?.isArchived) {
      return NextResponse.json({ error: 'Este formulário está temporariamente indisponível (pipeline arquivado).' }, { status: 410 });
    }
    if (form.initialStage?.isArchived) {
      return NextResponse.json({ error: 'Este formulário está temporariamente indisponível (etapa inicial arquivada).' }, { status: 410 });
    }

    type FieldRow = { id: string; label: string; fieldType: string; isRequired: boolean; [key: string]: unknown };
    const fieldsById = new Map<string, FieldRow>((form.fields as FieldRow[]).map((f) => [f.id, f]));

    // Filtra apenas answers com fieldId válido para este form
    const cleanAnswers = parsed.data.answers
      .filter((a) => fieldsById.has(a.fieldId))
      .map((a) => {
        const f = fieldsById.get(a.fieldId) as FieldRow;
        return {
          fieldId: f.id,
          label: f.label, // sempre derivamos do servidor
          value: a.value,
          fieldType: f.fieldType,
        };
      });

    // Validar campos obrigatórios
    const isEmpty = (v: unknown) =>
      v === undefined ||
      v === null ||
      v === '' ||
      (Array.isArray(v) && v.length === 0);

    const missingRequired = (form.fields as FieldRow[])
      .filter((f) => f.isRequired)
      .filter((f) => {
        const a = cleanAnswers.find((x) => x.fieldId === f.id);
        return !a || isEmpty(a.value);
      });

    if (missingRequired.length > 0) {
      return NextResponse.json(
        {
          error: `Campo obrigatório não preenchido: ${missingRequired[0].label}.`,
          missingFields: (missingRequired as FieldRow[]).map((f) => ({ id: f.id, label: f.label })),
        },
        { status: 400 },
      );
    }

    // Validações básicas de tipo
    for (const a of cleanAnswers) {
      if (a.fieldType === 'email' && !isEmpty(a.value)) {
        const s = String(a.value);
        if (!/^\S+@\S+\.\S+$/.test(s)) {
          return NextResponse.json({ error: `E-mail inválido em "${a.label}".` }, { status: 400 });
        }
      }
    }

    // Extrair name/email/phone direto do tipo de campo
    const pickByType = (types: string[]) => {
      for (const a of cleanAnswers) {
        if (types.includes(a.fieldType) && !isEmpty(a.value)) return String(a.value);
      }
      return null;
    };
    const name = pickByType(['name']) || pickByType(['short_text']) || 'Lead sem nome';
    const email = pickByType(['email']);
    const phone = pickByType(['phone']);

    // Cria lead + answers + history dentro de uma transaction para garantir atomicidade
    const lead = await prisma.$transaction(async (tx: import('@prisma/client').Prisma.TransactionClient) => {
      const created = await tx.lead.create({
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
            create: cleanAnswers.map((a) => ({
              fieldId: a.fieldId,
              questionLabel: a.label,
              answer: (a.value ?? null) as any,
            })),
          },
          history: {
            create: [{ fromStageId: null, toStageId: form.initialStageId }],
          },
        },
      });
      return created;
    });

    // Audit logs (fora da transaction para não bloquear retorno em caso de falha de log)
    await logAudit({
      tenantId: form.tenantId, userId: null,
      entityType: 'form', entityId: form.id, action: 'form.submitted',
      metadata: { leadId: lead.id, source: 'public_form', slug },
    });
    await logAudit({
      tenantId: form.tenantId, userId: null,
      entityType: 'lead', entityId: lead.id, action: 'lead.created',
      metadata: { formId: form.id, pipelineId: form.pipelineId, stageId: form.initialStageId, source: 'formulario' },
    });

    try {
      await dispatchFormSubmissionTracking({
        tenantId: form.tenantId,
        leadId: lead.id,
        pipelineId: form.pipelineId,
        fromStageId: null,
        toStageId: form.initialStageId,
        triggeredById: null,
        source: 'public_form',
        lead: { email: lead.email, phone: lead.phone, name: lead.name },
      });
    } catch (trackingError) {
      console.error('public submit tracking error', trackingError);
    }

    return NextResponse.json({
      ok: true,
      leadId: lead.id,
      successMessage: form.successMessage,
    });
  } catch (e: any) {
    console.error('public submit error', e);
    return NextResponse.json({ error: 'Erro interno ao enviar formulário. Tente novamente.' }, { status: 500 });
  }
}

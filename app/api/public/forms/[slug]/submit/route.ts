import { NextResponse } from 'next/server';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { prisma } from '@/lib/prisma';
import { publicSubmitSchema } from '@/lib/schemas';
import { logAudit } from '@/lib/audit';
import { dispatchFormSubmissionTracking } from '@/lib/tracking';
import { normalizeHostname } from '@/lib/host-routing';
import { cleanOptions, isValidBrazilMobilePhone, isValidCnpj, isValidCpf, isValidEmail, normalizeBrazilPhone, normalizeCnpj, normalizeCpf, normalizeEmail, normalizeSelectionMode, requiresOptions } from '@/lib/form-field-validation';

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

    type FieldRow = { id: string; label: string; fieldType: string; isRequired: boolean; options?: unknown; [key: string]: unknown };
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

    // Validações e normalização server-side por tipo de campo.
    const normalizedAnswers = cleanAnswers.map((a) => ({ ...a }));
    for (const a of normalizedAnswers) {
      if (isEmpty(a.value)) continue;
      const field = fieldsById.get(a.fieldId) as FieldRow;
      if (a.fieldType === 'email') {
        if (!isValidEmail(a.value)) return NextResponse.json({ error: 'Informe um e-mail válido.' }, { status: 400 });
        a.value = normalizeEmail(a.value);
      }
      if (a.fieldType === 'phone' || a.fieldType === 'phone_br') {
        const normalized = normalizeBrazilPhone(a.value);
        if (/[A-Za-zÀ-ÿ]/.test(String(a.value)) || !isValidBrazilMobilePhone(normalized)) return NextResponse.json({ error: 'O telefone deve seguir o formato +55 (00) 9 0000-0000.' }, { status: 400 });
        a.value = normalized;
      }
      if (a.fieldType === 'cpf') {
        const normalized = normalizeCpf(a.value);
        if (/[A-Za-zÀ-ÿ]/.test(String(a.value)) || !isValidCpf(normalized)) return NextResponse.json({ error: 'Informe um CPF válido com 11 dígitos.' }, { status: 400 });
        a.value = normalized;
      }
      if (a.fieldType === 'cnpj') {
        const normalized = normalizeCnpj(a.value);
        if (/[A-Za-zÀ-ÿ]/.test(String(a.value)) || !isValidCnpj(normalized)) return NextResponse.json({ error: 'Informe um CNPJ válido com 14 dígitos.' }, { status: 400 });
        a.value = normalized;
      }
      if (requiresOptions(a.fieldType)) {
        const allowed = cleanOptions(field.options);
        if (allowed.length < 2) return NextResponse.json({ error: 'Adicione pelo menos duas opções.' }, { status: 400 });
        const values = Array.isArray(a.value) ? a.value : [a.value];
        const invalid = values.some((value) => !allowed.includes(String(value)));
        const selectionMode = normalizeSelectionMode(a.fieldType, field.validationRules);
        const expectsArray = selectionMode === 'multiple';
        if (invalid || (!expectsArray && Array.isArray(a.value)) || (expectsArray && !Array.isArray(a.value))) {
          return NextResponse.json({ error: `Resposta inválida para o campo ${a.label}.` }, { status: 400 });
        }
        if (expectsArray && Array.isArray(a.value)) a.value = values.map(String);
      }
    }

    // Extrair name/email/phone direto do tipo de campo
    const pickByType = (types: string[]) => {
      for (const a of normalizedAnswers) {
        if (types.includes(a.fieldType) && !isEmpty(a.value)) return String(a.value);
      }
      return null;
    };
    const name = pickByType(['name']) || pickByType(['short_text']) || 'Lead sem nome';
    const email = pickByType(['email']);
    const phone = pickByType(['phone_br', 'phone']);

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
            create: normalizedAnswers.map((a) => ({
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

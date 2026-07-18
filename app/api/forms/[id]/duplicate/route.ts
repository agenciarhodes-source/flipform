import { Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { logAudit } from '@/lib/audit';
import { rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { generateDuplicateFormName } from '@/lib/forms/generate-duplicate-form-name';
import { generateUniqueFormSlug } from '@/lib/forms/generate-unique-form-slug';

const ARCHIVED_WARNING = 'O formulário foi duplicado como inativo porque utiliza um pipeline ou etapa arquivada.';
const INVALID_PIPELINE_STAGE = 'Não foi possível duplicar o formulário porque o pipeline ou a etapa inicial não existem mais.';
const ROTATION_WARNING = 'O rodízio não foi ativado na cópia porque não há vendedores ativos válidos.';

function jsonValue(value: Prisma.JsonValue | null): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  return value == null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
}

export const POST = withPermission('FORMS_CREATE', async (_req, session, ctx: { params: { id: string } }) => {
  const rl = rateLimit({ key: `form-duplicate:${session.tenantId}:${session.userId}`, limit: 10, windowMs: 60_000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const sourceForm = await prisma.form.findFirst({
    where: { id: ctx.params.id, tenantId: session.tenantId },
    include: {
      fields: { orderBy: { orderIndex: 'asc' } },
      assignmentRotations: { include: { members: { orderBy: { orderIndex: 'asc' } } } },
    },
  });
  if (!sourceForm) return NextResponse.json({ error: 'Formulário não encontrado.' }, { status: 404 });

  const pipeline = await prisma.pipeline.findFirst({ where: { id: sourceForm.pipelineId, tenantId: session.tenantId } });
  const stage = await prisma.pipelineStage.findFirst({ where: { id: sourceForm.initialStageId, pipelineId: sourceForm.pipelineId } });
  if (!pipeline || !stage) return NextResponse.json({ error: INVALID_PIPELINE_STAGE }, { status: 400 });

  const warnings: string[] = [];
  if (pipeline.isArchived || stage.isArchived) warnings.push(ARCHIVED_WARNING);

  const duplicateName = await generateDuplicateFormName(session.tenantId, sourceForm.name);
  const copiedFieldsCount = sourceForm.fields.length;
  let duplicatedForm: Awaited<ReturnType<typeof prisma.form.create>> | null = null;

  for (let attempt = 0; attempt < 6; attempt++) {
    const duplicateSlug = await generateUniqueFormSlug({
      tenantId: session.tenantId,
      name: duplicateName,
      excludeSlug: sourceForm.slug,
      suffix: attempt === 0 ? undefined : `${attempt + 1}-${Math.random().toString(36).slice(2, 6)}`,
    });
    try {
      duplicatedForm = await prisma.$transaction(async (tx) => {
        const form = await tx.form.create({
          data: {
            tenantId: session.tenantId,
            name: duplicateName,
            slug: duplicateSlug,
            publicTitle: sourceForm.publicTitle,
            publicDescription: sourceForm.publicDescription,
            primaryColor: sourceForm.primaryColor,
            bgColor: sourceForm.bgColor,
            buttonColor: sourceForm.buttonColor,
            textColor: sourceForm.textColor,
            theme: sourceForm.theme,
            logoUrl: sourceForm.logoUrl,
            coverImageUrl: sourceForm.coverImageUrl,
            successMessage: sourceForm.successMessage,
            disqualificationSettings: jsonValue(sourceForm.disqualificationSettings),
            leadSource: sourceForm.leadSource || 'formulario',
            pipelineId: sourceForm.pipelineId,
            initialStageId: sourceForm.initialStageId,
            isActive: false,
            fields: {
              create: sourceForm.fields.map((field) => ({
                label: field.label,
                placeholder: field.placeholder,
                description: field.description,
                fieldType: field.fieldType,
                options: jsonValue(field.options),
                validationRules: jsonValue(field.validationRules),
                isRequired: field.isRequired,
                orderIndex: field.orderIndex,
              })),
            },
          },
          include: { fields: { orderBy: { orderIndex: 'asc' } }, _count: { select: { leads: true, fields: true } } },
        });

        const rotation = sourceForm.assignmentRotations[0];
        if (rotation) {
          const userIds = rotation.members.map((member) => member.userId);
          const activeAgents = await tx.tenantUser.findMany({ where: { tenantId: session.tenantId, userId: { in: userIds }, role: 'agent', status: 'active' }, select: { userId: true } });
          const valid = new Set(activeAgents.map((agent) => agent.userId));
          const members = rotation.members.filter((member) => member.isActive && valid.has(member.userId));
          const newRotation = await tx.leadAssignmentRotation.create({ data: { tenantId: session.tenantId, formId: form.id, isEnabled: rotation.isEnabled && members.length > 0, strategy: rotation.strategy, currentIndex: 0, lastAssignedTo: null } });
          if (members.length) await tx.leadAssignmentRotationMember.createMany({ data: members.map((member, index) => ({ rotationId: newRotation.id, userId: member.userId, orderIndex: member.orderIndex ?? index, isActive: member.isActive })) });
          if (rotation.isEnabled && members.length === 0) warnings.push(ROTATION_WARNING);
        }
        return form;
      });
      break;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002' && attempt < 5) continue;
      throw e;
    }
  }

  if (!duplicatedForm) return NextResponse.json({ error: 'Não foi possível gerar um slug único para a cópia.' }, { status: 409 });

  await logAudit({ tenantId: session.tenantId, userId: session.userId, entityType: 'form', entityId: duplicatedForm.id, action: 'form.duplicated', metadata: { sourceFormId: sourceForm.id, sourceFormName: sourceForm.name, newFormId: duplicatedForm.id, newFormName: duplicatedForm.name, newSlug: duplicatedForm.slug, copiedFields: copiedFieldsCount, isActive: false } });

  return NextResponse.json({ ok: true, form: duplicatedForm, warning: warnings[0] ?? null }, { status: 201 });
});

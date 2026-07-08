import { Prisma } from '@prisma/client';

export type LeadAssignmentTx = Prisma.TransactionClient;

export async function assignLeadByRotation({ tenantId, formId, tx }: { tenantId: string; formId: string; tx: LeadAssignmentTx }): Promise<{ assignedTo: string | null; reason: string }> {
  const locked = await tx.$queryRaw<Array<{ id: string; is_enabled: boolean; current_index: number }>>`
    SELECT id, is_enabled, current_index
    FROM public.lead_assignment_rotations
    WHERE tenant_id = ${tenantId} AND form_id = ${formId}
    FOR UPDATE
  `;
  const row = locked[0];
  if (!row) return { assignedTo: null, reason: 'rotation_not_configured' };
  if (!row.is_enabled) return { assignedTo: null, reason: 'rotation_disabled' };

  const members = await tx.leadAssignmentRotationMember.findMany({
    where: {
      rotationId: row.id,
      isActive: true,
      user: { tenantUsers: { some: { tenantId, role: 'agent', status: 'active' } } },
    },
    orderBy: [{ orderIndex: 'asc' }, { createdAt: 'asc' }],
    select: { userId: true },
  });
  if (members.length === 0) return { assignedTo: null, reason: 'no_active_agents' };

  const index = Math.abs(row.current_index || 0) % members.length;
  const selected = members[index];
  const nextIndex = (index + 1) % members.length;
  await tx.leadAssignmentRotation.update({
    where: { id: row.id },
    data: { currentIndex: nextIndex, lastAssignedTo: selected.userId },
  });
  return { assignedTo: selected.userId, reason: 'round_robin' };
}

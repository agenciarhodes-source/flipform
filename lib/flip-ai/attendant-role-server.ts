import 'server-only';

import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { DEFAULT_ATTENDANT_ROLE, parseAttendantRole, type AttendantRole } from './attendant-role';

/** The profile of an attendant of the company; "closer" when none was chosen (or the table is missing). */
export async function loadAttendantRole(tenantId: string, agentId: string): Promise<AttendantRole> {
  const row = await prisma.attendantProfile.findFirst({
    where: { tenantId, agentId },
    select: { role: true },
  }).catch(() => null);
  return row ? parseAttendantRole(row.role) : DEFAULT_ATTENDANT_ROLE;
}

/** Saves the profile of an attendant that belongs to the company. */
export async function saveAttendantRole(input: { tenantId: string; agentId: string; role: AttendantRole; userId: string | null }) {
  const agent = await prisma.flipAiAgent.findFirst({ where: { id: input.agentId, tenantId: input.tenantId }, select: { id: true } });
  if (!agent) return null;
  const existing = await prisma.attendantProfile.findFirst({ where: { agentId: agent.id }, select: { id: true, tenantId: true } });
  if (existing && existing.tenantId !== input.tenantId) return null;
  const saved = existing
    ? await prisma.attendantProfile.update({ where: { id: existing.id }, data: { role: input.role, updatedBy: input.userId } })
    : await prisma.attendantProfile.create({ data: { id: randomUUID(), tenantId: input.tenantId, agentId: agent.id, role: input.role, updatedBy: input.userId } });
  await prisma.auditLog.create({
    data: {
      tenantId: input.tenantId, userId: input.userId, entityType: 'flip_ai_agent', entityId: agent.id,
      action: 'flip_ai.attendant_role_changed', metadata: { role: input.role },
    },
  }).catch(() => undefined);
  return parseAttendantRole(saved.role);
}

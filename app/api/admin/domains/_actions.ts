import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";

export async function updateAdminDomain(params: {
  id: string;
  userId: string;
  action: string;
  data: Record<string, any>;
}) {
  const current = await prisma.customFormDomain.findUnique({ where: { id: params.id } });
  if (!current) return null;
  const updated = await prisma.$transaction(async (tx) => {
    if (params.data.isPrimary) {
      await tx.customFormDomain.updateMany({ where: { tenantId: current.tenantId, id: { not: current.id } }, data: { isPrimary: false } });
    }
    return tx.customFormDomain.update({
      where: { id: current.id },
      data: params.data,
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
  });
  await logAudit({
    tenantId: current.tenantId,
    userId: params.userId,
    entityType: "custom_form_domain",
    entityId: current.id,
    action: params.action,
    metadata: {
      domain: current.domain,
      tenantId: current.tenantId,
      previousStatus: current.status,
      newStatus: updated.status,
      dnsTarget: updated.dnsTarget,
      verificationReason: updated.verificationReason,
    },
  });
  return updated;
}

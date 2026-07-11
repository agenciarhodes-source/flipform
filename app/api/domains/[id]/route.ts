import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/rbac-server";
import { logAudit } from "@/lib/audit";

export const DELETE = withPermission(
  "DOMAINS_MANAGE",
  async (_req, session, ctx: { params: { id: string } }) => {
    const domain = await prisma.customFormDomain.findFirst({
      where: { id: ctx.params.id, tenantId: session.tenantId },
    });
    if (!domain)
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
    if (domain.status === "active")
      return NextResponse.json(
        { error: "Domínios ativos só podem ser removidos pelo suporte." },
        { status: 400 },
      );
    await prisma.customFormDomain.delete({ where: { id: domain.id } });
    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: "custom_form_domain",
      entityId: domain.id,
      action: "domain.deleted",
      metadata: { domain: domain.domain },
    });
    return NextResponse.json({ ok: true });
  },
);

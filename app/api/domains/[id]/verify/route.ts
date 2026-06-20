import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/rbac-server";

export const POST = withPermission(
  "SETTINGS_EDIT",
  async (_req, session, ctx: { params: { id: string } }) => {
    const domain = await prisma.customFormDomain.findFirst({
      where: { id: ctx.params.id, tenantId: session.tenantId },
    });
    if (!domain)
      return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

    const isActive = domain.status === "active" && domain.verificationStatus === "verified" && domain.sslStatus === "active";
    const hasDnsTarget = Boolean(domain.dnsTarget || domain.verificationValue);
    return NextResponse.json({
      domain,
      state: isActive ? "active" : hasDnsTarget ? "dns_pending" : "pending_setup",
      message: isActive
        ? "Domínio ativo e pronto para uso."
        : hasDnsTarget
          ? "Domínio aguardando configuração DNS."
          : "Domínio aguardando configuração técnica.",
    });
  },
);

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/rbac-server";
import { activateCustomFormDomain, syncDomainWithVercel } from "@/lib/custom-form-domains";
import { logAudit } from "@/lib/audit";

export const POST = withPermission(
  "DOMAINS_MANAGE",
  async (_req, session, ctx: { params: { id: string } }) => {
    const domain = await prisma.customFormDomain.findFirst({
      where: { id: ctx.params.id, tenantId: session.tenantId },
    });
    if (!domain)
      return NextResponse.json({ error: "Domínio não encontrado." }, { status: 404 });

    const result = await syncDomainWithVercel(domain.domain);
    const dnsTarget = result.instruction.value;
    const verificationDomain = result.instruction.name || "leads";
    const verificationType = result.instruction.type;
    const verificationValue = result.instruction.value;

    const data = {
      status: result.status,
      verificationStatus: result.verificationStatus,
      sslStatus: result.sslStatus,
      vercelVerified: result.verified,
      dnsTarget,
      verificationType,
      verificationDomain,
      verificationValue,
      verificationReason: result.reason ?? null,
      lastCheckedAt: new Date(),
      verifiedAt: result.status === "active" ? new Date() : domain.verifiedAt,
    };

    const updated = result.status === "active"
      ? await activateCustomFormDomain({ domainId: domain.id, actorUserId: session.userId, source: "client_verify", data })
      : await prisma.customFormDomain.update({ where: { id: domain.id }, data });

    if (result.status !== "active") {
      await logAudit({
        tenantId: domain.tenantId,
        userId: session.userId,
        entityType: "custom_form_domain",
        entityId: domain.id,
        action: "domain.verified",
        metadata: { domainId: domain.id, domain: domain.domain, tenantId: domain.tenantId, source: "client_verify", status: result.status, connectionState: result.connectionState },
      });
    }

    const isActive = updated?.status === "active" && updated.verificationStatus === "verified" && updated.sslStatus === "active";
    const hasDnsTarget = Boolean(updated?.dnsTarget || updated?.verificationValue);
    return NextResponse.json({
      domain: updated,
      state: isActive ? "active" : hasDnsTarget ? "dns_pending" : "pending_setup",
      message: isActive
        ? "Domínio ativo e pronto para uso."
        : hasDnsTarget
          ? "Domínio aguardando configuração DNS."
          : "Domínio aguardando configuração técnica.",
      connection: result.connection,
    });
  },
);

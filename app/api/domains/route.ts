import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPermission } from "@/lib/rbac-server";
import {
  buildCustomFormDomainFromRoot,
  getConfiguredAppDomain,
} from "@/lib/custom-form-domains";
import { logAudit } from "@/lib/audit";

export const GET = withPermission("SETTINGS_VIEW", async (_req, session) => {
  const domains = await prisma.customFormDomain.findMany({
    where: { tenantId: session.tenantId },
    orderBy: [{ isPrimary: "desc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ domains, appDomain: getConfiguredAppDomain() });
});

export const POST = withPermission("SETTINGS_EDIT", async (req, session) => {
  try {
    const body = await req.json();
    if (
      body.subdomain &&
      String(body.subdomain).trim().toLowerCase() !== "leads"
    ) {
      return NextResponse.json(
        { error: "O subdomínio dos formulários deve ser sempre leads." },
        { status: 400 },
      );
    }

    const validated = buildCustomFormDomainFromRoot(
      String(body.rootDomain || body.domain || ""),
    );
    if (!validated.ok)
      return NextResponse.json({ error: validated.error }, { status: 400 });

    const existing = await prisma.customFormDomain.findUnique({
      where: { domain: validated.domain },
    });
    if (existing && existing.tenantId !== session.tenantId)
      return NextResponse.json(
        { error: "Este domínio já está vinculado a outra conta." },
        { status: 409 },
      );
    if (existing)
      return NextResponse.json(
        { error: "Este domínio já está cadastrado nesta conta." },
        { status: 409 },
      );

    const domain = await prisma.customFormDomain.create({
      data: {
        tenantId: session.tenantId,
        domain: validated.domain,
        isPrimary: false,
        status: "requested",
        verificationStatus: "pending",
        sslStatus: "unknown",
        vercelVerified: false,
        verificationType: null,
        verificationDomain: null,
        verificationValue: null,
        verificationReason:
          "Solicitação recebida. Aguardando configuração técnica pelo time FlipForm.",
        dnsTarget: null,
        lastCheckedAt: null,
      },
    });
    await logAudit({
      tenantId: session.tenantId,
      userId: session.userId,
      entityType: "custom_form_domain",
      entityId: domain.id,
      action: "domain.requested",
      metadata: { domain: domain.domain, managedByBackoffice: true },
    });
    return NextResponse.json(
      {
        domain,
        message:
          "Solicitação recebida. Nosso time irá configurar o domínio e informar o próximo passo de DNS.",
      },
      { status: 201 },
    );
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message || "Erro ao solicitar domínio." },
      { status: 500 },
    );
  }
});

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPlatformAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

const ALLOWED = new Set([
  "status",
  "verificationStatus",
  "sslStatus",
  "dnsTarget",
  "verificationType",
  "verificationDomain",
  "verificationValue",
  "verificationReason",
  "isPrimary",
  "vercelVerified",
]);
const STATUS_VALUES = new Set([
  "pending",
  "active",
  "error",
]);
const VERIFICATION_VALUES = new Set(["pending", "verified", "failed"]);
const SSL_VALUES = new Set(["unknown", "pending", "active", "failed"]);

type Ctx = { params: { id: string } };

export const PATCH = withPlatformAdmin<Ctx>(async (req, session, ctx) => {
  const current = await prisma.customFormDomain.findUnique({
    where: { id: ctx.params.id },
  });
  if (!current)
    return NextResponse.json(
      { error: "Domínio não encontrado." },
      { status: 404 },
    );

  const body = await req.json();
  const data: Record<string, any> = {};
  for (const [key, value] of Object.entries(body)) {
    if (!ALLOWED.has(key)) continue;
    data[key] = typeof value === "string" ? value.trim() || null : value;
  }

  if (data.status && !STATUS_VALUES.has(data.status))
    return NextResponse.json({ error: "Status inválido." }, { status: 400 });
  if (
    data.verificationStatus &&
    !VERIFICATION_VALUES.has(data.verificationStatus)
  )
    return NextResponse.json(
      { error: "Status de verificação inválido." },
      { status: 400 },
    );
  if (data.sslStatus && !SSL_VALUES.has(data.sslStatus))
    return NextResponse.json(
      { error: "Status de SSL inválido." },
      { status: 400 },
    );
  if (data.isPrimary && data.status !== "active" && current.status !== "active")
    return NextResponse.json(
      { error: "Apenas domínios ativos podem ser marcados como principal." },
      { status: 400 },
    );

  if (data.status === "active") {
    data.verificationStatus = data.verificationStatus || "verified";
    data.sslStatus = data.sslStatus || "active";
    data.verifiedAt = new Date();
    data.vercelVerified = true;
  }
  if (
    "dnsTarget" in data ||
    "verificationValue" in data ||
    "status" in data ||
    "verificationStatus" in data ||
    "sslStatus" in data
  )
    data.lastCheckedAt = new Date();

  const updated = await prisma.$transaction(async (tx) => {
    if (data.isPrimary)
      await tx.customFormDomain.updateMany({
        where: { tenantId: current.tenantId, id: { not: current.id } },
        data: { isPrimary: false },
      });
    return tx.customFormDomain.update({
      where: { id: current.id },
      data,
      include: { tenant: { select: { id: true, name: true, slug: true } } },
    });
  });

  await logAudit({
    tenantId: current.tenantId,
    userId: session.userId,
    entityType: "custom_form_domain",
    entityId: current.id,
    action: "domain.admin_updated",
    metadata: { domain: current.domain, tenantId: current.tenantId, previousStatus: current.status, newStatus: updated.status, dnsTarget: updated.dnsTarget, verificationReason: updated.verificationReason, before: current, after: data },
  });
  return NextResponse.json({ domain: updated });
});

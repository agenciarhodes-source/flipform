import { NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/auth";
import { updateAdminDomain } from "../../_actions";

type Ctx = { params: { id: string } };
export const POST = withPlatformAdmin<Ctx>(async (_req, session, ctx) => {
  const domain = await updateAdminDomain({ id: ctx.params.id, userId: session.userId, action: "domain.admin_dns_pending", data: { status: "pending", verificationStatus: "pending", sslStatus: "unknown", verificationReason: "Aguardando configuração DNS pelo cliente." } });
  if (!domain) return NextResponse.json({ error: "Domínio não encontrado." }, { status: 404 });
  return NextResponse.json({ domain });
});

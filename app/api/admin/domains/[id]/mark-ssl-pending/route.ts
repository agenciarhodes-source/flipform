import { NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/auth";
import { updateAdminDomain } from "../../_actions";

type Ctx = { params: { id: string } };
export const POST = withPlatformAdmin<Ctx>(async (_req, session, ctx) => {
  const domain = await updateAdminDomain({ id: ctx.params.id, userId: session.userId, action: "domain.admin_ssl_pending", data: { status: "pending", verificationStatus: "verified", sslStatus: "pending", verificationReason: "DNS verificado. Aguardando ativação do SSL.", lastCheckedAt: new Date() } });
  if (!domain) return NextResponse.json({ error: "Domínio não encontrado." }, { status: 404 });
  return NextResponse.json({ domain });
});

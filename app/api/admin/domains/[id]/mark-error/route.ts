import { NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/auth";
import { updateAdminDomain } from "../../_actions";

type Ctx = { params: { id: string } };
export const POST = withPlatformAdmin<Ctx>(async (req, session, ctx) => {
  const body = await req.json().catch(() => ({}));
  const reason = String(body.reason || "Erro na configuração do domínio.").trim();
  const domain = await updateAdminDomain({ id: ctx.params.id, userId: session.userId, action: "domain.admin_error", data: { status: "error", verificationStatus: "failed", sslStatus: "failed", verificationReason: reason, lastCheckedAt: new Date() } });
  if (!domain) return NextResponse.json({ error: "Domínio não encontrado." }, { status: 404 });
  return NextResponse.json({ domain });
});

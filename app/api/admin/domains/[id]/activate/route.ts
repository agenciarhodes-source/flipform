import { NextResponse } from "next/server";
import { withPlatformAdmin } from "@/lib/auth";
import { activateCustomFormDomain } from "@/lib/custom-form-domains";

type Ctx = { params: { id: string } };
export const POST = withPlatformAdmin<Ctx>(async (_req, session, ctx) => {
  const domain = await activateCustomFormDomain({
    domainId: ctx.params.id,
    actorUserId: session.userId,
    source: "admin",
  });
  if (!domain) return NextResponse.json({ error: "Domínio não encontrado." }, { status: 404 });
  return NextResponse.json({ domain });
});

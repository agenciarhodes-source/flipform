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
    return NextResponse.json(
      { error: "A verificação de domínios é realizada pelo time FlipForm." },
      { status: 409 },
    );
  },
);

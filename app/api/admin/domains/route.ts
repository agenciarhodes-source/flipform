import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withPlatformAdmin } from "@/lib/auth";

export const GET = withPlatformAdmin(async () => {
  const domains = await prisma.customFormDomain.findMany({
    orderBy: [{ createdAt: "desc" }],
    include: { tenant: { select: { id: true, name: true, slug: true } } },
  });
  return NextResponse.json({ domains });
});

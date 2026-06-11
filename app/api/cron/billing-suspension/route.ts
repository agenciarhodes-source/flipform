import { NextResponse } from "next/server";
import { captureServerException } from "@/lib/observability";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { scanSubscriptionsForSuspension } from "@/lib/billing-suspension";
import { isCronRequestAuthorized } from "@/lib/cron-auth";

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rl = rateLimit({
      key: `job:billing-suspension:ip:${ip}`,
      limit: 10,
      windowMs: 60 * 1000,
    });
    if (!rl.allowed) return rateLimitResponse(rl);

    if (!isCronRequestAuthorized(req))
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });

    const result = await scanSubscriptionsForSuspension();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    captureServerException(error, {
      route: "/api/cron/billing-suspension",
      method: "POST",
    });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logPlatformAudit } from "@/lib/platform-audit";
import { checkoutMethod, isPlanSlug, isSellablePlan, stripeSubscriptionsEnabled, type CheckoutMethod } from "@/lib/billing/subscription-rules";
import { StripeFoundationConfigError } from "@/lib/stripe/config";
import { startStripeSubscription, StripeSubscriptionCheckoutError } from "@/lib/stripe/subscription-checkout";

const OFFICIAL_FLIPFORM_HOSTS = new Set([
  "flipform.com.br",
  "www.flipform.com.br",
  "app.flipform.com.br",
]);

function officialOriginFromUrl(value?: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !OFFICIAL_FLIPFORM_HOSTS.has(url.host))
      return null;
    return url.origin;
  } catch {
    return null;
  }
}

const ALLOWED_ORIGINS = new Set(
  [
    "https://flipform.com.br",
    "https://www.flipform.com.br",
    "https://app.flipform.com.br",
    officialOriginFromUrl(process.env.PUBLIC_SITE_URL),
    officialOriginFromUrl(process.env.NEXT_PUBLIC_BASE_URL),
  ].filter((origin): origin is string => Boolean(origin)),
);
const PUBLIC_CHECKOUT_UNAVAILABLE_MESSAGE =
  "Checkout temporariamente indisponível. Entre em contato com o suporte.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function digitsOnly(input: string) {
  return input.replace(/\D/g, "");
}

function json(
  payload: Record<string, unknown>,
  init?: ResponseInit,
  origin?: string | null,
) {
  const res = NextResponse.json(payload, init);
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }
  return res;
}

function addCors(res: NextResponse, origin?: string | null) {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Vary", "Origin");
  }
  return res;
}

function forbiddenOrigin(origin: string | null) {
  return Boolean(origin && !ALLOWED_ORIGINS.has(origin));
}

function publicCheckoutUnavailablePayload(errorCode: string) {
  return { ok: false, error: PUBLIC_CHECKOUT_UNAVAILABLE_MESSAGE, errorCode };
}

const PUBLIC_CHECKOUT_PAYMENT_ERROR =
  "Não foi possível iniciar o pagamento. Tente novamente.";

async function buildTenantSlug(companyName: string) {
  const base = slugify(companyName) || "cliente-flipform";
  for (let i = 0; i < 5; i += 1) {
    const suffix = `${Date.now().toString(36)}${i ? `-${i}` : ""}`;
    const slug = `${base}-${suffix}`.slice(0, 80).replace(/-$/, "");
    const exists = await prisma.tenant.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!exists) return slug;
  }
  return `cliente-flipform-${crypto.randomUUID().slice(0, 8)}`;
}

async function resolveCheckoutTenant(email: string, companyName: string) {
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });
  if (existingUser) {
    return {
      error:
        "Este e-mail já possui acesso ao FlipForm. Entre em contato com o suporte para alterar o plano.",
    } as const;
  }

  const allowedUsers = await prisma.allowedUser.findMany({
    where: { email },
    select: {
      id: true,
      tenantId: true,
      active: true,
      status: true,
      source: true,
    },
    orderBy: { createdAt: "asc" },
    take: 2,
  });

  if (allowedUsers.length > 1) {
    return {
      error:
        "Este e-mail já está vinculado a mais de um workspace. Entre em contato com o suporte.",
    } as const;
  }

  const existingAllowed = allowedUsers[0];
  if (existingAllowed) {
    const isSafePendingCheckout =
      existingAllowed.source === "checkout_public" &&
      !existingAllowed.active &&
      existingAllowed.status !== "active";

    if (!isSafePendingCheckout) {
      return {
        error:
          "Este e-mail já possui acesso ao FlipForm. Entre em contato com o suporte para alterar o plano.",
      } as const;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: existingAllowed.tenantId },
      select: { id: true, name: true, status: true },
    });
    if (
      !tenant ||
      tenant.status === "canceled" ||
      tenant.status === "blocked"
    ) {
      return {
        error:
          "Não foi possível iniciar o checkout para este e-mail. Entre em contato com o suporte.",
      } as const;
    }
    return { tenant } as const;
  }

  const slug = await buildTenantSlug(companyName);
  const tenant = await prisma.tenant.create({
    data: {
      name: companyName,
      slug,
      status: "past_due",
      allowedUsers: {
        create: {
          email,
          role: "owner",
          active: false,
          status: "pending",
          source: "checkout_public",
        },
      },
    },
    select: { id: true, name: true, status: true },
  });

  return { tenant } as const;
}

/** Subscription paid through Stripe (card, Pix or boleto), with the free trial. */
async function stripeCheckout(
  input: { planSlug: string; name: string; email: string; phone: string; companyName: string; method: CheckoutMethod },
  origin: string | null,
) {
  const plan = await prisma.plan.findFirst({
    where: { slug: input.planSlug, isActive: true },
    select: { id: true, slug: true, name: true, price: true, billingCycle: true, isActive: true },
  });
  if (!plan || !isSellablePlan(plan)) {
    return json({ ok: false, error: "Plano inválido ou indisponível." }, { status: 400 }, origin);
  }
  const resolved = await resolveCheckoutTenant(input.email, input.companyName);
  if ("error" in resolved) {
    return json({ ok: false, error: resolved.error }, { status: 409 }, origin);
  }
  const tenant = resolved.tenant;
  await logPlatformAudit({
    tenantId: tenant.id, userId: null, entityType: "checkout", entityId: input.email,
    action: "billing.checkout_started", metadata: { planSlug: plan.slug, provider: "stripe", method: input.method },
  });
  try {
    const result = await startStripeSubscription({
      tenant: { id: tenant.id, name: tenant.name },
      plan: { ...plan, billingCycle: String(plan.billingCycle) },
      email: input.email,
      name: input.name,
      phone: input.phone || null,
      method: input.method,
    });
    return json({ ok: true, ...result }, undefined, origin);
  } catch (error) {
    if (error instanceof StripeSubscriptionCheckoutError && error.code === "ALREADY_SUBSCRIBED") {
      return json({ ok: false, error: "Esta empresa já tem uma assinatura. Entre pelo login ou fale com o suporte." }, { status: 409 }, origin);
    }
    const code = error instanceof StripeFoundationConfigError || error instanceof StripeSubscriptionCheckoutError
      ? error.code : "STRIPE_CHECKOUT_FAILED";
    console.error("[public-checkout]", { event: "stripe_checkout_failed", planSlug: plan.slug, tenantId: tenant.id, code });
    await logPlatformAudit({
      tenantId: tenant.id, userId: null, entityType: "checkout", entityId: input.email,
      action: "billing.checkout_failed", metadata: { planSlug: plan.slug, provider: "stripe", code },
    });
    if (error instanceof StripeFoundationConfigError) {
      return json(publicCheckoutUnavailablePayload(code), { status: 503 }, origin);
    }
    return json({ ok: false, error: PUBLIC_CHECKOUT_PAYMENT_ERROR, errorCode: code }, { status: 502 }, origin);
  }
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin");
  if (forbiddenOrigin(origin)) return new NextResponse(null, { status: 403 });

  const res = new NextResponse(null, { status: 204 });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.headers.set("Access-Control-Allow-Headers", "Content-Type");
    res.headers.set("Access-Control-Max-Age", "86400");
    res.headers.set("Vary", "Origin");
  }
  return res;
}

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (forbiddenOrigin(origin)) {
    return json(
      { ok: false, error: "Origem não autorizada." },
      { status: 403 },
      origin,
    );
  }

  const ip = getClientIp(req);
  const rl = await rateLimit({
    key: `public-checkout:ip:${ip}`,
    limit: 20,
    windowMs: 10 * 60 * 1000,
  });
  if (!rl.allowed) return addCors(rateLimitResponse(rl), origin);

  const body = await req.json().catch(() => ({}) as any);
  const planSlug = String(body?.planSlug || "")
    .trim()
    .toLowerCase();
  const name = String(body?.name || "").trim();
  const email = String(body?.email || "")
    .trim()
    .toLowerCase();
  const phone = digitsOnly(String(body?.phone || "").trim());
  const cpfCnpj = digitsOnly(
    String(body?.cpfCnpj || body?.document || "").trim(),
  );
  const companyName = String(body?.companyName || "").trim() || name;

  if (!isPlanSlug(planSlug)) {
    return json(
      { ok: false, error: "Plano inválido ou indisponível." },
      { status: 400 },
      origin,
    );
  }
  if (!name || !companyName || !email || !EMAIL_RE.test(email)) {
    return json(
      { ok: false, error: "Informe nome, empresa e um e-mail válido." },
      { status: 400 },
      origin,
    );
  }
  if (cpfCnpj && ![11, 14].includes(cpfCnpj.length)) {
    return json(
      { ok: false, error: "CPF/CNPJ inválido." },
      { status: 400 },
      origin,
    );
  }

  // Plans are sold only through Stripe (card, Pix or boleto); without it the checkout is closed.
  if (!stripeSubscriptionsEnabled()) {
    return json(publicCheckoutUnavailablePayload("STRIPE_SUBSCRIPTIONS_DISABLED"), { status: 503 }, origin);
  }
  return stripeCheckout({
    planSlug, name, email, phone, companyName,
    method: checkoutMethod(body?.paymentMethod || body?.metadata?.paymentMethod),
  }, origin);
}

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  AsaasConfigError,
  AsaasProviderError,
  assertAsaasConfig,
  createCustomer,
  createSubscription,
  listPaymentsBySubscription,
  mapAsaasPaymentStatus,
} from "@/lib/asaas";
import { getClientIp, rateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logPlatformAudit } from "@/lib/platform-audit";

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
const PUBLIC_PLAN_SLUGS = new Set(["starter", "growth", "pro"]);
const PUBLIC_CHECKOUT_UNAVAILABLE_MESSAGE =
  "Checkout temporariamente indisponível. Entre em contato com o suporte.";
const SAFE_ASAAS_CONFIG_ERROR_CODES = new Set([
  "ASAAS_API_KEY_MISSING",
  "ASAAS_BASE_URL_MISSING",
  "ASAAS_BASE_URL_INVALID",
  "ASAAS_WEBHOOK_TOKEN_MISSING",
  "NEXT_PUBLIC_BASE_URL_MISSING",
  "PUBLIC_SITE_URL_MISSING",
  "ASAAS_ENVIRONMENT_MISMATCH",
  "ASAAS_CONFIG_INVALID",
]);
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

function appBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://app.flipform.com.br"
  ).replace(/\/+$/, "");
}

function publicSiteUrl() {
  return (
    process.env.PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_MARKETING_URL ||
    "https://flipform.com.br"
  ).replace(/\/+$/, "");
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

function publicAsaasConfigErrorCode(error: unknown) {
  if (!(error instanceof AsaasConfigError)) return "ASAAS_CONFIG_INVALID";
  return SAFE_ASAAS_CONFIG_ERROR_CODES.has(error.code)
    ? error.code
    : "ASAAS_CONFIG_INVALID";
}

function publicCheckoutUnavailablePayload(errorCode: string) {
  return { ok: false, error: PUBLIC_CHECKOUT_UNAVAILABLE_MESSAGE, errorCode };
}

const PUBLIC_CHECKOUT_PAYMENT_ERROR =
  "Não foi possível iniciar o pagamento. Tente novamente.";
const INVALID_DOCUMENT_PAYMENT_ERROR =
  "CPF/CNPJ inválido para iniciar o pagamento.";

type PublicCheckoutErrorCode =
  | "ASAAS_CUSTOMER_CREATE_FAILED"
  | "ASAAS_SUBSCRIPTION_CREATE_FAILED"
  | "ASAAS_PAYMENT_LINK_MISSING"
  | "ASAAS_PROVIDER_ERROR";

class PublicCheckoutError extends Error {
  code: PublicCheckoutErrorCode;
  status: number;
  userMessage: string;
  cause?: unknown;

  constructor(
    code: PublicCheckoutErrorCode,
    message: string,
    options: { status?: number; userMessage?: string; cause?: unknown } = {},
  ) {
    super(message);
    this.name = "PublicCheckoutError";
    this.code = code;
    this.status = options.status || 502;
    this.userMessage = options.userMessage || PUBLIC_CHECKOUT_PAYMENT_ERROR;
    this.cause = options.cause;
  }
}

function selectedBillingType(value: unknown) {
  const method = String(value || "")
    .trim()
    .toLowerCase();
  if (method === "pix") return "PIX";
  if (method === "card" || method === "credit_card" || method === "credit-card")
    return "CREDIT_CARD";
  if (method === "boleto" || method === "bank_slip" || method === "bank-slip")
    return "BOLETO";
  return "UNDEFINED";
}

function asaasErrorText(error: AsaasProviderError) {
  return error.errors
    .map((item) =>
      `${item.code || ""} ${item.description || ""} ${item.message || ""}`.trim(),
    )
    .join(" ")
    .toLowerCase();
}

function isInvalidCpfCnpjError(error: unknown) {
  if (!(error instanceof AsaasProviderError)) return false;
  const text = asaasErrorText(error);
  return (
    (text.includes("cpf") || text.includes("cnpj")) &&
    (text.includes("inválid") || text.includes("invalid"))
  );
}

function asaasProviderDiagnostics(error: unknown) {
  if (!(error instanceof AsaasProviderError)) return undefined;
  return {
    asaasStatus: error.status,
    asaasEndpoint: error.endpoint,
    asaasErrorCodes: error.errors.map((item) => item.code).filter(Boolean),
  };
}

function asaasPaymentTimestamp(payment: any) {
  const value =
    payment?.dateCreated || payment?.dueDate || payment?.createdAt || "";
  const ts = Date.parse(String(value));
  return Number.isFinite(ts) ? ts : 0;
}

function pickSubscriptionPayment(response: any) {
  const payments = Array.isArray(response?.data) ? response.data : [];
  const withLinks = payments.filter(
    (payment: any) => payment?.invoiceUrl || payment?.bankSlipUrl,
  );
  const pendingLike = withLinks.filter((payment: any) => {
    const status = String(payment?.status || "").toUpperCase();
    return ![
      "RECEIVED",
      "CONFIRMED",
      "RECEIVED_IN_CASH",
      "REFUNDED",
      "DELETED",
      "CANCELLED",
      "CANCELED",
    ].includes(status);
  });
  return (
    [...(pendingLike.length ? pendingLike : withLinks)].sort(
      (a, b) => asaasPaymentTimestamp(b) - asaasPaymentTimestamp(a),
    )[0] || null
  );
}

function paymentUrlFrom(subscription: any, payment?: any) {
  return (
    subscription?.invoiceUrl ||
    subscription?.bankSlipUrl ||
    subscription?.payment?.invoiceUrl ||
    subscription?.payment?.bankSlipUrl ||
    subscription?.checkoutUrl ||
    payment?.invoiceUrl ||
    payment?.bankSlipUrl ||
    null
  );
}

function paymentDueDate(payment: any, fallback: string) {
  const raw = payment?.dueDate || payment?.nextDueDate || fallback;
  return raw ? new Date(raw) : null;
}

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
  const rl = rateLimit({
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
  const billingType = selectedBillingType(
    body?.paymentMethod || body?.metadata?.paymentMethod,
  );

  if (!PUBLIC_PLAN_SLUGS.has(planSlug)) {
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

  try {
    assertAsaasConfig({ requirePublicUrls: true });
  } catch (error) {
    const code = publicAsaasConfigErrorCode(error);
    console.error("[public-checkout]", {
      event: "checkout_config_invalid",
      code,
    });
    return json(
      publicCheckoutUnavailablePayload(code),
      { status: 503 },
      origin,
    );
  }

  const plan = await prisma.plan.findFirst({
    where: { slug: planSlug, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      price: true,
      billingCycle: true,
    },
  });
  if (!plan || !PUBLIC_PLAN_SLUGS.has(plan.slug)) {
    return json(
      { ok: false, error: "Plano inválido ou indisponível." },
      { status: 400 },
      origin,
    );
  }

  const resolved = await resolveCheckoutTenant(email, companyName);
  if ("error" in resolved) {
    return json({ ok: false, error: resolved.error }, { status: 409 }, origin);
  }
  const tenant = resolved.tenant;

  await logPlatformAudit({
    tenantId: tenant.id,
    userId: null,
    entityType: "checkout",
    entityId: email,
    action: "billing.checkout_started",
    metadata: { planSlug: plan.slug },
  });

  try {
    const reusablePayment = await prisma.payment.findFirst({
      where: {
        tenantId: tenant.id,
        status: "pending",
        subscription: {
          planId: plan.id,
          status: { in: ["past_due", "trialing"] },
        },
        OR: [{ invoiceUrl: { not: null } }, { bankSlipUrl: { not: null } }],
      },
      select: { invoiceUrl: true, bankSlipUrl: true, subscriptionId: true },
      orderBy: { createdAt: "desc" },
    });

    const reusableCheckoutUrl =
      reusablePayment?.invoiceUrl || reusablePayment?.bankSlipUrl;
    if (reusableCheckoutUrl) {
      await logPlatformAudit({
        tenantId: tenant.id,
        userId: null,
        entityType: "checkout",
        entityId: reusablePayment.subscriptionId || tenant.id,
        action: "billing.checkout_access_pending",
        metadata: { planSlug: plan.slug, reusedPendingPayment: true },
      });
      return json(
        {
          ok: true,
          checkoutUrl: reusableCheckoutUrl,
          status: "pending_payment",
        },
        undefined,
        origin,
      );
    }

    const latest = await prisma.subscription.findFirst({
      where: { tenantId: tenant.id },
      orderBy: { createdAt: "desc" },
    });
    let providerCustomerId = latest?.providerCustomerId || null;

    if (!providerCustomerId) {
      let customer;
      try {
        customer = await createCustomer({
          name: companyName || name,
          email,
          cpfCnpj: cpfCnpj || undefined,
          mobilePhone: phone || undefined,
          externalReference: tenant.id,
        });
      } catch (error) {
        throw new PublicCheckoutError(
          "ASAAS_CUSTOMER_CREATE_FAILED",
          "Falha ao criar cliente Asaas.",
          {
            userMessage: isInvalidCpfCnpjError(error)
              ? INVALID_DOCUMENT_PAYMENT_ERROR
              : PUBLIC_CHECKOUT_PAYMENT_ERROR,
            cause: error,
          },
        );
      }
      providerCustomerId = customer.id;
      await logPlatformAudit({
        tenantId: tenant.id,
        userId: null,
        entityType: "checkout",
        entityId: tenant.id,
        action: "billing.checkout_customer_created",
        metadata: { providerCustomerId },
      });
    }

    const nextDueDate = new Date(Date.now() + 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    const successUrl = `${appBaseUrl()}/login?checkout=success`;
    const pendingUrl = `${appBaseUrl()}/login?checkout=pending`;
    const cancelUrl = publicSiteUrl();
    let createdSub;
    try {
      createdSub = await createSubscription({
        customer: providerCustomerId,
        billingType,
        value: Number(plan.price),
        cycle: plan.billingCycle === "yearly" ? "YEARLY" : "MONTHLY",
        nextDueDate,
        externalReference: tenant.id,
        description: `FlipForm ${plan.name}`,
      });
    } catch (error) {
      throw new PublicCheckoutError(
        "ASAAS_SUBSCRIPTION_CREATE_FAILED",
        "Falha ao criar assinatura Asaas.",
        {
          userMessage: isInvalidCpfCnpjError(error)
            ? INVALID_DOCUMENT_PAYMENT_ERROR
            : PUBLIC_CHECKOUT_PAYMENT_ERROR,
          cause: error,
        },
      );
    }

    let listedPayment = null;
    let checkoutUrl = paymentUrlFrom(createdSub);
    if (!checkoutUrl && createdSub?.id) {
      const listedPayments = await listPaymentsBySubscription(createdSub.id);
      listedPayment = pickSubscriptionPayment(listedPayments);
      checkoutUrl = paymentUrlFrom(createdSub, listedPayment);
    }
    const paymentSource = listedPayment || createdSub?.payment || null;

    const subscription = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        provider: "asaas",
        paymentProvider: "asaas",
        providerCustomerId,
        providerSubscriptionId: createdSub.id,
        status: "past_due",
        paymentRequired: true,
        nextDueDate: createdSub.nextDueDate
          ? new Date(createdSub.nextDueDate)
          : new Date(nextDueDate),
      },
    });

    await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        provider: "asaas",
        providerPaymentId: paymentSource?.id || null,
        status: mapAsaasPaymentStatus(
          paymentSource?.status || "PENDING",
        ) as any,
        value: paymentSource?.value ?? plan.price,
        dueDate: paymentDueDate(paymentSource || createdSub, nextDueDate),
        invoiceUrl: createdSub?.invoiceUrl || paymentSource?.invoiceUrl || null,
        bankSlipUrl:
          createdSub?.bankSlipUrl || paymentSource?.bankSlipUrl || null,
        billingType:
          paymentSource?.billingType || createdSub?.billingType || billingType,
        rawPayload: {
          subscription: createdSub,
          payment: paymentSource,
          checkoutUrls: { successUrl, pendingUrl, cancelUrl },
        },
      },
    });

    await logPlatformAudit({
      tenantId: tenant.id,
      userId: null,
      entityType: "checkout",
      entityId: subscription.id,
      action: "billing.checkout_subscription_created",
      metadata: { providerSubscriptionId: createdSub.id, planSlug: plan.slug },
    });
    await logPlatformAudit({
      tenantId: tenant.id,
      userId: null,
      entityType: "checkout",
      entityId: subscription.id,
      action: "billing.checkout_access_pending",
      metadata: { planSlug: plan.slug },
    });

    if (!checkoutUrl) {
      throw new PublicCheckoutError(
        "ASAAS_PAYMENT_LINK_MISSING",
        "Asaas checkout URL missing",
        { status: 502 },
      );
    }

    return json(
      { ok: true, checkoutUrl, status: "pending_payment" },
      undefined,
      origin,
    );
  } catch (error) {
    const isAsaasConfigError = error instanceof AsaasConfigError;
    const publicCheckoutError =
      error instanceof PublicCheckoutError ? error : null;
    const providerCause = publicCheckoutError?.cause || error;
    const code = isAsaasConfigError
      ? publicAsaasConfigErrorCode(error)
      : publicCheckoutError?.code ||
        (providerCause instanceof AsaasProviderError
          ? "ASAAS_PROVIDER_ERROR"
          : "ASAAS_PROVIDER_ERROR");
    console.error("[public-checkout]", {
      event: isAsaasConfigError ? "checkout_config_invalid" : "checkout_failed",
      planSlug: plan.slug,
      tenantId: tenant.id,
      code,
      message: isAsaasConfigError
        ? error.message
        : "Falha controlada ao iniciar cobrança Asaas.",
      ...asaasProviderDiagnostics(providerCause),
    });
    await logPlatformAudit({
      tenantId: tenant.id,
      userId: null,
      entityType: "checkout",
      entityId: email,
      action: "billing.checkout_failed",
      metadata: { planSlug: plan.slug },
    });
    if (isAsaasConfigError) {
      return json(
        publicCheckoutUnavailablePayload(code),
        { status: 503 },
        origin,
      );
    }
    return json(
      {
        ok: false,
        error:
          publicCheckoutError?.userMessage || PUBLIC_CHECKOUT_PAYMENT_ERROR,
        errorCode: code,
      },
      { status: publicCheckoutError?.status || 502 },
      origin,
    );
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { AsaasConfigError, assertAsaasConfig, createCustomer, createSubscription } from '@/lib/asaas';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logPlatformAudit } from '@/lib/platform-audit';

const OFFICIAL_FLIPFORM_HOSTS = new Set(['flipform.com.br', 'www.flipform.com.br', 'app.flipform.com.br']);

function officialOriginFromUrl(value?: string | null) {
  if (!value) return null;

  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !OFFICIAL_FLIPFORM_HOSTS.has(url.host)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

const ALLOWED_ORIGINS = new Set(
  [
    'https://flipform.com.br',
    'https://www.flipform.com.br',
    'https://app.flipform.com.br',
    officialOriginFromUrl(process.env.PUBLIC_SITE_URL),
    officialOriginFromUrl(process.env.NEXT_PUBLIC_BASE_URL),
  ].filter((origin): origin is string => Boolean(origin)),
);
const PUBLIC_PLAN_SLUGS = new Set(['starter', 'growth', 'pro']);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function slugify(input: string) {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function digitsOnly(input: string) {
  return input.replace(/\D/g, '');
}

function appBaseUrl() {
  return (process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://app.flipform.com.br').replace(/\/+$/, '');
}

function publicSiteUrl() {
  return (process.env.PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_MARKETING_URL || 'https://flipform.com.br').replace(/\/+$/, '');
}

function json(payload: Record<string, unknown>, init?: ResponseInit, origin?: string | null) {
  const res = NextResponse.json(payload, init);
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Vary', 'Origin');
  }
  return res;
}

function addCors(res: NextResponse, origin?: string | null) {
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Vary', 'Origin');
  }
  return res;
}

function forbiddenOrigin(origin: string | null) {
  return Boolean(origin && !ALLOWED_ORIGINS.has(origin));
}

async function buildTenantSlug(companyName: string) {
  const base = slugify(companyName) || 'cliente-flipform';
  for (let i = 0; i < 5; i += 1) {
    const suffix = `${Date.now().toString(36)}${i ? `-${i}` : ''}`;
    const slug = `${base}-${suffix}`.slice(0, 80).replace(/-$/, '');
    const exists = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
    if (!exists) return slug;
  }
  return `cliente-flipform-${crypto.randomUUID().slice(0, 8)}`;
}

async function resolveCheckoutTenant(email: string, companyName: string) {
  const existingUser = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existingUser) {
    return { error: 'Este e-mail já possui acesso ao FlipForm. Entre em contato com o suporte para alterar o plano.' } as const;
  }

  const allowedUsers = await prisma.allowedUser.findMany({
    where: { email },
    select: { id: true, tenantId: true, active: true, status: true, source: true },
    orderBy: { createdAt: 'asc' },
    take: 2,
  });

  if (allowedUsers.length > 1) {
    return { error: 'Este e-mail já está vinculado a mais de um workspace. Entre em contato com o suporte.' } as const;
  }

  const existingAllowed = allowedUsers[0];
  if (existingAllowed) {
    const isSafePendingCheckout =
      existingAllowed.source === 'checkout_public' &&
      !existingAllowed.active &&
      existingAllowed.status !== 'active';

    if (!isSafePendingCheckout) {
      return { error: 'Este e-mail já possui acesso ao FlipForm. Entre em contato com o suporte para alterar o plano.' } as const;
    }

    const tenant = await prisma.tenant.findUnique({
      where: { id: existingAllowed.tenantId },
      select: { id: true, name: true, status: true },
    });
    if (!tenant || tenant.status === 'canceled' || tenant.status === 'blocked') {
      return { error: 'Não foi possível iniciar o checkout para este e-mail. Entre em contato com o suporte.' } as const;
    }
    return { tenant } as const;
  }

  const slug = await buildTenantSlug(companyName);
  const tenant = await prisma.tenant.create({
    data: {
      name: companyName,
      slug,
      status: 'past_due',
      allowedUsers: {
        create: {
          email,
          role: 'owner',
          active: false,
          status: 'pending',
          source: 'checkout_public',
        },
      },
    },
    select: { id: true, name: true, status: true },
  });

  return { tenant } as const;
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get('origin');
  if (forbiddenOrigin(origin)) return new NextResponse(null, { status: 403 });

  const res = new NextResponse(null, { status: 204 });
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
    res.headers.set('Access-Control-Max-Age', '86400');
    res.headers.set('Vary', 'Origin');
  }
  return res;
}

export async function POST(req: Request) {
  const origin = req.headers.get('origin');
  if (forbiddenOrigin(origin)) {
    return json({ ok: false, error: 'Origem não autorizada.' }, { status: 403 }, origin);
  }

  const ip = getClientIp(req);
  const rl = rateLimit({ key: `public-checkout:ip:${ip}`, limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) return addCors(rateLimitResponse(rl), origin);

  const body = await req.json().catch(() => ({} as any));
  const planSlug = String(body?.planSlug || '').trim().toLowerCase();
  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const phone = digitsOnly(String(body?.phone || '').trim());
  const cpfCnpj = digitsOnly(String(body?.cpfCnpj || body?.document || '').trim());
  const companyName = String(body?.companyName || '').trim() || name;

  if (!PUBLIC_PLAN_SLUGS.has(planSlug)) {
    return json({ ok: false, error: 'Plano inválido ou indisponível.' }, { status: 400 }, origin);
  }
  if (!name || !companyName || !email || !EMAIL_RE.test(email)) {
    return json({ ok: false, error: 'Informe nome, empresa e um e-mail válido.' }, { status: 400 }, origin);
  }
  if (cpfCnpj && ![11, 14].includes(cpfCnpj.length)) {
    return json({ ok: false, error: 'CPF/CNPJ inválido.' }, { status: 400 }, origin);
  }

  try {
    assertAsaasConfig({ requirePublicUrls: true });
  } catch (error) {
    const code = error instanceof AsaasConfigError ? error.code : 'ASAAS_CONFIG_INVALID';
    console.error('[public-checkout]', { event: 'checkout_config_invalid', code });
    return json(
      { ok: false, error: 'Checkout temporariamente indisponível. Entre em contato com o suporte.' },
      { status: 503 },
      origin,
    );
  }

  const plan = await prisma.plan.findFirst({
    where: { slug: planSlug, isActive: true },
    select: { id: true, slug: true, name: true, price: true, billingCycle: true },
  });
  if (!plan || !PUBLIC_PLAN_SLUGS.has(plan.slug)) {
    return json({ ok: false, error: 'Plano inválido ou indisponível.' }, { status: 400 }, origin);
  }

  const resolved = await resolveCheckoutTenant(email, companyName);
  if ('error' in resolved) {
    return json({ ok: false, error: resolved.error }, { status: 409 }, origin);
  }
  const tenant = resolved.tenant;

  await logPlatformAudit({
    tenantId: tenant.id,
    userId: null,
    entityType: 'checkout',
    entityId: email,
    action: 'billing.checkout_started',
    metadata: { planSlug: plan.slug },
  });

  try {
    const reusablePayment = await prisma.payment.findFirst({
      where: {
        tenantId: tenant.id,
        status: 'pending',
        subscription: { planId: plan.id, status: { in: ['past_due', 'trialing'] } },
        OR: [{ invoiceUrl: { not: null } }, { bankSlipUrl: { not: null } }],
      },
      select: { invoiceUrl: true, bankSlipUrl: true, subscriptionId: true },
      orderBy: { createdAt: 'desc' },
    });

    const reusableCheckoutUrl = reusablePayment?.invoiceUrl || reusablePayment?.bankSlipUrl;
    if (reusableCheckoutUrl) {
      await logPlatformAudit({
        tenantId: tenant.id,
        userId: null,
        entityType: 'checkout',
        entityId: reusablePayment.subscriptionId || tenant.id,
        action: 'billing.checkout_access_pending',
        metadata: { planSlug: plan.slug, reusedPendingPayment: true },
      });
      return json({ ok: true, checkoutUrl: reusableCheckoutUrl, status: 'pending_payment' }, undefined, origin);
    }

    const latest = await prisma.subscription.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' } });
    let providerCustomerId = latest?.providerCustomerId || null;

    if (!providerCustomerId) {
      const customer = await createCustomer({
        name: companyName || name,
        email,
        phone: phone || undefined,
        cpfCnpj: cpfCnpj || undefined,
        externalReference: tenant.id,
      });
      providerCustomerId = customer.id;
      await logPlatformAudit({
        tenantId: tenant.id,
        userId: null,
        entityType: 'checkout',
        entityId: tenant.id,
        action: 'billing.checkout_customer_created',
        metadata: { providerCustomerId },
      });
    }

    const nextDueDate = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const successUrl = `${appBaseUrl()}/login?checkout=success`;
    const pendingUrl = `${appBaseUrl()}/login?checkout=pending`;
    const cancelUrl = publicSiteUrl();
    const createdSub = await createSubscription({
      customer: providerCustomerId,
      billingType: 'UNDEFINED',
      value: Number(plan.price),
      cycle: plan.billingCycle === 'yearly' ? 'YEARLY' : 'MONTHLY',
      nextDueDate,
      externalReference: tenant.id,
      description: `FlipForm ${plan.name}`,
    });

    const subscription = await prisma.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        provider: 'asaas',
        paymentProvider: 'asaas',
        providerCustomerId,
        providerSubscriptionId: createdSub.id,
        status: 'past_due',
        paymentRequired: true,
        nextDueDate: createdSub.nextDueDate ? new Date(createdSub.nextDueDate) : new Date(nextDueDate),
      },
    });

    await prisma.payment.create({
      data: {
        tenantId: tenant.id,
        subscriptionId: subscription.id,
        provider: 'asaas',
        providerPaymentId: createdSub?.payment?.id || null,
        status: 'pending',
        value: plan.price,
        dueDate: createdSub.nextDueDate ? new Date(createdSub.nextDueDate) : new Date(nextDueDate),
        invoiceUrl: createdSub?.invoiceUrl || createdSub?.payment?.invoiceUrl || null,
        bankSlipUrl: createdSub?.bankSlipUrl || createdSub?.payment?.bankSlipUrl || null,
        billingType: createdSub?.billingType || null,
        rawPayload: { ...createdSub, checkoutUrls: { successUrl, pendingUrl, cancelUrl } },
      },
    });

    await logPlatformAudit({
      tenantId: tenant.id,
      userId: null,
      entityType: 'checkout',
      entityId: subscription.id,
      action: 'billing.checkout_subscription_created',
      metadata: { providerSubscriptionId: createdSub.id, planSlug: plan.slug },
    });
    await logPlatformAudit({
      tenantId: tenant.id,
      userId: null,
      entityType: 'checkout',
      entityId: subscription.id,
      action: 'billing.checkout_access_pending',
      metadata: { planSlug: plan.slug },
    });

    const checkoutUrl = createdSub?.invoiceUrl || createdSub?.bankSlipUrl || createdSub?.payment?.invoiceUrl || createdSub?.checkoutUrl;
    if (!checkoutUrl) {
      throw new Error('Asaas checkout URL missing');
    }

    return json({ ok: true, checkoutUrl, status: 'pending_payment' }, undefined, origin);
  } catch (error) {
    console.error('[public-checkout]', {
      event: 'checkout_failed',
      planSlug: plan.slug,
      tenantId: tenant.id,
      code: error instanceof AsaasConfigError ? error.code : 'CHECKOUT_PROVIDER_ERROR',
      message: error instanceof AsaasConfigError ? error.message : 'Falha controlada ao iniciar cobrança Asaas.',
    });
    await logPlatformAudit({
      tenantId: tenant.id,
      userId: null,
      entityType: 'checkout',
      entityId: email,
      action: 'billing.checkout_failed',
      metadata: { planSlug: plan.slug },
    });
    return json({ ok: false, error: 'Não foi possível iniciar o pagamento. Tente novamente.' }, { status: 502 }, origin);
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createCustomer, createSubscription } from '@/lib/asaas';
import { getClientIp, rateLimit, rateLimitResponse } from '@/lib/rate-limit';
import { logPlatformAudit } from '@/lib/platform-audit';

function slugify(input: string) {
  return input.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const rl = rateLimit({ key: `public-checkout:ip:${ip}`, limit: 20, windowMs: 10 * 60 * 1000 });
  if (!rl.allowed) return rateLimitResponse(rl);

  const body = await req.json().catch(() => ({} as any));
  const planSlug = String(body?.planSlug || '').trim().toLowerCase();
  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const phone = String(body?.phone || '').trim();
  const cpfCnpj = String(body?.cpfCnpj || '').trim();
  const companyName = String(body?.companyName || '').trim() || name;

  if (!planSlug || !name || !email) return NextResponse.json({ error: 'Dados inválidos.', code: 'INVALID_INPUT' }, { status: 400 });

  const plan = await prisma.plan.findFirst({ where: { slug: planSlug, isActive: true }, select: { id: true, slug: true, name: true, price: true } });
  if (!plan) return NextResponse.json({ error: 'Plano inválido ou indisponível.', code: 'INVALID_PLAN' }, { status: 400 });
  if (plan.slug === 'enterprise') return NextResponse.json({ error: 'Plano Enterprise é sob consulta.', code: 'ENTERPRISE_CONTACT_REQUIRED' }, { status: 400 });
  if (!['starter', 'growth', 'pro'].includes(plan.slug)) return NextResponse.json({ error: 'Plano inválido ou indisponível.', code: 'INVALID_PLAN' }, { status: 400 });

  let tenant = await prisma.tenant.findFirst({ where: { allowedUsers: { some: { email } } }, select: { id: true, name: true } });
  if (!tenant) {
    const slugBase = slugify(companyName || name) || `tenant-${Date.now()}`;
    tenant = await prisma.tenant.create({ data: { name: companyName, slug: `${slugBase}-${Date.now().toString().slice(-6)}`, status: 'past_due' }, select: { id: true, name: true } });
    await prisma.allowedUser.create({ data: { email, tenantId: tenant.id, role: 'owner', active: false, status: 'pending', source: 'checkout_public' } });
  }

  await logPlatformAudit({ tenantId: tenant.id, userId: null, entityType: 'checkout', entityId: email, action: 'checkout.started', metadata: { planSlug } });

  try {
    const latest = await prisma.subscription.findFirst({ where: { tenantId: tenant.id }, orderBy: { createdAt: 'desc' } });
    let providerCustomerId = latest?.providerCustomerId || null;

    if (!providerCustomerId) {
      const customer = await createCustomer({ name, email, phone: phone || undefined, cpfCnpj: cpfCnpj || undefined, externalReference: tenant.id });
      providerCustomerId = customer.id;
      await logPlatformAudit({ tenantId: tenant.id, userId: null, entityType: 'checkout', entityId: tenant.id, action: 'checkout.customer_created', metadata: { providerCustomerId } });
    }

    const createdSub = await createSubscription({ customer: providerCustomerId, billingType: 'UNDEFINED', value: Number(plan.price), cycle: 'MONTHLY', nextDueDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10), externalReference: tenant.id });

    const subscription = await prisma.subscription.create({ data: { tenantId: tenant.id, planId: plan.id, provider: 'asaas', paymentProvider: 'asaas', providerCustomerId, providerSubscriptionId: createdSub.id, status: 'past_due', paymentRequired: true, nextDueDate: createdSub.nextDueDate ? new Date(createdSub.nextDueDate) : null } });

    await prisma.payment.create({ data: { tenantId: tenant.id, subscriptionId: subscription.id, provider: 'asaas', providerPaymentId: createdSub?.payment?.id || null, status: 'pending', value: plan.price, dueDate: createdSub.nextDueDate ? new Date(createdSub.nextDueDate) : null, invoiceUrl: createdSub?.invoiceUrl || createdSub?.payment?.invoiceUrl || null, bankSlipUrl: createdSub?.bankSlipUrl || createdSub?.payment?.bankSlipUrl || null, billingType: createdSub?.billingType || null, rawPayload: createdSub } });

    await logPlatformAudit({ tenantId: tenant.id, userId: null, entityType: 'checkout', entityId: subscription.id, action: 'checkout.subscription_created', metadata: { providerSubscriptionId: createdSub.id } });

    const checkoutUrl = createdSub?.invoiceUrl || createdSub?.bankSlipUrl || createdSub?.checkoutUrl || '/checkout/pending';
    return NextResponse.json({ ok: true, checkoutUrl, tenantId: tenant.id, subscriptionId: subscription.id });
  } catch {
    await logPlatformAudit({ tenantId: tenant.id, userId: null, entityType: 'checkout', entityId: email, action: 'checkout.failed', metadata: { planSlug } });
    return NextResponse.json({ error: 'Não foi possível iniciar o pagamento. Tente novamente.', code: 'CHECKOUT_PROVIDER_FAILED' }, { status: 502 });
  }
}

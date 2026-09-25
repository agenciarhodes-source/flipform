import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getLeadScopeForRole } from '@/lib/rbac';
import { isValidDateOnly, todayDateOnly } from '@/lib/date-only';

const paymentLabels: Record<string, string> = {
  pix: 'Pix',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  cash: 'Dinheiro',
  boleto: 'Boleto',
  bank_transfer: 'Transferência bancária',
  other: 'Outro',
};

function subtractCalendarDays(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function purchaseDateRange(period: '7d' | '30d' | 'custom' | 'year', startDate?: string | null, endDate?: string | null) {
  let start: string;
  let end: string;

  if (period === 'custom') {
    if (!startDate || !endDate || !isValidDateOnly(startDate) || !isValidDateOnly(endDate)) {
      return { ok: false as const, error: 'Informe uma data inicial e final válidas.' };
    }
    if (startDate > endDate) return { ok: false as const, error: 'A data final deve ser maior ou igual à data inicial.' };
    start = startDate;
    end = endDate;
  } else {
    end = todayDateOnly();
    start = period === 'year'
      ? `${end.slice(0, 4)}-01-01`
      : subtractCalendarDays(end, period === '7d' ? 6 : 29);
  }

  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  return {
    ok: true as const,
    startDate: start,
    endDate: end,
    start: new Date(Date.UTC(startYear, startMonth - 1, startDay, 0, 0, 0, 0)),
    end: new Date(Date.UTC(endYear, endMonth - 1, endDay, 23, 59, 59, 999)),
  };
}

export const GET = withPermission('LEADS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get('sort') === 'amount' ? 'amount' : 'purchases';
  const search = searchParams.get('q')?.trim();
  const periodParam = searchParams.get('period') || '30d';
  if (!['7d', '30d', 'custom', 'year'].includes(periodParam)) {
    return NextResponse.json({ error: 'Período inválido.' }, { status: 400 });
  }
  const period = periodParam as '7d' | '30d' | 'custom' | 'year';
  const range = purchaseDateRange(period, searchParams.get('startDate'), searchParams.get('endDate'));
  if (!range.ok) return NextResponse.json({ error: range.error }, { status: 400 });

  const leadScope = getLeadScopeForRole(session);
  const purchases = await prisma.leadPurchase.findMany({
    where: {
      tenantId: session.tenantId,
      purchaseDate: { gte: range.start, lte: range.end },
      lead: {
        tenantId: session.tenantId,
        ...leadScope,
        ...(search ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { phone: { contains: search } },
          ],
        } : {}),
      },
    },
    select: {
      id: true,
      leadId: true,
      amountCents: true,
      currency: true,
      purchaseDate: true,
      orderNumber: true,
      paymentMethod: true,
      notes: true,
      createdAt: true,
      lead: {
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          assignedUser: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ purchaseDate: 'desc' }, { createdAt: 'desc' }],
  });

  type Customer = {
    leadId: string;
    name: string;
    email: string | null;
    phone: string | null;
    assignedUser: { id: string; name: string } | null;
    purchaseCount: number;
    totalAmountCents: number;
    averageTicketCents: number;
    preferredPaymentMethod: string | null;
    preferredPaymentLabel: string;
    firstPurchaseAt: string | null;
    lastPurchaseAt: string | null;
    customerType: 'new_customer' | 'recurring_customer';
    purchases: Array<{
      id: string;
      amountCents: number;
      currency: string;
      purchaseDate: string;
      orderNumber: string | null;
      paymentMethod: string | null;
      paymentLabel: string;
      notes: string | null;
    }>;
    paymentCounts: Map<string, number>;
  };

  const byLead = new Map<string, Customer>();

  for (const purchase of purchases) {
    let customer = byLead.get(purchase.leadId);
    if (!customer) {
      customer = {
        leadId: purchase.lead.id,
        name: purchase.lead.name,
        email: purchase.lead.email,
        phone: purchase.lead.phone,
        assignedUser: purchase.lead.assignedUser,
        purchaseCount: 0,
        totalAmountCents: 0,
        averageTicketCents: 0,
        preferredPaymentMethod: null,
        preferredPaymentLabel: 'Não informado',
        firstPurchaseAt: purchase.purchaseDate.toISOString(),
        lastPurchaseAt: purchase.purchaseDate.toISOString(),
        customerType: 'new_customer',
        purchases: [],
        paymentCounts: new Map<string, number>(),
      };
      byLead.set(purchase.leadId, customer);
    }

    customer.purchaseCount += 1;
    customer.totalAmountCents += purchase.amountCents;
    customer.firstPurchaseAt = purchase.purchaseDate.toISOString();
    customer.purchases.push({
      id: purchase.id,
      amountCents: purchase.amountCents,
      currency: purchase.currency,
      purchaseDate: purchase.purchaseDate.toISOString(),
      orderNumber: purchase.orderNumber,
      paymentMethod: purchase.paymentMethod,
      paymentLabel: purchase.paymentMethod ? paymentLabels[purchase.paymentMethod] || purchase.paymentMethod : 'Não informado',
      notes: purchase.notes,
    });

    if (purchase.paymentMethod) {
      const nextCount = (customer.paymentCounts.get(purchase.paymentMethod) || 0) + 1;
      customer.paymentCounts.set(purchase.paymentMethod, nextCount);
      const preferredCount = customer.preferredPaymentMethod
        ? customer.paymentCounts.get(customer.preferredPaymentMethod) || 0
        : 0;
      // Purchases are loaded newest first, so ties keep the most recently used method.
      if (!customer.preferredPaymentMethod || nextCount > preferredCount) {
        customer.preferredPaymentMethod = purchase.paymentMethod;
        customer.preferredPaymentLabel = paymentLabels[purchase.paymentMethod] || purchase.paymentMethod;
      }
    }
  }

  const customers = Array.from(byLead.values()).map((customer) => {
    customer.averageTicketCents = customer.purchaseCount
      ? Math.round(customer.totalAmountCents / customer.purchaseCount)
      : 0;
    customer.customerType = customer.purchaseCount > 1 ? 'recurring_customer' : 'new_customer';
    const { paymentCounts, ...publicCustomer } = customer;
    return publicCustomer;
  });

  customers.sort((a, b) => {
    if (sort === 'amount') {
      return b.totalAmountCents - a.totalAmountCents
        || b.purchaseCount - a.purchaseCount
        || a.name.localeCompare(b.name, 'pt-BR');
    }
    return b.purchaseCount - a.purchaseCount
      || b.totalAmountCents - a.totalAmountCents
      || a.name.localeCompare(b.name, 'pt-BR');
  });

  const totalRevenueCents = purchases.reduce((sum, purchase) => sum + purchase.amountCents, 0);
  const recurringCustomers = customers.filter((customer) => customer.customerType === 'recurring_customer').length;

  return NextResponse.json({
    sort,
    period,
    startDate: range.startDate,
    endDate: range.endDate,
    summary: {
      totalCustomers: customers.length,
      recurringCustomers,
      repurchaseRate: customers.length ? Math.round((recurringCustomers / customers.length) * 1000) / 10 : 0,
      totalPurchases: purchases.length,
      totalRevenueCents,
      averageTicketCents: purchases.length ? Math.round(totalRevenueCents / purchases.length) : 0,
      averageLtvCents: customers.length ? Math.round(totalRevenueCents / customers.length) : 0,
    },
    customers,
  });
});

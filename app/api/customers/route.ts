import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withPermission } from '@/lib/rbac-server';
import { getLeadScopeForRole } from '@/lib/rbac';

const paymentLabels: Record<string, string> = {
  pix: 'Pix',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  cash: 'Dinheiro',
  boleto: 'Boleto',
  bank_transfer: 'Transferência bancária',
  other: 'Outro',
};

export const GET = withPermission('LEADS_VIEW', async (req, session) => {
  const { searchParams } = new URL(req.url);
  const sort = searchParams.get('sort') === 'amount' ? 'amount' : 'purchases';
  const search = searchParams.get('q')?.trim();

  const leadScope = getLeadScopeForRole(session);
  const purchases = await prisma.leadPurchase.findMany({
    where: {
      tenantId: session.tenantId,
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
    lastPurchaseAt: string | null;
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
        lastPurchaseAt: purchase.purchaseDate.toISOString(),
        purchases: [],
        paymentCounts: new Map<string, number>(),
      };
      byLead.set(purchase.leadId, customer);
    }

    customer.purchaseCount += 1;
    customer.totalAmountCents += purchase.amountCents;
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

  return NextResponse.json({
    sort,
    summary: {
      totalCustomers: customers.length,
      totalPurchases: purchases.length,
      totalRevenueCents,
      averageTicketCents: purchases.length ? Math.round(totalRevenueCents / purchases.length) : 0,
    },
    customers,
  });
});

import 'server-only';
import { prisma } from '@/lib/prisma';
import type { MetaCapiPayload } from './meta-capi';

type BasicLead = {
  email?: string | null;
  phone?: string | null;
  name?: string | null;
};

type MetaLeadRecord = BasicLead & {
  id: string;
  city: string | null;
  state: string | null;
  attribution: {
    fbc: string | null;
    fbp: string | null;
    clientIp: string | null;
    clientUserAgent: string | null;
    landingPage: string | null;
  } | null;
};

type LeadReader = {
  lead: {
    findFirst(args: any): Promise<MetaLeadRecord | null>;
  };
};

export function splitLeadName(name: string | null | undefined): { firstName: string | null; lastName: string | null } {
  const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
  return {
    firstName: parts[0] ?? null,
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : null,
  };
}

export function buildMetaExternalId(tenantId: string, leadId: string): string {
  return `${tenantId}:${leadId}`;
}

export type MetaLeadUserData = {
  user: NonNullable<MetaCapiPayload['user']>;
  landingPage: string | null;
};

export async function getMetaLeadUserData(params: {
  tenantId: string;
  leadId?: string | null;
  fallbackLead?: BasicLead | null;
  db?: LeadReader;
}): Promise<MetaLeadUserData> {
  if (!params.leadId) {
    const names = splitLeadName(params.fallbackLead?.name);
    return { user: { ...params.fallbackLead, ...names }, landingPage: null };
  }

  const db: LeadReader = params.db ?? prisma;
  const lead = await db.lead.findFirst({
    where: { id: params.leadId, tenantId: params.tenantId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      city: true,
      state: true,
      attribution: {
        select: { fbc: true, fbp: true, clientIp: true, clientUserAgent: true, landingPage: true },
      },
    },
  });

  // A scoped miss must not fall back to caller data: the id may belong to another tenant.
  if (!lead) return { user: {}, landingPage: null };

  const names = splitLeadName(lead.name);
  return {
    user: {
      email: lead.email,
      phone: lead.phone,
      ...names,
      city: lead.city,
      state: lead.state,
      externalId: buildMetaExternalId(params.tenantId, lead.id),
      fbc: lead.attribution?.fbc,
      fbp: lead.attribution?.fbp,
      clientIpAddress: lead.attribution?.clientIp,
      clientUserAgent: lead.attribution?.clientUserAgent,
    },
    landingPage: lead.attribution?.landingPage ?? null,
  };
}

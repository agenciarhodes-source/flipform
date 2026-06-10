import { prisma } from '@/lib/prisma';
import { withPlatformAdmin } from '@/lib/auth';
import { adminOk, adminError } from '@/lib/api/admin-response';

type PlanWithCount = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  price: unknown;
  billingCycle: string;
  maxUsers: number;
  maxForms: number;
  maxPipelines: number;
  maxLeadsPerMonth: number;
  canUseReports: boolean;
  canExportCsv: boolean;
  canUseCustomBranding: boolean;
  canUseMetaPixel: boolean;
  canUseWebhooks: boolean;
  canUseTasks: boolean;
  isActive: boolean;
  _count: { tenants: number; subscriptions: number };
};

export const GET = withPlatformAdmin(async () => {
  try {
    const plans = await prisma.plan.findMany({
      orderBy: { price: 'asc' },
      include: { _count: { select: { tenants: true, subscriptions: true } } },
    });

    return adminOk({
      plans: (plans as PlanWithCount[]).map((p) => ({
        id: p.id,
        name: p.name,
        slug: p.slug,
        description: p.description,
        price: Number(p.price),
        billingCycle: p.billingCycle,
        maxUsers: p.maxUsers,
        maxForms: p.maxForms,
        maxPipelines: p.maxPipelines,
        maxLeadsPerMonth: p.maxLeadsPerMonth,
        canUseReports: p.canUseReports,
        canExportCsv: p.canExportCsv,
        canUseCustomBranding: p.canUseCustomBranding,
        canUseMetaPixel: p.canUseMetaPixel,
        canUseWebhooks: p.canUseWebhooks,
        canUseTasks: p.canUseTasks,
        isActive: p.isActive,
        tenantsCount: p._count.tenants,
        subscriptionsCount: p._count.subscriptions,
      })),
    });
  } catch (error: unknown) {
    const err = error instanceof Error ? error : new Error(String(error));
    console.error('[admin/plans][GET]', {
      message: err.message,
      stack: err.stack,
      code: (error as { code?: string })?.code,
    });
    return adminError('Falha ao carregar planos.', 500, {
      code: 'ADMIN_PLANS_LOAD_FAILED',
      prismaCode: (error as { code?: string })?.code,
    });
  }
});

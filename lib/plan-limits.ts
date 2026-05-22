import { prisma } from './prisma';

export async function validateTenantWithinPlanLimits(tenantId: string, targetPlan: { maxUsers: number; maxForms: number; maxPipelines: number; maxLeadsPerMonth: number }) {
  const monthStart = new Date();
  monthStart.setDate(1); monthStart.setHours(0,0,0,0);

  const [users, forms, pipelines, leads] = await Promise.all([
    prisma.tenantUser.count({ where: { tenantId, status: 'active' } }),
    prisma.form.count({ where: { tenantId, isActive: true } }),
    prisma.pipeline.count({ where: { tenantId, isArchived: false } }),
    prisma.lead.count({ where: { tenantId, createdAt: { gte: monthStart } } }),
  ]);

  const violations: Array<{ resource: string; current: number; limit: number }> = [];
  if (targetPlan.maxUsers > 0 && users > targetPlan.maxUsers) violations.push({ resource: 'users', current: users, limit: targetPlan.maxUsers });
  if (targetPlan.maxForms > 0 && forms > targetPlan.maxForms) violations.push({ resource: 'forms', current: forms, limit: targetPlan.maxForms });
  if (targetPlan.maxPipelines > 0 && pipelines > targetPlan.maxPipelines) violations.push({ resource: 'pipelines', current: pipelines, limit: targetPlan.maxPipelines });
  if (targetPlan.maxLeadsPerMonth > 0 && leads > targetPlan.maxLeadsPerMonth) violations.push({ resource: 'leads', current: leads, limit: targetPlan.maxLeadsPerMonth });

  return { ok: violations.length === 0, violations };
}

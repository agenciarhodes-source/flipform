import { prisma } from '@/lib/prisma';
import { slugify } from '@/lib/utils';

export async function generateUniqueFormSlug(params: { tenantId: string; name: string; excludeSlug?: string; suffix?: string | number }) {
  const base = slugify(params.name) || 'formulario';
  const suffix = params.suffix == null ? '' : `-${params.suffix}`;
  const candidate = `${base}${suffix}`.slice(0, 80).replace(/-+$/g, '') || 'formulario';
  if (candidate !== params.excludeSlug) {
    const existing = await prisma.form.findFirst({ where: { tenantId: params.tenantId, slug: candidate }, select: { id: true } });
    if (!existing) return candidate;
  }
  for (let attempt = 2; attempt <= 50; attempt++) {
    const slug = `${base}-${attempt}`.slice(0, 80).replace(/-+$/g, '');
    if (slug === params.excludeSlug) continue;
    const existing = await prisma.form.findFirst({ where: { tenantId: params.tenantId, slug }, select: { id: true } });
    if (!existing) return slug;
  }
  const random = Math.random().toString(36).slice(2, 8);
  return `${base}-${random}`.slice(0, 80).replace(/-+$/g, '');
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword, setSessionCookie } from '@/lib/auth';
import { registerSchema } from '@/lib/schemas';
import { slugify } from '@/lib/utils';
import { Role } from '@prisma/client';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = registerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }
    const { companyName, name, email, password } = parsed.data;

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return NextResponse.json({ error: 'E-mail já cadastrado' }, { status: 409 });

    let slug = slugify(companyName);
    let attempt = 0;
    while (await prisma.tenant.findUnique({ where: { slug } })) {
      attempt++;
      slug = `${slugify(companyName)}-${attempt}`;
    }

    const passwordHash = await hashPassword(password);

    const result = await prisma.$transaction(async (tx) => {
      const tenant = await tx.tenant.create({
        data: { name: companyName, slug, primaryColor: '#2563EB', status: 'active' },
      });
      const user = await tx.user.create({ data: { name, email, passwordHash } });
      await tx.tenantUser.create({
        data: { tenantId: tenant.id, userId: user.id, role: Role.owner },
      });
      // Pipeline padrão
      const pipeline = await tx.pipeline.create({
        data: { tenantId: tenant.id, name: 'Funil de Vendas', isDefault: true },
      });
      const defaults = [
        { name: 'Novo lead', color: '#3B82F6' },
        { name: 'Primeiro contato', color: '#8B5CF6' },
        { name: 'Qualificado', color: '#06B6D4' },
        { name: 'Proposta enviada', color: '#F59E0B' },
        { name: 'Negociação', color: '#EC4899' },
        { name: 'Ganho', color: '#10B981' },
        { name: 'Perdido', color: '#EF4444' },
      ];
      for (let i = 0; i < defaults.length; i++) {
        await tx.pipelineStage.create({
          data: { pipelineId: pipeline.id, name: defaults[i].name, color: defaults[i].color, orderIndex: i },
        });
      }
      return { tenant, user };
    });

    await setSessionCookie({
      userId: result.user.id,
      tenantId: result.tenant.id,
      role: 'owner',
      email: result.user.email,
      name: result.user.name,
      tenantSlug: result.tenant.slug,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('register error', e);
    return NextResponse.json({ error: 'Erro ao registrar' }, { status: 500 });
  }
}

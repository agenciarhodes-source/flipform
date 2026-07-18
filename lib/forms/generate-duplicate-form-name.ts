import { prisma } from '@/lib/prisma';

export async function generateDuplicateFormName(tenantId: string, originalName: string) {
  const baseName = originalName.trim() || 'Formulário';
  const existing = await prisma.form.findMany({
    where: {
      tenantId,
      OR: [
        { name: `${baseName} (cópia)` },
        { name: { startsWith: `${baseName} (cópia ` } },
      ],
    },
    select: { name: true },
  });
  const used = new Set(existing.map((form) => form.name));
  if (!used.has(`${baseName} (cópia)`)) return `${baseName} (cópia)`;
  for (let copy = 2; copy <= 1000; copy++) {
    const name = `${baseName} (cópia ${copy})`;
    if (!used.has(name)) return name;
  }
  return `${baseName} (cópia ${Date.now().toString(36)})`;
}

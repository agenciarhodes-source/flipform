import 'server-only';

import { z } from 'zod';
import { FlipAiError } from './access';

const packageSchema = z.object({
  id: z.string().trim().min(2).max(60).regex(/^[a-z0-9][a-z0-9_-]*$/),
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().max(180).optional().default(''),
  credits: z.number().int().positive().max(2_000_000_000),
  amountCents: z.number().int().positive().max(100_000_000),
  estimatedOpenAiCostCents: z.number().int().nonnegative().max(100_000_000).optional().default(0),
  active: z.boolean().optional().default(true),
  sortOrder: z.number().int().min(-10_000).max(10_000).optional().default(0),
}).strict();

const catalogSchema = z.array(packageSchema).max(20);

export type FlipAiCreditPackage = z.infer<typeof packageSchema>;
export type PublicFlipAiCreditPackage = Pick<
  FlipAiCreditPackage,
  'id' | 'name' | 'description' | 'credits' | 'amountCents'
>;

function parseCatalog(raw: string | undefined): FlipAiCreditPackage[] {
  const source = String(raw || '').trim();
  if (!source) return [];

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(source);
  } catch {
    throw new FlipAiError(
      'FLIP_AI_CREDIT_PACKAGES_INVALID',
      503,
      'O catálogo de créditos Flip AI está com configuração inválida.',
    );
  }

  const parsed = catalogSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new FlipAiError(
      'FLIP_AI_CREDIT_PACKAGES_INVALID',
      503,
      'O catálogo de créditos Flip AI está com configuração inválida.',
    );
  }

  const ids = new Set<string>();
  for (const item of parsed.data) {
    if (ids.has(item.id)) {
      throw new FlipAiError(
        'FLIP_AI_CREDIT_PACKAGES_INVALID',
        503,
        'O catálogo de créditos Flip AI contém identificadores duplicados.',
      );
    }
    ids.add(item.id);
  }

  return parsed.data
    .filter((item) => item.active)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.amountCents - right.amountCents);
}

export function getFlipAiCreditPackages(
  env: NodeJS.ProcessEnv = process.env,
): FlipAiCreditPackage[] {
  return parseCatalog(env.FLIP_AI_CREDIT_PACKAGES_JSON);
}

export function getPublicFlipAiCreditPackages(
  env: NodeJS.ProcessEnv = process.env,
): PublicFlipAiCreditPackage[] {
  return getFlipAiCreditPackages(env).map((item) => ({
    id: item.id,
    name: item.name,
    description: item.description,
    credits: item.credits,
    amountCents: item.amountCents,
  }));
}

export function requireFlipAiCreditPackage(
  packageId: string,
  env: NodeJS.ProcessEnv = process.env,
): FlipAiCreditPackage {
  const normalized = String(packageId || '').trim();
  const item = getFlipAiCreditPackages(env).find((candidate) => candidate.id === normalized);
  if (!item) {
    throw new FlipAiError(
      'FLIP_AI_CREDIT_PACKAGE_NOT_FOUND',
      404,
      'Este pacote de créditos não está disponível.',
    );
  }
  return item;
}

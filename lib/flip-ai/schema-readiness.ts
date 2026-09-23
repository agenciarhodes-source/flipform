import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  FLIP_AI_REQUIRED_COLUMN_SPECS,
  FLIP_AI_REQUIRED_CONSTRAINTS,
  FLIP_AI_REQUIRED_INDEXES,
  FLIP_AI_REQUIRED_TABLES,
} from './schema-contract';

export { FLIP_AI_REQUIRED_TABLES } from './schema-contract';

type ReadinessRow = {
  missingTables: string[];
  missingIndexes: string[];
  missingConstraints: string[];
  missingColumns: string[];
  incompatibleColumns: string[];
  vectorReady: boolean;
  premiumPlanCount: bigint | number | string;
  configuredPremiumPlanCount: bigint | number | string;
  activePremiumPlanCount: bigint | number | string;
};

export type FlipAiSchemaReadiness = {
  ready: boolean;
  schemaReady: boolean;
  catalogReady: boolean;
  missingTables: string[];
  missingIndexes: string[];
  missingConstraints: string[];
  missingColumns: string[];
  incompatibleColumns: string[];
  vectorReady: boolean;
  premiumPlanCount: number;
  configuredPremiumPlanCount: number;
  activePremiumPlanCount: number;
};

function safeCount(value: bigint | number | string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function inspectFlipAiSchema(): Promise<FlipAiSchemaReadiness> {
  const tableValues = Prisma.join(FLIP_AI_REQUIRED_TABLES.map((table) => Prisma.sql`(${table})`));
  const indexValues = Prisma.join(FLIP_AI_REQUIRED_INDEXES.map((index) => Prisma.sql`(${index})`));
  const constraintValues = Prisma.join(FLIP_AI_REQUIRED_CONSTRAINTS.map((constraint) =>
    Prisma.sql`(${constraint})`));
  const columnValues = Prisma.join(FLIP_AI_REQUIRED_COLUMN_SPECS.map(([table, column, type]) =>
    Prisma.sql`(${table}, ${column}, ${type})`));

  const rows = await prisma.$queryRaw<ReadinessRow[]>(Prisma.sql`
    WITH required_tables(table_name) AS (VALUES ${tableValues}),
    required_indexes(index_name) AS (VALUES ${indexValues}),
    required_constraints(constraint_name) AS (VALUES ${constraintValues}),
    required_columns(table_name, column_name, expected_udt_name) AS (VALUES ${columnValues})
    SELECT
      ARRAY(
        SELECT table_name
        FROM required_tables
        WHERE to_regclass(format('public.%I', table_name)) IS NULL
        ORDER BY table_name
      ) AS "missingTables",
      ARRAY(
        SELECT index_name
        FROM required_indexes
        WHERE to_regclass(format('public.%I', index_name)) IS NULL
        ORDER BY index_name
      ) AS "missingIndexes",
      ARRAY(
        SELECT constraint_name
        FROM required_constraints
        WHERE NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE connamespace = 'public'::regnamespace
            AND conname = required_constraints.constraint_name
        )
        ORDER BY constraint_name
      ) AS "missingConstraints",
      ARRAY(
        SELECT required_columns.table_name || '.' || required_columns.column_name
        FROM required_columns
        WHERE NOT EXISTS (
          SELECT 1
          FROM information_schema.columns
          WHERE table_schema = 'public'
            AND table_name = required_columns.table_name
            AND column_name = required_columns.column_name
        )
        ORDER BY required_columns.table_name, required_columns.column_name
      ) AS "missingColumns",
      ARRAY(
        SELECT columns.table_name || '.' || columns.column_name || ':' || columns.udt_name
        FROM information_schema.columns AS columns
        JOIN required_columns
          ON required_columns.table_name = columns.table_name
          AND required_columns.column_name = columns.column_name
        WHERE columns.table_schema = 'public'
          AND columns.udt_name <> required_columns.expected_udt_name
        ORDER BY columns.table_name, columns.column_name
      ) AS "incompatibleColumns",
      EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) AS "vectorReady",
      (
        SELECT COUNT(*) FROM plans WHERE slug IN ('premium', 'premium-pro')
      ) AS "premiumPlanCount",
      (
        SELECT COUNT(*) FROM plans
        WHERE billing_cycle = 'monthly'
          AND (
            (slug = 'premium' AND price = 797.00)
            OR (slug = 'premium-pro' AND price = 1497.00)
          )
      ) AS "configuredPremiumPlanCount",
      (
        SELECT COUNT(*) FROM plans
        WHERE slug IN ('premium', 'premium-pro') AND is_active = TRUE
      ) AS "activePremiumPlanCount"
  `);
  const row = rows[0];
  if (!row) throw new Error('FLIP_AI_SCHEMA_DIAGNOSTIC_EMPTY');

  const premiumPlanCount = safeCount(row.premiumPlanCount);
  const configuredPremiumPlanCount = safeCount(row.configuredPremiumPlanCount);
  const activePremiumPlanCount = safeCount(row.activePremiumPlanCount);
  const schemaReady = row.missingTables.length === 0
    && row.missingIndexes.length === 0
    && row.missingConstraints.length === 0
    && row.missingColumns.length === 0
    && row.incompatibleColumns.length === 0
    && row.vectorReady;
  const catalogReady = premiumPlanCount === 2
    && configuredPremiumPlanCount === 2
    && activePremiumPlanCount === 0;

  return {
    ready: schemaReady && catalogReady,
    schemaReady,
    catalogReady,
    missingTables: row.missingTables,
    missingIndexes: row.missingIndexes,
    missingConstraints: row.missingConstraints,
    missingColumns: row.missingColumns,
    incompatibleColumns: row.incompatibleColumns,
    vectorReady: row.vectorReady,
    premiumPlanCount,
    configuredPremiumPlanCount,
    activePremiumPlanCount,
  };
}

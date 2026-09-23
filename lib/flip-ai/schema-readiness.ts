import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  canonicalizeFlipAiCheckDefinition,
  FLIP_AI_REQUIRED_COLUMN_SPECS,
  FLIP_AI_REQUIRED_CONSTRAINT_SPECS,
  FLIP_AI_REQUIRED_INDEX_SPECS,
  FLIP_AI_REQUIRED_TABLES,
} from './schema-contract';

export { FLIP_AI_REQUIRED_TABLES } from './schema-contract';

type ReadinessRow = {
  missingTables: string[];
  missingColumns: string[];
  incompatibleColumns: string[];
  vectorReady: boolean;
  premiumPlanCount: bigint | number | string;
  configuredPremiumPlanCount: bigint | number | string;
  activePremiumPlanCount: bigint | number | string;
};

type IndexRow = {
  tableName: string;
  indexName: string;
  unique: boolean;
  nullsNotDistinct: boolean;
  primary: boolean;
  exclusion: boolean;
  immediate: boolean;
  valid: boolean;
  ready: boolean;
  live: boolean;
  method: string;
  columns: string[];
  opclasses: string[];
  keyAttributeCount: number;
  totalAttributeCount: number;
  hasExpressions: boolean;
  hasPredicate: boolean;
};

type ConstraintRow = {
  tableName: string;
  constraintName: string;
  type: string;
  columns: string[];
  referencedSchema: string | null;
  referencedTable: string | null;
  referencedColumns: string[];
  updateAction: string;
  deleteAction: string;
  matchType: string;
  validated: boolean;
  deferrable: boolean;
  deferred: boolean;
  local: boolean;
  inheritanceCount: number;
  definition: string;
};

export type FlipAiSchemaReadiness = {
  ready: boolean;
  schemaReady: boolean;
  catalogReady: boolean;
  missingTables: string[];
  missingIndexes: string[];
  incompatibleIndexes: string[];
  missingConstraints: string[];
  incompatibleConstraints: string[];
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

function sameStrings(actual: readonly string[], expected: readonly string[]) {
  return actual.length === expected.length
    && actual.every((value, index) => value === expected[index]);
}

export async function inspectFlipAiSchema(): Promise<FlipAiSchemaReadiness> {
  const tableValues = Prisma.join(FLIP_AI_REQUIRED_TABLES.map((table) => Prisma.sql`(${table})`));
  const columnValues = Prisma.join(FLIP_AI_REQUIRED_COLUMN_SPECS
    .map(([table, column, type, notNull]) => Prisma.sql`(${table}, ${column}, ${type}, ${notNull})`));
  const indexNames = Prisma.join(FLIP_AI_REQUIRED_INDEX_SPECS.map(({ indexName }) => indexName));
  const constraintNames = Prisma.join(FLIP_AI_REQUIRED_CONSTRAINT_SPECS
    .map(({ constraintName }) => constraintName));

  const [rows, indexes, constraints] = await Promise.all([
    prisma.$queryRaw<ReadinessRow[]>(Prisma.sql`
      WITH required_tables(table_name) AS (VALUES ${tableValues}),
      required_columns(table_name, column_name, expected_type, expected_not_null) AS (
        VALUES ${columnValues}
      ),
      actual_columns AS (
        SELECT tables.relname::text AS table_name,
          attributes.attname::text AS column_name,
          pg_catalog.format_type(attributes.atttypid, attributes.atttypmod) AS postgres_type,
          attributes.attnotnull AS not_null
        FROM pg_catalog.pg_attribute AS attributes
        JOIN pg_catalog.pg_class AS tables ON tables.oid = attributes.attrelid
        JOIN pg_catalog.pg_namespace AS namespaces ON namespaces.oid = tables.relnamespace
        WHERE namespaces.nspname = 'public'
          AND attributes.attnum > 0
          AND NOT attributes.attisdropped
      )
      SELECT
        ARRAY(
          SELECT table_name
          FROM required_tables
          WHERE to_regclass(format('public.%I', table_name)) IS NULL
          ORDER BY table_name
        ) AS "missingTables",
        ARRAY(
          SELECT required_columns.table_name || '.' || required_columns.column_name
          FROM required_columns
          WHERE NOT EXISTS (
            SELECT 1
            FROM actual_columns
            WHERE table_name = required_columns.table_name
              AND column_name = required_columns.column_name
          )
          ORDER BY required_columns.table_name, required_columns.column_name
        ) AS "missingColumns",
        ARRAY(
          SELECT columns.table_name || '.' || columns.column_name || ':' || columns.postgres_type
            || CASE WHEN columns.not_null THEN ':not-null' ELSE ':nullable' END
          FROM actual_columns AS columns
          JOIN required_columns
            ON required_columns.table_name = columns.table_name
            AND required_columns.column_name = columns.column_name
          WHERE columns.postgres_type <> required_columns.expected_type
            OR columns.not_null <> required_columns.expected_not_null
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
    `),
    prisma.$queryRaw<IndexRow[]>(Prisma.sql`
      SELECT tables.relname::text AS "tableName",
        index_relations.relname::text AS "indexName",
        index_metadata.indisunique AS "unique",
        index_metadata.indnullsnotdistinct AS "nullsNotDistinct",
        index_metadata.indisprimary AS "primary",
        index_metadata.indisexclusion AS "exclusion",
        index_metadata.indimmediate AS "immediate",
        index_metadata.indisvalid AS "valid",
        index_metadata.indisready AS "ready",
        index_metadata.indislive AS "live",
        access_methods.amname::text AS "method",
        ARRAY(
          SELECT attributes.attname::text
          FROM unnest(index_metadata.indkey::smallint[]) WITH ORDINALITY
            AS keys(attribute_number, ordinal)
          JOIN pg_catalog.pg_attribute AS attributes
            ON attributes.attrelid = tables.oid
            AND attributes.attnum = keys.attribute_number
          WHERE keys.ordinal <= index_metadata.indnkeyatts
          ORDER BY keys.ordinal
        ) AS "columns",
        ARRAY(
          SELECT operator_classes.opcname::text
          FROM unnest(index_metadata.indclass::oid[]) WITH ORDINALITY
            AS classes(operator_class_id, ordinal)
          JOIN pg_catalog.pg_opclass AS operator_classes
            ON operator_classes.oid = classes.operator_class_id
          WHERE classes.ordinal <= index_metadata.indnkeyatts
          ORDER BY classes.ordinal
        ) AS "opclasses",
        index_metadata.indnkeyatts AS "keyAttributeCount",
        index_metadata.indnatts AS "totalAttributeCount",
        index_metadata.indexprs IS NOT NULL AS "hasExpressions",
        index_metadata.indpred IS NOT NULL AS "hasPredicate"
      FROM pg_catalog.pg_index AS index_metadata
      JOIN pg_catalog.pg_class AS index_relations
        ON index_relations.oid = index_metadata.indexrelid
      JOIN pg_catalog.pg_class AS tables ON tables.oid = index_metadata.indrelid
      JOIN pg_catalog.pg_namespace AS namespaces ON namespaces.oid = index_relations.relnamespace
      JOIN pg_catalog.pg_am AS access_methods ON access_methods.oid = index_relations.relam
      WHERE namespaces.nspname = 'public'
        AND index_relations.relname IN (${indexNames})
    `),
    prisma.$queryRaw<ConstraintRow[]>(Prisma.sql`
      SELECT tables.relname::text AS "tableName",
        constraint_metadata.conname::text AS "constraintName",
        constraint_metadata.contype::text AS "type",
        ARRAY(
          SELECT attributes.attname::text
          FROM unnest(constraint_metadata.conkey) WITH ORDINALITY
            AS keys(attribute_number, ordinal)
          JOIN pg_catalog.pg_attribute AS attributes
            ON attributes.attrelid = tables.oid
            AND attributes.attnum = keys.attribute_number
          ORDER BY keys.ordinal
        ) AS "columns",
        referenced_namespaces.nspname::text AS "referencedSchema",
        referenced_tables.relname::text AS "referencedTable",
        ARRAY(
          SELECT attributes.attname::text
          FROM unnest(constraint_metadata.confkey) WITH ORDINALITY
            AS keys(attribute_number, ordinal)
          JOIN pg_catalog.pg_attribute AS attributes
            ON attributes.attrelid = referenced_tables.oid
            AND attributes.attnum = keys.attribute_number
          ORDER BY keys.ordinal
        ) AS "referencedColumns",
        constraint_metadata.confupdtype::text AS "updateAction",
        constraint_metadata.confdeltype::text AS "deleteAction",
        constraint_metadata.confmatchtype::text AS "matchType",
        constraint_metadata.convalidated AS "validated",
        constraint_metadata.condeferrable AS "deferrable",
        constraint_metadata.condeferred AS "deferred",
        constraint_metadata.conislocal AS "local",
        constraint_metadata.coninhcount AS "inheritanceCount",
        pg_catalog.pg_get_constraintdef(constraint_metadata.oid, TRUE) AS "definition"
      FROM pg_catalog.pg_constraint AS constraint_metadata
      JOIN pg_catalog.pg_class AS tables ON tables.oid = constraint_metadata.conrelid
      JOIN pg_catalog.pg_namespace AS namespaces ON namespaces.oid = tables.relnamespace
      LEFT JOIN pg_catalog.pg_class AS referenced_tables
        ON referenced_tables.oid = constraint_metadata.confrelid
      LEFT JOIN pg_catalog.pg_namespace AS referenced_namespaces
        ON referenced_namespaces.oid = referenced_tables.relnamespace
      WHERE namespaces.nspname = 'public'
        AND constraint_metadata.conname IN (${constraintNames})
    `),
  ]);
  const row = rows[0];
  if (!row) throw new Error('FLIP_AI_SCHEMA_DIAGNOSTIC_EMPTY');

  const indexByName = new Map(indexes.map((index) => [index.indexName, index]));
  const missingIndexes: string[] = [];
  const incompatibleIndexes: string[] = [];
  for (const expected of FLIP_AI_REQUIRED_INDEX_SPECS) {
    const actual = indexByName.get(expected.indexName);
    if (!actual) {
      missingIndexes.push(expected.indexName);
      continue;
    }
    if (actual.tableName !== expected.tableName
      || actual.unique !== expected.unique
      || actual.nullsNotDistinct !== expected.nullsNotDistinct
      || actual.primary
      || actual.exclusion
      || (actual.unique && !actual.immediate)
      || !actual.valid
      || !actual.ready
      || !actual.live
      || actual.method !== expected.method
      || !sameStrings(actual.columns, expected.columns)
      || !sameStrings(actual.opclasses, expected.opclasses)
      || actual.keyAttributeCount !== actual.totalAttributeCount
      || actual.hasExpressions
      || actual.hasPredicate) {
      incompatibleIndexes.push(expected.indexName);
    }
  }

  const constraintsByName = new Map<string, ConstraintRow[]>();
  for (const actual of constraints) {
    const matches = constraintsByName.get(actual.constraintName) || [];
    matches.push(actual);
    constraintsByName.set(actual.constraintName, matches);
  }
  const missingConstraints: string[] = [];
  const incompatibleConstraints: string[] = [];
  for (const expected of FLIP_AI_REQUIRED_CONSTRAINT_SPECS) {
    const named = constraintsByName.get(expected.constraintName) || [];
    const actual = named.find((candidate) => candidate.tableName === expected.tableName);
    if (!actual) {
      missingConstraints.push(expected.constraintName);
      if (named.length) incompatibleConstraints.push(expected.constraintName);
      continue;
    }
    const incompatible = actual.type !== expected.type
      || !sameStrings(actual.columns, expected.columns)
      || !actual.validated
      || actual.deferrable
      || actual.deferred
      || !actual.local
      || actual.inheritanceCount !== 0
      || (expected.type === 'f' && (
        actual.referencedSchema !== expected.referencedSchema
        || actual.referencedTable !== expected.referencedTable
        || !sameStrings(actual.referencedColumns, expected.referencedColumns)
        || actual.updateAction !== expected.updateAction
        || actual.deleteAction !== expected.deleteAction
        || actual.matchType !== expected.matchType
      ))
      || (expected.type === 'c'
        && canonicalizeFlipAiCheckDefinition(actual.definition) !== expected.checkSignature);
    if (incompatible) incompatibleConstraints.push(expected.constraintName);
  }

  missingIndexes.sort();
  incompatibleIndexes.sort();
  missingConstraints.sort();
  incompatibleConstraints.sort();

  const premiumPlanCount = safeCount(row.premiumPlanCount);
  const configuredPremiumPlanCount = safeCount(row.configuredPremiumPlanCount);
  const activePremiumPlanCount = safeCount(row.activePremiumPlanCount);
  const schemaReady = row.missingTables.length === 0
    && missingIndexes.length === 0
    && incompatibleIndexes.length === 0
    && missingConstraints.length === 0
    && incompatibleConstraints.length === 0
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
    missingIndexes,
    incompatibleIndexes,
    missingConstraints,
    incompatibleConstraints,
    missingColumns: row.missingColumns,
    incompatibleColumns: row.incompatibleColumns,
    vectorReady: row.vectorReady,
    premiumPlanCount,
    configuredPremiumPlanCount,
    activePremiumPlanCount,
  };
}

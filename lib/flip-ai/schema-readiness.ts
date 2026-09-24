import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  canonicalizeFlipAiDefaultDefinition,
  canonicalizeFlipAiCheckDefinition,
  FLIP_AI_REQUIRED_COLUMN_SPECS,
  FLIP_AI_REQUIRED_CONSTRAINT_SPECS,
  FLIP_AI_REQUIRED_INDEX_SPECS,
  FLIP_AI_REQUIRED_TABLES,
} from './schema-contract';

export { FLIP_AI_REQUIRED_TABLES } from './schema-contract';

type ReadinessRow = {
  missingTables: string[];
  incompatibleTables: string[];
  vectorReady: boolean;
  premiumPlanCount: bigint | number | string;
  configuredPremiumPlanCount: bigint | number | string;
  activePremiumPlanCount: bigint | number | string;
};

type ColumnRow = {
  tableName: string;
  columnName: string;
  postgresType: string;
  notNull: boolean;
  defaultDefinition: string | null;
  identity: string;
  generated: string;
  customCollation: boolean;
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
  collations: string[];
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
  incompatibleTables: string[];
  missingIndexes: string[];
  incompatibleIndexes: string[];
  unexpectedIndexes: string[];
  missingConstraints: string[];
  incompatibleConstraints: string[];
  unexpectedConstraints: string[];
  missingColumns: string[];
  incompatibleColumns: string[];
  unexpectedColumns: string[];
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
  const tableNames = Prisma.join(FLIP_AI_REQUIRED_TABLES);
  const indexNames = Prisma.join(FLIP_AI_REQUIRED_INDEX_SPECS.map(({ indexName }) => indexName));
  const [rows, columns, indexes, constraints] = await Promise.all([
    prisma.$queryRaw<ReadinessRow[]>(Prisma.sql`
      WITH required_tables(table_name) AS (VALUES ${tableValues})
      SELECT
        ARRAY(
          SELECT table_name
          FROM required_tables
          WHERE to_regclass(format('public.%I', table_name)) IS NULL
          ORDER BY table_name
        ) AS "missingTables",
        ARRAY(
          SELECT required_tables.table_name
          FROM required_tables
          JOIN pg_catalog.pg_class AS table_metadata
            ON table_metadata.oid = to_regclass(format('public.%I', required_tables.table_name))
          WHERE table_metadata.relkind <> 'r'
            OR table_metadata.relpersistence <> 'p'
            OR table_metadata.relrowsecurity
            OR table_metadata.relforcerowsecurity
          ORDER BY required_tables.table_name
        ) AS "incompatibleTables",
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
    prisma.$queryRaw<ColumnRow[]>(Prisma.sql`
      SELECT tables.relname::text AS "tableName",
        attributes.attname::text AS "columnName",
        pg_catalog.format_type(attributes.atttypid, attributes.atttypmod) AS "postgresType",
        attributes.attnotnull AS "notNull",
        pg_catalog.pg_get_expr(defaults.adbin, defaults.adrelid, TRUE) AS "defaultDefinition",
        attributes.attidentity::text AS "identity",
        attributes.attgenerated::text AS "generated",
        attributes.attcollation <> 0
          AND (
            collations.collname IS DISTINCT FROM 'default'
            OR collation_namespaces.nspname IS DISTINCT FROM 'pg_catalog'
          ) AS "customCollation"
      FROM pg_catalog.pg_attribute AS attributes
      JOIN pg_catalog.pg_class AS tables ON tables.oid = attributes.attrelid
      JOIN pg_catalog.pg_namespace AS namespaces ON namespaces.oid = tables.relnamespace
      LEFT JOIN pg_catalog.pg_collation AS collations
        ON collations.oid = attributes.attcollation
      LEFT JOIN pg_catalog.pg_namespace AS collation_namespaces
        ON collation_namespaces.oid = collations.collnamespace
      LEFT JOIN pg_catalog.pg_attrdef AS defaults
        ON defaults.adrelid = attributes.attrelid
        AND defaults.adnum = attributes.attnum
      WHERE namespaces.nspname = 'public'
        AND tables.relname IN (${tableNames})
        AND attributes.attnum > 0
        AND NOT attributes.attisdropped
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
        ARRAY(
          SELECT CASE
            WHEN keys.collation_id = 0 THEN ''
            ELSE collation_namespaces.nspname::text || '.' || collations.collname::text
          END
          FROM unnest(index_metadata.indcollation::oid[]) WITH ORDINALITY
            AS keys(collation_id, ordinal)
          LEFT JOIN pg_catalog.pg_collation AS collations
            ON collations.oid = keys.collation_id
          LEFT JOIN pg_catalog.pg_namespace AS collation_namespaces
            ON collation_namespaces.oid = collations.collnamespace
          WHERE keys.ordinal <= index_metadata.indnkeyatts
          ORDER BY keys.ordinal
        ) AS "collations",
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
        AND (
          index_relations.relname IN (${indexNames})
          OR (
            tables.relname IN (${tableNames})
            AND NOT EXISTS (
              SELECT 1
              FROM pg_catalog.pg_constraint AS index_constraints
              WHERE index_constraints.conindid = index_metadata.indexrelid
                AND index_constraints.conrelid = index_metadata.indrelid
                AND index_constraints.contype IN ('p', 'u', 'x')
            )
          )
        )
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
        AND tables.relname IN (${tableNames})
    `),
  ]);
  const row = rows[0];
  if (!row) throw new Error('FLIP_AI_SCHEMA_DIAGNOSTIC_EMPTY');

  const columnByKey = new Map(columns.map((column) =>
    [`${column.tableName}.${column.columnName}`, column]));
  const requiredColumnKeys = new Set(FLIP_AI_REQUIRED_COLUMN_SPECS
    .map(([tableName, columnName]) => `${tableName}.${columnName}`));
  const missingColumns: string[] = [];
  const incompatibleColumns: string[] = [];
  for (const [tableName, columnName, postgresType, notNull, expectedDefault] of
    FLIP_AI_REQUIRED_COLUMN_SPECS) {
    const key = `${tableName}.${columnName}`;
    const actual = columnByKey.get(key);
    if (!actual) {
      missingColumns.push(key);
      continue;
    }
    const actualDefault = actual.defaultDefinition === null
      ? null
      : canonicalizeFlipAiDefaultDefinition(actual.defaultDefinition);
    if (actual.postgresType !== postgresType
      || actual.notNull !== notNull
      || actualDefault !== expectedDefault
      || actual.identity !== ''
      || actual.generated !== ''
      || actual.customCollation) {
      incompatibleColumns.push(key);
    }
  }

  missingColumns.sort();
  incompatibleColumns.sort();
  const unexpectedColumns = [...columnByKey.keys()]
    .filter((key) => !requiredColumnKeys.has(key))
    .sort();

  const indexByName = new Map(indexes.map((index) => [index.indexName, index]));
  const requiredIndexNames = new Set(FLIP_AI_REQUIRED_INDEX_SPECS
    .map(({ indexName }) => indexName));
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
      || !sameStrings(actual.collations, expected.collations)
      || actual.keyAttributeCount !== actual.totalAttributeCount
      || actual.hasExpressions
      || actual.hasPredicate) {
      incompatibleIndexes.push(expected.indexName);
    }
  }
  const unexpectedIndexes = indexes
    .filter(({ tableName, indexName }) =>
      (FLIP_AI_REQUIRED_TABLES as readonly string[]).includes(tableName)
      && !requiredIndexNames.has(indexName))
    .map(({ indexName }) => indexName)
    .sort();

  const constraintsByName = new Map<string, ConstraintRow[]>();
  for (const actual of constraints) {
    const matches = constraintsByName.get(actual.constraintName) || [];
    matches.push(actual);
    constraintsByName.set(actual.constraintName, matches);
  }
  const missingConstraints: string[] = [];
  const incompatibleConstraints: string[] = [];
  const requiredConstraintKeys = new Set(FLIP_AI_REQUIRED_CONSTRAINT_SPECS
    .map(({ tableName, constraintName }) => `${tableName}.${constraintName}`));
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
  const unexpectedConstraints = constraints
    .map(({ tableName, constraintName }) => `${tableName}.${constraintName}`)
    .filter((key) => !requiredConstraintKeys.has(key))
    .sort();

  missingIndexes.sort();
  incompatibleIndexes.sort();
  missingConstraints.sort();
  incompatibleConstraints.sort();

  const premiumPlanCount = safeCount(row.premiumPlanCount);
  const configuredPremiumPlanCount = safeCount(row.configuredPremiumPlanCount);
  const activePremiumPlanCount = safeCount(row.activePremiumPlanCount);
  const schemaReady = row.missingTables.length === 0
    && row.incompatibleTables.length === 0
    && missingIndexes.length === 0
    && incompatibleIndexes.length === 0
    && unexpectedIndexes.length === 0
    && missingConstraints.length === 0
    && incompatibleConstraints.length === 0
    && unexpectedConstraints.length === 0
    && missingColumns.length === 0
    && incompatibleColumns.length === 0
    && unexpectedColumns.length === 0
    && row.vectorReady;
  const catalogReady = premiumPlanCount === 2
    && configuredPremiumPlanCount === 2
    && activePremiumPlanCount === 0;

  return {
    ready: schemaReady && catalogReady,
    schemaReady,
    catalogReady,
    missingTables: row.missingTables,
    incompatibleTables: row.incompatibleTables,
    missingIndexes,
    incompatibleIndexes,
    unexpectedIndexes,
    missingConstraints,
    incompatibleConstraints,
    unexpectedConstraints,
    missingColumns,
    incompatibleColumns,
    unexpectedColumns,
    vectorReady: row.vectorReady,
    premiumPlanCount,
    configuredPremiumPlanCount,
    activePremiumPlanCount,
  };
}

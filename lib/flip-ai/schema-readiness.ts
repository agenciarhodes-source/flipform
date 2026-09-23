import 'server-only';

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const FLIP_AI_REQUIRED_TABLES = [
  'flip_ai_agents',
  'flip_ai_endpoints',
  'flip_ai_knowledge_bases',
  'flip_ai_knowledge_documents',
  'flip_ai_knowledge_revisions',
  'flip_ai_knowledge_indexes',
  'flip_ai_knowledge_index_batches',
  'flip_ai_knowledge_chunks',
  'flip_ai_usage_events',
  'flip_ai_conversation_states',
  'flip_ai_rate_limit_buckets',
  'flip_ai_qualifications',
  'flip_ai_external_sources',
  'flip_ai_external_search_cache',
] as const;

const REQUIRED_INDEXES = [
  'conversations_tenant_id_id_key',
  'flip_ai_agents_tenant_id_id_key',
  'flip_ai_usage_events_request_key_key',
  'flip_ai_knowledge_chunks_embedding_hnsw_idx',
  'flip_ai_rate_limit_buckets_tenant_id_scope_scope_key_window_start_key',
  'flip_ai_qualifications_conversation_id_key',
  'flip_ai_external_sources_agent_id_domain_key',
  'flip_ai_external_search_cache_tenant_agent_query_allowlist_key',
] as const;

const REQUIRED_COLUMNS = [
  ['flip_ai_agents', 'rotation_id'],
  ['flip_ai_usage_events', 'conversation_id'],
] as const;

const QUALIFICATION_TEXT_COLUMNS = [
  'id',
  'tenant_id',
  'agent_id',
  'conversation_id',
  'lead_id',
  'knowledge_index_id',
] as const;

type ReadinessRow = {
  missingTables: string[];
  missingIndexes: string[];
  missingColumns: string[];
  incompatibleQualificationColumns: string[];
  vectorReady: boolean;
  premiumPlanCount: bigint | number | string;
  activePremiumPlanCount: bigint | number | string;
};

export type FlipAiSchemaReadiness = {
  ready: boolean;
  schemaReady: boolean;
  catalogReady: boolean;
  missingTables: string[];
  missingIndexes: string[];
  missingColumns: string[];
  incompatibleQualificationColumns: string[];
  vectorReady: boolean;
  premiumPlanCount: number;
  activePremiumPlanCount: number;
};

function safeCount(value: bigint | number | string) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : 0;
}

export async function inspectFlipAiSchema(): Promise<FlipAiSchemaReadiness> {
  const tableValues = Prisma.join(FLIP_AI_REQUIRED_TABLES.map((table) => Prisma.sql`(${table})`));
  const indexValues = Prisma.join(REQUIRED_INDEXES.map((index) => Prisma.sql`(${index})`));
  const columnValues = Prisma.join(REQUIRED_COLUMNS.map(([table, column]) =>
    Prisma.sql`(${table}, ${column})`));
  const qualificationValues = Prisma.join(QUALIFICATION_TEXT_COLUMNS.map((column) =>
    Prisma.sql`(${column}, 'text')`));

  const rows = await prisma.$queryRaw<ReadinessRow[]>(Prisma.sql`
    WITH required_tables(table_name) AS (VALUES ${tableValues}),
    required_indexes(index_name) AS (VALUES ${indexValues}),
    required_columns(table_name, column_name) AS (VALUES ${columnValues}),
    qualification_types(column_name, expected_type) AS (VALUES ${qualificationValues})
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
        SELECT columns.column_name || ':' || columns.data_type
        FROM information_schema.columns AS columns
        JOIN qualification_types
          ON qualification_types.column_name = columns.column_name
        WHERE columns.table_schema = 'public'
          AND columns.table_name = 'flip_ai_qualifications'
          AND columns.data_type <> qualification_types.expected_type
        ORDER BY columns.column_name
      ) AS "incompatibleQualificationColumns",
      EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'vector'
      ) AS "vectorReady",
      (
        SELECT COUNT(*) FROM plans WHERE slug IN ('premium', 'premium-pro')
      ) AS "premiumPlanCount",
      (
        SELECT COUNT(*) FROM plans
        WHERE slug IN ('premium', 'premium-pro') AND is_active = TRUE
      ) AS "activePremiumPlanCount"
  `);
  const row = rows[0];
  if (!row) throw new Error('FLIP_AI_SCHEMA_DIAGNOSTIC_EMPTY');

  const premiumPlanCount = safeCount(row.premiumPlanCount);
  const activePremiumPlanCount = safeCount(row.activePremiumPlanCount);
  const schemaReady = row.missingTables.length === 0
    && row.missingIndexes.length === 0
    && row.missingColumns.length === 0
    && row.incompatibleQualificationColumns.length === 0
    && row.vectorReady;
  const catalogReady = premiumPlanCount === 2;

  return {
    ready: schemaReady && catalogReady,
    schemaReady,
    catalogReady,
    missingTables: row.missingTables,
    missingIndexes: row.missingIndexes,
    missingColumns: row.missingColumns,
    incompatibleQualificationColumns: row.incompatibleQualificationColumns,
    vectorReady: row.vectorReady,
    premiumPlanCount,
    activePremiumPlanCount,
  };
}

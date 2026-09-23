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

type FlipAiRequiredTable = (typeof FLIP_AI_REQUIRED_TABLES)[number];

const POSTGRES_IDENTIFIER_MAX_BYTES = 63;

export function canonicalizeFlipAiIdentifier(identifier: string) {
  let bytes = 0;
  let result = '';
  for (const character of identifier) {
    const codePoint = character.codePointAt(0) || 0;
    const width = codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
    if (bytes + width > POSTGRES_IDENTIFIER_MAX_BYTES) break;
    result += character;
    bytes += width;
  }
  return result;
}

const COLUMN_SPECS_BY_TABLE = {
  flip_ai_agents: "id:text tenant_id:text name:text description:text='' primary_color:text='#2563EB' style:text='welcoming' status:text='draft' version:int4=1 pipeline_id:text initial_stage_id:text created_by:text? created_at:timestamp=CURRENT_TIMESTAMP updated_at:timestamp rotation_id:text?",
  flip_ai_endpoints: 'id:text tenant_id:text agent_id:text slug:text created_at:timestamp=CURRENT_TIMESTAMP updated_at:timestamp',
  flip_ai_knowledge_bases: "id:text tenant_id:text agent_id:text status:text='draft' created_at:timestamp=CURRENT_TIMESTAMP updated_at:timestamp",
  flip_ai_knowledge_documents: "id:text tenant_id:text knowledge_base_id:text source_key:text source_type:text='markdown' title:text current_revision:int4=1 current_hash:text byte_size:int4 created_at:timestamp=CURRENT_TIMESTAMP updated_at:timestamp",
  flip_ai_knowledge_revisions: 'id:text tenant_id:text document_id:text revision:int4 title:text content:text content_hash:text byte_size:int4 created_by:text? created_at:timestamp=CURRENT_TIMESTAMP',
  flip_ai_knowledge_indexes: "id:text tenant_id:text agent_id:text document_id:text revision:int4 content_hash:text status:text='pending' embedding_model:text embedding_dimensions:int4 chunk_count:int4 input_tokens:int4=0 attempt_count:int4=0 last_error_code:text? completed_at:timestamp? created_at:timestamp=CURRENT_TIMESTAMP updated_at:timestamp",
  flip_ai_knowledge_index_batches: "id:text tenant_id:text index_id:text ordinal:int4 status:text='pending' byte_size:int4 input_tokens:int4? attempt_count:int4=0 last_error_code:text? started_at:timestamp? completed_at:timestamp? created_at:timestamp=CURRENT_TIMESTAMP updated_at:timestamp",
  flip_ai_knowledge_chunks: 'id:text tenant_id:text index_id:text batch_id:text ordinal:int4 heading:text? content:text content_hash:text byte_size:int4 token_estimate:int4 embedding:vector? created_at:timestamp=CURRENT_TIMESTAMP',
  flip_ai_usage_events: 'id:text tenant_id:text agent_id:text? request_key:text operation:text provider:text model:text status:text input_tokens:int4? output_tokens:int4? units:int4=1 metadata:jsonb? created_at:timestamp=CURRENT_TIMESTAMP conversation_id:text?',
  flip_ai_conversation_states: "id:text tenant_id:text agent_id:text conversation_id:text status:text='active' turn_count:int4=0 summary:text? summary_updated_at:timestamp? last_response_id:text? created_at:timestamp=CURRENT_TIMESTAMP updated_at:timestamp",
  flip_ai_rate_limit_buckets: 'id:text tenant_id:text scope:text scope_key:text window_start:timestamp request_count:int4=0 rejected_count:int4=0 last_request_at:timestamp=CURRENT_TIMESTAMP created_at:timestamp=CURRENT_TIMESTAMP updated_at:timestamp',
  flip_ai_qualifications: "id:text tenant_id:text agent_id:text conversation_id:text lead_id:text? knowledge_index_id:text classification:text fit_score:int4 intent_score:int4 awareness_level:int4 journey_stage:text confidence:float8 summary:text reasons:_text next_action:text evidence_message_ids:_text=ARRAY[]::TEXT[] model:text qualified_lead_event_id:text? qualified_lead_tracking_status:text='not_applicable' qualified_lead_dispatched_at:timestamp? created_at:timestamp=CURRENT_TIMESTAMP updated_at:timestamp",
  flip_ai_external_sources: "id:text tenant_id:text agent_id:text label:text domain:text status:text='active' version:int4=1 created_at:timestamp=CURRENT_TIMESTAMP updated_at:timestamp=CURRENT_TIMESTAMP",
  flip_ai_external_search_cache: 'id:text tenant_id:text agent_id:text query_hash:text allowlist_hash:text result_text:text sources:jsonb model:text response_id:text searched_at:timestamp expires_at:timestamp created_at:timestamp=CURRENT_TIMESTAMP updated_at:timestamp=CURRENT_TIMESTAMP',
} satisfies Record<FlipAiRequiredTable, string>;

const POSTGRES_TYPE_FORMATS: Record<string, string> = {
  text: 'text',
  int4: 'integer',
  timestamp: 'timestamp(3) without time zone',
  float8: 'double precision',
  jsonb: 'jsonb',
  vector: 'vector(1536)',
  _text: 'text[]',
};

export function canonicalizeFlipAiDefaultDefinition(definition: string) {
  const unwrapped = stripOuterParentheses(definition.trim());
  let quoted = false;
  let normalized = '';
  for (let index = 0; index < unwrapped.length; index += 1) {
    const character = unwrapped[index];
    if (character === "'") quoted = !quoted;
    if (!quoted && /\s/.test(character)) continue;
    normalized += quoted ? character : character.toLowerCase();
  }
  normalized = normalized
    .replace(/::text(?!\[)/g, '')
    .replace(/::integer/g, '')
    .replace(/\((-?\d+(?:\.\d+)?)\)/g, '$1');
  if (normalized === "'{}'::text[]") return 'array[]::text[]';
  return normalized === 'now()' ? 'current_timestamp' : normalized;
}

export const FLIP_AI_REQUIRED_COLUMN_SPECS = Object.entries(COLUMN_SPECS_BY_TABLE)
  .flatMap(([table, specs]) => specs.split(' ').map((spec) => {
    const separator = spec.indexOf(':');
    const encoded = spec.slice(separator + 1);
    const defaultSeparator = encoded.indexOf('=');
    const encodedType = defaultSeparator === -1 ? encoded : encoded.slice(0, defaultSeparator);
    const defaultDefinition = defaultSeparator === -1 ? null : encoded.slice(defaultSeparator + 1);
    const nullable = encodedType.endsWith('?');
    const typeAlias = nullable ? encodedType.slice(0, -1) : encodedType;
    const postgresType = POSTGRES_TYPE_FORMATS[typeAlias];
    if (!postgresType) throw new Error(`Unsupported Flip AI schema type: ${typeAlias}`);
    return [
      table,
      spec.slice(0, separator),
      postgresType,
      !nullable,
      defaultDefinition === null ? null : canonicalizeFlipAiDefaultDefinition(defaultDefinition),
    ] as const;
  }));

export type FlipAiRequiredIndexSpec = Readonly<{
  tableName: string;
  indexName: string;
  unique: boolean;
  nullsNotDistinct: false;
  method: 'btree' | 'hnsw';
  columns: readonly string[];
  opclasses: readonly string[];
}>;

function index(
  tableName: string,
  indexName: string,
  unique: boolean,
  columns: string,
  opclasses: string,
  method: 'btree' | 'hnsw' = 'btree',
): FlipAiRequiredIndexSpec {
  return {
    tableName,
    indexName: canonicalizeFlipAiIdentifier(indexName),
    unique,
    nullsNotDistinct: false,
    method,
    columns: columns.split(','),
    opclasses: opclasses.split(','),
  };
}

const T = 'text_ops';
const I = 'int4_ops';
const TS = 'timestamp_ops';

export const FLIP_AI_REQUIRED_INDEX_SPECS: readonly FlipAiRequiredIndexSpec[] = [
  index('flip_ai_agents', 'flip_ai_agents_tenant_id_id_key', true, 'tenant_id,id', `${T},${T}`),
  index('flip_ai_agents', 'flip_ai_agents_tenant_id_status_created_at_idx', false, 'tenant_id,status,created_at', `${T},${T},${TS}`),
  index('flip_ai_endpoints', 'flip_ai_endpoints_tenant_id_agent_id_key', true, 'tenant_id,agent_id', `${T},${T}`),
  index('flip_ai_endpoints', 'flip_ai_endpoints_agent_id_key', true, 'agent_id', T),
  index('flip_ai_endpoints', 'flip_ai_endpoints_slug_key', true, 'slug', T),
  index('flip_ai_endpoints', 'flip_ai_endpoints_tenant_id_idx', false, 'tenant_id', T),
  index('flip_ai_knowledge_bases', 'flip_ai_knowledge_bases_agent_id_key', true, 'agent_id', T),
  index('flip_ai_knowledge_bases', 'flip_ai_knowledge_bases_tenant_id_id_key', true, 'tenant_id,id', `${T},${T}`),
  index('flip_ai_knowledge_bases', 'flip_ai_knowledge_bases_tenant_id_agent_id_key', true, 'tenant_id,agent_id', `${T},${T}`),
  index('flip_ai_knowledge_bases', 'flip_ai_knowledge_bases_tenant_id_status_idx', false, 'tenant_id,status', `${T},${T}`),
  index('flip_ai_knowledge_documents', 'flip_ai_knowledge_documents_tenant_id_id_key', true, 'tenant_id,id', `${T},${T}`),
  index('flip_ai_knowledge_documents', 'flip_ai_knowledge_documents_knowledge_base_id_source_key_key', true, 'knowledge_base_id,source_key', `${T},${T}`),
  index('flip_ai_knowledge_documents', 'flip_ai_knowledge_documents_tenant_id_updated_at_idx', false, 'tenant_id,updated_at', `${T},${TS}`),
  index('flip_ai_knowledge_revisions', 'flip_ai_knowledge_revisions_document_id_revision_key', true, 'document_id,revision', `${T},${I}`),
  index('flip_ai_knowledge_revisions', 'flip_ai_knowledge_revisions_tenant_id_created_at_idx', false, 'tenant_id,created_at', `${T},${TS}`),
  index('flip_ai_knowledge_revisions', 'flip_ai_knowledge_revisions_tenant_id_document_id_revision_key', true, 'tenant_id,document_id,revision', `${T},${T},${I}`),
  index('flip_ai_knowledge_indexes', 'flip_ai_knowledge_indexes_tenant_id_id_key', true, 'tenant_id,id', `${T},${T}`),
  index('flip_ai_knowledge_indexes', 'flip_ai_knowledge_indexes_document_id_revision_embedding_model_key', true, 'document_id,revision,embedding_model', `${T},${I},${T}`),
  index('flip_ai_knowledge_indexes', 'flip_ai_knowledge_indexes_tenant_id_agent_id_status_idx', false, 'tenant_id,agent_id,status', `${T},${T},${T}`),
  index('flip_ai_knowledge_index_batches', 'flip_ai_knowledge_index_batches_tenant_id_id_key', true, 'tenant_id,id', `${T},${T}`),
  index('flip_ai_knowledge_index_batches', 'flip_ai_knowledge_index_batches_index_id_ordinal_key', true, 'index_id,ordinal', `${T},${I}`),
  index('flip_ai_knowledge_index_batches', 'flip_ai_knowledge_index_batches_tenant_id_status_created_at_idx', false, 'tenant_id,status,created_at', `${T},${T},${TS}`),
  index('flip_ai_knowledge_chunks', 'flip_ai_knowledge_chunks_index_id_ordinal_key', true, 'index_id,ordinal', `${T},${I}`),
  index('flip_ai_knowledge_chunks', 'flip_ai_knowledge_chunks_tenant_id_index_id_idx', false, 'tenant_id,index_id', `${T},${T}`),
  index('flip_ai_knowledge_chunks', 'flip_ai_knowledge_chunks_embedding_hnsw_idx', false, 'embedding', 'vector_cosine_ops', 'hnsw'),
  index('flip_ai_usage_events', 'flip_ai_usage_events_request_key_key', true, 'request_key', T),
  index('flip_ai_usage_events', 'flip_ai_usage_events_tenant_id_created_at_idx', false, 'tenant_id,created_at', `${T},${TS}`),
  index('flip_ai_usage_events', 'flip_ai_usage_events_tenant_id_operation_status_idx', false, 'tenant_id,operation,status', `${T},${T},${T}`),
  index('conversations', 'conversations_tenant_id_id_key', true, 'tenant_id,id', `${T},${T}`),
  index('flip_ai_conversation_states', 'flip_ai_conversation_states_conversation_id_key', true, 'conversation_id', T),
  index('flip_ai_conversation_states', 'flip_ai_conversation_states_tenant_id_id_key', true, 'tenant_id,id', `${T},${T}`),
  index('flip_ai_conversation_states', 'flip_ai_conversation_states_tenant_id_conversation_id_key', true, 'tenant_id,conversation_id', `${T},${T}`),
  index('flip_ai_conversation_states', 'flip_ai_conversation_states_tenant_id_agent_id_status_idx', false, 'tenant_id,agent_id,status', `${T},${T},${T}`),
  index('flip_ai_usage_events', 'flip_ai_usage_events_tenant_id_conversation_id_created_at_idx', false, 'tenant_id,conversation_id,created_at', `${T},${T},${TS}`),
  index('flip_ai_rate_limit_buckets', 'flip_ai_rate_limit_buckets_tenant_id_scope_scope_key_window_start_key', true, 'tenant_id,scope,scope_key,window_start', `${T},${T},${T},${TS}`),
  index('flip_ai_rate_limit_buckets', 'flip_ai_rate_limit_buckets_tenant_id_window_start_idx', false, 'tenant_id,window_start', `${T},${TS}`),
  index('flip_ai_rate_limit_buckets', 'flip_ai_rate_limit_buckets_tenant_id_rejected_count_updated_at_idx', false, 'tenant_id,rejected_count,updated_at', `${T},${I},${TS}`),
  index('flip_ai_agents', 'flip_ai_agents_tenant_id_rotation_id_idx', false, 'tenant_id,rotation_id', `${T},${T}`),
  index('flip_ai_qualifications', 'flip_ai_qualifications_conversation_id_key', true, 'conversation_id', T),
  index('flip_ai_qualifications', 'flip_ai_qualifications_qualified_lead_event_id_key', true, 'qualified_lead_event_id', T),
  index('flip_ai_qualifications', 'flip_ai_qualifications_tenant_id_id_key', true, 'tenant_id,id', `${T},${T}`),
  index('flip_ai_qualifications', 'flip_ai_qualifications_tenant_id_conversation_id_key', true, 'tenant_id,conversation_id', `${T},${T}`),
  index('flip_ai_qualifications', 'flip_ai_qualifications_tenant_id_agent_id_created_at_idx', false, 'tenant_id,agent_id,created_at', `${T},${T},${TS}`),
  index('flip_ai_qualifications', 'flip_ai_qualifications_tenant_id_lead_id_created_at_idx', false, 'tenant_id,lead_id,created_at', `${T},${T},${TS}`),
  index('flip_ai_qualifications', 'flip_ai_qualifications_tenant_id_classification_created_at_idx', false, 'tenant_id,classification,created_at', `${T},${T},${TS}`),
  index('flip_ai_qualifications', 'flip_ai_qualifications_tenant_id_qualified_lead_tracking_status_idx', false, 'tenant_id,qualified_lead_tracking_status', `${T},${T}`),
  index('flip_ai_external_sources', 'flip_ai_external_sources_tenant_id_id_key', true, 'tenant_id,id', `${T},${T}`),
  index('flip_ai_external_sources', 'flip_ai_external_sources_agent_id_domain_key', true, 'agent_id,domain', `${T},${T}`),
  index('flip_ai_external_sources', 'flip_ai_external_sources_tenant_id_agent_id_status_idx', false, 'tenant_id,agent_id,status', `${T},${T},${T}`),
  index('flip_ai_external_search_cache', 'flip_ai_external_search_cache_tenant_id_id_key', true, 'tenant_id,id', `${T},${T}`),
  index('flip_ai_external_search_cache', 'flip_ai_external_search_cache_tenant_agent_query_allowlist_key', true, 'tenant_id,agent_id,query_hash,allowlist_hash', `${T},${T},${T},${T}`),
  index('flip_ai_external_search_cache', 'flip_ai_external_search_cache_tenant_agent_expires_idx', false, 'tenant_id,agent_id,expires_at', `${T},${T},${TS}`),
];

export const FLIP_AI_REQUIRED_INDEXES = FLIP_AI_REQUIRED_INDEX_SPECS.map(({ indexName }) => indexName);

type ConstraintType = 'p' | 'f' | 'c';
type ForeignKeyAction = 'a' | 'r' | 'c' | 'n' | 'd';

export type FlipAiRequiredConstraintSpec = Readonly<{
  tableName: string;
  constraintName: string;
  type: ConstraintType;
  columns: readonly string[];
  referencedSchema: 'public' | null;
  referencedTable: string | null;
  referencedColumns: readonly string[];
  updateAction: ForeignKeyAction;
  deleteAction: ForeignKeyAction;
  matchType: 's';
  checkSignature: string | null;
}>;

function primary(tableName: string, constraintName: string, columns = 'id'): FlipAiRequiredConstraintSpec {
  return constraint(tableName, constraintName, 'p', columns);
}

function foreign(
  tableName: string,
  constraintName: string,
  columns: string,
  referencedTable: string,
  referencedColumns: string,
  deleteAction: ForeignKeyAction,
): FlipAiRequiredConstraintSpec {
  return constraint(tableName, constraintName, 'f', columns, referencedTable, referencedColumns,
    'c', deleteAction);
}

function check(
  tableName: string,
  constraintName: string,
  columns: string,
  definition: string,
): FlipAiRequiredConstraintSpec {
  return constraint(tableName, constraintName, 'c', columns, null, '', 'a', 'a', definition);
}

function constraint(
  tableName: string,
  constraintName: string,
  type: ConstraintType,
  columns: string,
  referencedTable: string | null = null,
  referencedColumns = '',
  updateAction: ForeignKeyAction = 'a',
  deleteAction: ForeignKeyAction = 'a',
  checkDefinition: string | null = null,
): FlipAiRequiredConstraintSpec {
  return {
    tableName,
    constraintName: canonicalizeFlipAiIdentifier(constraintName),
    type,
    columns: columns ? columns.split(',') : [],
    referencedSchema: referencedTable ? 'public' : null,
    referencedTable,
    referencedColumns: referencedColumns ? referencedColumns.split(',') : [],
    updateAction,
    deleteAction,
    matchType: 's',
    checkSignature: checkDefinition ? canonicalizeFlipAiCheckDefinition(checkDefinition) : null,
  };
}

function stripOuterParentheses(value: string) {
  let result = value.trim();
  while (result.startsWith('(') && result.endsWith(')')) {
    let depth = 0;
    let quoted = false;
    let wrapsWholeValue = true;
    for (let index = 0; index < result.length; index += 1) {
      const character = result[index];
      if (character === "'" && result[index - 1] !== '\\') quoted = !quoted;
      if (quoted) continue;
      if (character === '(') depth += 1;
      if (character === ')') depth -= 1;
      if (depth === 0 && index < result.length - 1) {
        wrapsWholeValue = false;
        break;
      }
    }
    if (!wrapsWholeValue) break;
    result = result.slice(1, -1).trim();
  }
  return result;
}

function splitBooleanExpression(value: string, operator: 'or' | 'and') {
  const parts: string[] = [];
  let start = 0;
  let parentheses = 0;
  let brackets = 0;
  let quoted = false;
  const lower = value.toLowerCase();
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    if (character === "'" && value[index - 1] !== '\\') quoted = !quoted;
    if (quoted) continue;
    if (character === '(') parentheses += 1;
    else if (character === ')') parentheses -= 1;
    else if (character === '[') brackets += 1;
    else if (character === ']') brackets -= 1;
    if (parentheses || brackets) continue;
    const candidate = lower.slice(index, index + operator.length);
    const before = lower[index - 1] || ' ';
    const after = lower[index + operator.length] || ' ';
    if (candidate === operator && /\s/.test(before) && /\s/.test(after)) {
      parts.push(value.slice(start, index).trim());
      start = index + operator.length;
      index += operator.length - 1;
    }
  }
  if (!parts.length) return [value.trim()];
  parts.push(value.slice(start).trim());
  return parts;
}

function canonicalizeBooleanExpression(value: string): string {
  const unwrapped = stripOuterParentheses(value);
  const orParts = splitBooleanExpression(unwrapped, 'or');
  if (orParts.length > 1) {
    const parts = orParts.map(canonicalizeBooleanExpression).map((part) =>
      part.startsWith('or(') && part.endsWith(')') ? part.slice(3, -1) : part);
    return `or(${parts.join(',')})`;
  }
  const andParts = splitBooleanExpression(unwrapped, 'and');
  if (andParts.length > 1) {
    const parts = andParts.map(canonicalizeBooleanExpression).map((part) =>
      part.startsWith('and(') && part.endsWith(')') ? part.slice(4, -1) : part);
    return `and(${parts.join(',')})`;
  }
  const atom = stripOuterParentheses(unwrapped)
    .replace(/::(?:text|double\s+precision)/gi, '')
    .replace(/\((-?\d+(?:\.\d+)?|'[^']*')\)/g, '$1')
    .replace(/"/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
  const inMatch = atom.match(/^([a-z_][a-z0-9_]*)in\((.*)\)$/);
  return inMatch ? `${inMatch[1]}=any(array[${inMatch[2]}])` : atom;
}

export function canonicalizeFlipAiCheckDefinition(definition: string) {
  let expression = definition.trim().replace(/^check\s*/i, '');
  expression = stripOuterParentheses(expression);
  expression = expression.replace(
    /("?[a-z_][a-z0-9_]*"?)\s+between\s+(-?\d+(?:\.\d+)?)\s+and\s+(-?\d+(?:\.\d+)?)/gi,
    '($1 >= $2 AND $1 <= $3)',
  );
  return canonicalizeBooleanExpression(expression);
}

const SCORES_CHECK = `CHECK (
  fit_score BETWEEN 0 AND 100
  AND intent_score BETWEEN 0 AND 100
  AND awareness_level BETWEEN 1 AND 5
  AND confidence BETWEEN 0 AND 1
)`;
const CLASSIFICATION_CHECK = `CHECK (
  classification IN ('qualified', 'nurture', 'disqualified', 'insufficient')
)`;
const JOURNEY_CHECK = `CHECK (journey_stage IN ('discovery', 'consideration', 'decision'))`;
const TRACKING_CHECK = `CHECK (
  qualified_lead_tracking_status IN ('not_applicable', 'pending', 'processing', 'sent', 'skipped', 'ambiguous')
)`;
const MERIT_EXECUTION_CHECK = `CHECK (
  (
    classification = 'qualified'
    AND qualified_lead_event_id IS NOT NULL
    AND qualified_lead_tracking_status <> 'not_applicable'
  )
  OR
  (
    classification <> 'qualified'
    AND qualified_lead_event_id IS NULL
    AND qualified_lead_tracking_status = 'not_applicable'
  )
)`;

export const FLIP_AI_REQUIRED_CONSTRAINT_SPECS: readonly FlipAiRequiredConstraintSpec[] = [
  primary('flip_ai_agents', 'flip_ai_agents_pkey'),
  foreign('flip_ai_agents', 'flip_ai_agents_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  foreign('flip_ai_agents', 'flip_ai_agents_pipeline_id_fkey', 'pipeline_id', 'pipelines', 'id', 'r'),
  foreign('flip_ai_agents', 'flip_ai_agents_initial_stage_id_fkey', 'initial_stage_id', 'pipeline_stages', 'id', 'r'),
  foreign('flip_ai_agents', 'flip_ai_agents_created_by_fkey', 'created_by', 'users', 'id', 'n'),
  foreign('flip_ai_agents', 'flip_ai_agents_rotation_id_fkey', 'rotation_id', 'lead_assignment_rotations', 'id', 'n'),
  primary('flip_ai_endpoints', 'flip_ai_endpoints_pkey'),
  foreign('flip_ai_endpoints', 'flip_ai_endpoints_tenant_id_agent_id_fkey', 'tenant_id,agent_id', 'flip_ai_agents', 'tenant_id,id', 'r'),
  primary('flip_ai_knowledge_bases', 'flip_ai_knowledge_bases_pkey'),
  foreign('flip_ai_knowledge_bases', 'flip_ai_knowledge_bases_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  foreign('flip_ai_knowledge_bases', 'flip_ai_knowledge_bases_tenant_id_agent_id_fkey', 'tenant_id,agent_id', 'flip_ai_agents', 'tenant_id,id', 'r'),
  primary('flip_ai_knowledge_documents', 'flip_ai_knowledge_documents_pkey'),
  foreign('flip_ai_knowledge_documents', 'flip_ai_knowledge_documents_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  foreign('flip_ai_knowledge_documents', 'flip_ai_knowledge_documents_tenant_id_knowledge_base_id_fkey', 'tenant_id,knowledge_base_id', 'flip_ai_knowledge_bases', 'tenant_id,id', 'r'),
  primary('flip_ai_knowledge_revisions', 'flip_ai_knowledge_revisions_pkey'),
  foreign('flip_ai_knowledge_revisions', 'flip_ai_knowledge_revisions_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  foreign('flip_ai_knowledge_revisions', 'flip_ai_knowledge_revisions_tenant_id_document_id_fkey', 'tenant_id,document_id', 'flip_ai_knowledge_documents', 'tenant_id,id', 'r'),
  foreign('flip_ai_knowledge_revisions', 'flip_ai_knowledge_revisions_created_by_fkey', 'created_by', 'users', 'id', 'n'),
  primary('flip_ai_knowledge_indexes', 'flip_ai_knowledge_indexes_pkey'),
  foreign('flip_ai_knowledge_indexes', 'flip_ai_knowledge_indexes_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  foreign('flip_ai_knowledge_indexes', 'flip_ai_knowledge_indexes_tenant_id_agent_id_fkey', 'tenant_id,agent_id', 'flip_ai_agents', 'tenant_id,id', 'r'),
  foreign('flip_ai_knowledge_indexes', 'flip_ai_knowledge_indexes_tenant_id_document_id_fkey', 'tenant_id,document_id', 'flip_ai_knowledge_documents', 'tenant_id,id', 'r'),
  foreign('flip_ai_knowledge_indexes', 'flip_ai_knowledge_indexes_source_revision_fkey', 'tenant_id,document_id,revision', 'flip_ai_knowledge_revisions', 'tenant_id,document_id,revision', 'r'),
  primary('flip_ai_knowledge_index_batches', 'flip_ai_knowledge_index_batches_pkey'),
  foreign('flip_ai_knowledge_index_batches', 'flip_ai_knowledge_index_batches_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  foreign('flip_ai_knowledge_index_batches', 'flip_ai_knowledge_index_batches_tenant_id_index_id_fkey', 'tenant_id,index_id', 'flip_ai_knowledge_indexes', 'tenant_id,id', 'r'),
  primary('flip_ai_knowledge_chunks', 'flip_ai_knowledge_chunks_pkey'),
  foreign('flip_ai_knowledge_chunks', 'flip_ai_knowledge_chunks_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  foreign('flip_ai_knowledge_chunks', 'flip_ai_knowledge_chunks_tenant_id_index_id_fkey', 'tenant_id,index_id', 'flip_ai_knowledge_indexes', 'tenant_id,id', 'r'),
  foreign('flip_ai_knowledge_chunks', 'flip_ai_knowledge_chunks_tenant_id_batch_id_fkey', 'tenant_id,batch_id', 'flip_ai_knowledge_index_batches', 'tenant_id,id', 'r'),
  primary('flip_ai_usage_events', 'flip_ai_usage_events_pkey'),
  foreign('flip_ai_usage_events', 'flip_ai_usage_events_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  foreign('flip_ai_usage_events', 'flip_ai_usage_events_tenant_id_agent_id_fkey', 'tenant_id,agent_id', 'flip_ai_agents', 'tenant_id,id', 'r'),
  foreign('flip_ai_usage_events', 'flip_ai_usage_events_tenant_id_conversation_id_fkey', 'tenant_id,conversation_id', 'conversations', 'tenant_id,id', 'r'),
  primary('flip_ai_conversation_states', 'flip_ai_conversation_states_pkey'),
  foreign('flip_ai_conversation_states', 'flip_ai_conversation_states_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  foreign('flip_ai_conversation_states', 'flip_ai_conversation_states_tenant_id_agent_id_fkey', 'tenant_id,agent_id', 'flip_ai_agents', 'tenant_id,id', 'r'),
  foreign('flip_ai_conversation_states', 'flip_ai_conversation_states_tenant_id_conversation_id_fkey', 'tenant_id,conversation_id', 'conversations', 'tenant_id,id', 'r'),
  primary('flip_ai_rate_limit_buckets', 'flip_ai_rate_limit_buckets_pkey'),
  foreign('flip_ai_rate_limit_buckets', 'flip_ai_rate_limit_buckets_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  primary('flip_ai_qualifications', 'flip_ai_qualifications_pkey'),
  check('flip_ai_qualifications', 'flip_ai_qualifications_scores_check', 'fit_score,intent_score,awareness_level,confidence', SCORES_CHECK),
  check('flip_ai_qualifications', 'flip_ai_qualifications_classification_check', 'classification', CLASSIFICATION_CHECK),
  check('flip_ai_qualifications', 'flip_ai_qualifications_journey_check', 'journey_stage', JOURNEY_CHECK),
  check('flip_ai_qualifications', 'flip_ai_qualifications_tracking_status_check', 'qualified_lead_tracking_status', TRACKING_CHECK),
  check('flip_ai_qualifications', 'flip_ai_qualifications_merit_execution_check', 'classification,qualified_lead_event_id,qualified_lead_tracking_status', MERIT_EXECUTION_CHECK),
  foreign('flip_ai_qualifications', 'flip_ai_qualifications_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  foreign('flip_ai_qualifications', 'flip_ai_qualifications_tenant_id_agent_id_fkey', 'tenant_id,agent_id', 'flip_ai_agents', 'tenant_id,id', 'r'),
  foreign('flip_ai_qualifications', 'flip_ai_qualifications_tenant_id_conversation_id_fkey', 'tenant_id,conversation_id', 'conversations', 'tenant_id,id', 'r'),
  foreign('flip_ai_qualifications', 'flip_ai_qualifications_lead_id_fkey', 'lead_id', 'leads', 'id', 'n'),
  foreign('flip_ai_qualifications', 'flip_ai_qualifications_tenant_id_knowledge_index_id_fkey', 'tenant_id,knowledge_index_id', 'flip_ai_knowledge_indexes', 'tenant_id,id', 'r'),
  primary('flip_ai_external_sources', 'flip_ai_external_sources_pkey'),
  foreign('flip_ai_external_sources', 'flip_ai_external_sources_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  foreign('flip_ai_external_sources', 'flip_ai_external_sources_tenant_id_agent_id_fkey', 'tenant_id,agent_id', 'flip_ai_agents', 'tenant_id,id', 'r'),
  primary('flip_ai_external_search_cache', 'flip_ai_external_search_cache_pkey'),
  foreign('flip_ai_external_search_cache', 'flip_ai_external_search_cache_tenant_id_fkey', 'tenant_id', 'tenants', 'id', 'r'),
  foreign('flip_ai_external_search_cache', 'flip_ai_external_search_cache_tenant_id_agent_id_fkey', 'tenant_id,agent_id', 'flip_ai_agents', 'tenant_id,id', 'r'),
];

export const FLIP_AI_REQUIRED_CONSTRAINTS = FLIP_AI_REQUIRED_CONSTRAINT_SPECS
  .map(({ constraintName }) => constraintName);

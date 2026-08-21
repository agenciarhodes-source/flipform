import 'server-only';

export const FLOW_CONDITION_ACTION = 'flow.condition';

export type FlowConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'exists'
  | 'not_exists';

const FLOW_CONDITION_OPERATORS = new Set<FlowConditionOperator>([
  'equals',
  'not_equals',
  'contains',
  'not_contains',
  'exists',
  'not_exists',
]);

export function isFlowConditionOperator(value: unknown): value is FlowConditionOperator {
  return typeof value === 'string' && FLOW_CONDITION_OPERATORS.has(value as FlowConditionOperator);
}

function scalarText(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  return null;
}

function comparable(value: string, caseSensitive: boolean) {
  const normalized = value.normalize('NFKC').trim();
  return caseSensitive ? normalized : normalized.toLocaleLowerCase('pt-BR');
}

export function evaluateFlowCondition(input: {
  actual: unknown;
  operator: FlowConditionOperator;
  expected?: string | null;
  caseSensitive?: boolean;
}) {
  const exists = input.actual !== null
    && input.actual !== undefined
    && scalarText(input.actual)?.trim() !== '';

  if (input.operator === 'exists') return exists;
  if (input.operator === 'not_exists') return !exists;

  const actual = scalarText(input.actual);
  const expected = typeof input.expected === 'string' ? input.expected : null;
  if (actual === null || expected === null) return false;

  const caseSensitive = input.caseSensitive === true;
  const left = comparable(actual, caseSensitive);
  const right = comparable(expected, caseSensitive);

  if (input.operator === 'equals') return left === right;
  if (input.operator === 'not_equals') return left !== right;
  if (input.operator === 'contains') return left.includes(right);
  if (input.operator === 'not_contains') return !left.includes(right);
  return false;
}

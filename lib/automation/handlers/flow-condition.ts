import 'server-only';

import {
  evaluateFlowCondition,
  FLOW_CONDITION_ACTION,
  isFlowConditionOperator,
} from '../adapters/flow-condition';
import type { AutomationActionHandler } from '../types';

function stringField(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function validInputField(value: string) {
  return /^[A-Za-z][A-Za-z0-9_]{0,119}$/.test(value);
}

export function createFlowConditionAutomationHandler(): AutomationActionHandler {
  return async context => {
    if (context.action.type !== FLOW_CONDITION_ACTION) {
      return { status: 'failed', code: 'INVALID_FLOW_CONDITION_ACTION' };
    }

    const field = stringField(context.action.config.field);
    const operator = context.action.config.operator;
    const expected = typeof context.action.config.value === 'string'
      ? context.action.config.value
      : null;
    const caseSensitive = context.action.config.caseSensitive === true;

    if (!field || !validInputField(field) || !isFlowConditionOperator(operator)) {
      return { status: 'failed', code: 'INVALID_FLOW_CONDITION_CONFIG' };
    }
    if (!['exists', 'not_exists'].includes(operator) && expected === null) {
      return { status: 'failed', code: 'INVALID_FLOW_CONDITION_CONFIG' };
    }

    const matched = evaluateFlowCondition({
      actual: context.input[field],
      operator,
      expected,
      caseSensitive,
    });

    return matched
      ? { status: 'completed' }
      : { status: 'skipped', code: 'FLOW_CONDITION_NOT_MATCHED' };
  };
}

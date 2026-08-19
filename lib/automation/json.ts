import 'server-only';

import { Prisma } from '@prisma/client';
import { AutomationCoreError } from './types';

export function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function integerField(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export function assertAutomationType(value: string, label: string) {
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > 100
    || !/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/.test(normalized)
  ) {
    throw new AutomationCoreError('INVALID_REQUEST', `${label} type is invalid`);
  }
  return normalized;
}

export function assertAutomationId(value: string, label: string) {
  const normalized = value.trim();
  if (
    !normalized
    || normalized.length > 120
    || !/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(normalized)
  ) {
    throw new AutomationCoreError('INVALID_REQUEST', `${label} id is invalid`);
  }
  return normalized;
}

function assertJsonValue(
  value: unknown,
  label: string,
  depth = 0,
  seen = new Set<object>(),
): void {
  if (depth > 12) {
    throw new AutomationCoreError('INVALID_REQUEST', `${label} is too deeply nested`);
  }
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new AutomationCoreError('INVALID_REQUEST', `${label} contains a non-finite number`);
    }
    return;
  }
  if (Array.isArray(value)) {
    if (seen.has(value)) {
      throw new AutomationCoreError('INVALID_REQUEST', `${label} contains a circular reference`);
    }
    seen.add(value);
    for (const item of value) assertJsonValue(item, label, depth + 1, seen);
    seen.delete(value);
    return;
  }
  if (value && typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new AutomationCoreError('INVALID_REQUEST', `${label} must contain plain JSON values`);
    }
    if (seen.has(value)) {
      throw new AutomationCoreError('INVALID_REQUEST', `${label} contains a circular reference`);
    }
    seen.add(value);
    for (const [key, item] of Object.entries(value)) {
      if (
        !key
        || key.length > 200
        || key === '__proto__'
        || key === 'prototype'
        || key === 'constructor'
      ) {
        throw new AutomationCoreError('INVALID_REQUEST', `${label} contains an invalid key`);
      }
      assertJsonValue(item, label, depth + 1, seen);
    }
    seen.delete(value);
    return;
  }
  throw new AutomationCoreError('INVALID_REQUEST', `${label} contains a non-JSON value`);
}

export function normalizeJsonObject(value: unknown, label: string, maxBytes: number) {
  const object = asObject(value);
  if (!object) {
    throw new AutomationCoreError('INVALID_REQUEST', `${label} must be an object`);
  }
  assertJsonValue(object, label);
  if (Buffer.byteLength(JSON.stringify(object), 'utf8') > maxBytes) {
    throw new AutomationCoreError('INVALID_REQUEST', `${label} is too large`);
  }
  return JSON.parse(JSON.stringify(object)) as Record<string, unknown>;
}

export function jsonByteLength(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

export function toJson(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

import { NextResponse } from 'next/server';

export type ApiSuccessPayload<T> = { ok: true; data: T };
export type ApiErrorPayload = { ok: false; error: string; details?: unknown };

export function apiSuccess<T>(data: T, init?: ResponseInit) {
  return NextResponse.json<ApiSuccessPayload<T>>({ ok: true, data }, init);
}

export function apiError(error: string, status = 400, details?: unknown) {
  return NextResponse.json<ApiErrorPayload>({ ok: false, error, ...(details === undefined ? {} : { details }) }, { status });
}

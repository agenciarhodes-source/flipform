import { NextResponse } from 'next/server';

export function adminOk(data: unknown, init?: ResponseInit) {
  const root = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  return NextResponse.json({ ok: true, ...root, data }, init);
}

export function adminError(message: string, status = 400, details?: unknown) {
  return NextResponse.json({ ok: false, error: message, ...(details === undefined ? {} : { details }) }, { status });
}

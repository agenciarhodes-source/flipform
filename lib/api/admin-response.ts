import { NextResponse } from 'next/server';
export function adminOk(data: unknown, init?: ResponseInit) { return NextResponse.json({ ok: true, data }, init); }
export function adminError(message: string, status = 400, details?: unknown) { return NextResponse.json({ ok: false, error: message, ...(details === undefined ? {} : { details }) }, { status }); }

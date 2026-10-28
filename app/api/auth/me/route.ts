import { NextResponse } from 'next/server';
import { getVerifiedSession } from '@/lib/auth';

export async function GET() {
  // An ended session is reported as signed out (security protocol T2).
  const session = await getVerifiedSession();
  if (!session) return NextResponse.json({ user: null }, { status: 401 });
  return NextResponse.json({ user: session });
}

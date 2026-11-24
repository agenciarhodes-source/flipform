import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { startFlipVoiceOutbound } from '@/lib/flip-voice/telephony-service';
import { readFlipAiBody } from '@/lib/flip-ai/http';
import { FlipVoiceCoreError } from '@/lib/flip-voice/agent-core';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const requestSchema = z.object({
  leadId: z.guid(),
  lineId: z.guid(),
  idempotencyKey: z.guid(),
}).strict();

/**
 * Initiates only an explicitly requested call from an authenticated owner/admin.
 * Requires global+tenant+line flags, explicit lead opt-in, voice-owner consent and
 * pre-funded tenant budget. All feature flags default OFF. No bulk-send endpoint.
 */
export const POST = withAuth(async (req: NextRequest, session) => {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (req.headers.get('origin') !== req.nextUrl.origin) {
    return NextResponse.json({code:'INVALID_ORIGIN'},{status:403,headers});
  }
  if (!session.tenantId || !['owner','admin'].includes(session.role)) {
    return NextResponse.json({code:'VOICE_FORBIDDEN'},{status:403,headers});
  }
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json') ||
      Number(req.headers.get('content-length')||'0') > 2048) {
    return NextResponse.json({code:'INVALID_BODY'},{status:400,headers});
  }
  let body: unknown;
  try { body=await readFlipAiBody(req,2048); }
  catch { return NextResponse.json({code:'INVALID_JSON'},{status:400,headers}); }
  const parsed=requestSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({code:'INVALID_REQUEST'},{status:400,headers});
  try {
    const result=await startFlipVoiceOutbound(session,parsed.data);
    return NextResponse.json(result,{status:result.status==='initiated'?202:result.reused?200:409,headers});
  }catch(error){
    if(error instanceof FlipVoiceCoreError) {
      const forbidden=/DISABLED|FORBIDDEN|OPT_IN|OUTSIDE|DENIED/.test(error.code);
      return NextResponse.json({code:error.code},{status:forbidden?403:409,headers});
    }
    return NextResponse.json({code:'VOICE_UNAVAILABLE'},{status:503,headers});
  }
});

/** Tenant-scoped, redacted call history; never exposes provider credentials or raw phones. */
export const GET = withAuth(async (_req: NextRequest,session) => {
  const headers = { 'Cache-Control': 'private, no-store' };
  if (!session.tenantId || !['owner','admin','manager'].includes(session.role)) {
    return NextResponse.json({code:'VOICE_FORBIDDEN'},{status:403,headers});
  }
  if (process.env.FLIP_VOICE_PSTN_ENABLED !== 'true') {
    return NextResponse.json({enabled:false,calls:[]},{headers});
  }
  try {
    const calls=await prisma.flipVoiceCall.findMany({
      where:{tenantId:session.tenantId,channel:'pstn'},
      orderBy:{createdAt:'desc'},take:50,
      select:{
        id:true,leadId:true,lineId:true,direction:true,status:true,
        startedAt:true,endedAt:true,createdAt:true,
        reservedUsdMicros:true,billedUsdMicros:true,
      },
    });
    return NextResponse.json({enabled:true,calls:calls.map(c=>({
      ...c,reservedUsdMicros:c.reservedUsdMicros.toString(),
      billedUsdMicros:c.billedUsdMicros.toString(),
    }))},{headers});
  }catch {
    return NextResponse.json({code:'VOICE_UNAVAILABLE'},{status:503,headers});
  }
});

import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { readTenantSupportKnowledge, saveTenantSupportKnowledge } from '@/lib/suporte-atendimento/tenant-knowledge';
import { canManageTenantSupportKnowledge } from '@/lib/suporte-atendimento/access';

export const dynamic = 'force-dynamic';

export const GET = withPermission('SETTINGS_VIEW', async (req, session) => {
  if (!canManageTenantSupportKnowledge(session)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  try {
    const current = await readTenantSupportKnowledge(session.tenantId);
    return NextResponse.json({ version: current?.version || 0, title: current?.content.split('\n')[0] || null, updatedAt: current?.updatedAt ?? null, source: current?.source || null, ...(req.nextUrl.searchParams.get('includeContent') === '1' ? { content: current?.content ?? null } : {}) }, { headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
  } catch {
    return NextResponse.json({ error: 'Não foi possível consultar a configuração.' }, { status: 503 });
  }
});

export const POST = withPermission('SETTINGS_VIEW', async (req, session) => {
  if (!canManageTenantSupportKnowledge(session)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  try {
    const length = Number(req.headers.get('content-length') || 0);
    if (length > 1_200_000) return NextResponse.json({ error: 'O arquivo ultrapassa 1 MB.' }, { status: 413 });
    const data = await req.formData();
    const file = data.get('file');
    const expectedVersion = Number(data.get('expectedVersion'));
    if (!(file instanceof File) || !/\.md$/i.test(file.name)) {
      return NextResponse.json({ error: 'Envie um arquivo Markdown (.md).' }, { status: 400 });
    }
    if (file.size > 1_000_000) return NextResponse.json({ error: 'O arquivo ultrapassa 1 MB.' }, { status: 413 });
    const result = await saveTenantSupportKnowledge({
      tenantId: session.tenantId, userId: session.userId,
      filename: file.name, content: await file.text(), expectedVersion,
    });
    return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store, private' } });
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    if (code === 'SUPPORT_VERSION_CONFLICT') return NextResponse.json({ error: 'O manual mudou. Recarregue e tente novamente.' }, { status: 409 });
    if (code === 'SUPPORT_STORAGE_NOT_CONFIGURED') return NextResponse.json({ error: 'Armazenamento privado ainda não foi configurado.' }, { status: 503 });
    if (['SUPPORT_ONLY_MARKDOWN','SUPPORT_INVALID_REVISION','SUPPORT_MARKDOWN_INVALID','SUPPORT_FILE_TOO_LARGE'].includes(code)) {
      return NextResponse.json({ error: 'Arquivo ou versão inválida. Revise o .md e tente novamente.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Não foi possível anexar o manual.' }, { status: 503 });
  }
});

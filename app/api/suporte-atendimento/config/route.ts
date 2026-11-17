import { NextResponse } from 'next/server';
import { withPermission } from '@/lib/rbac-server';
import { readTenantSupportKnowledge, saveTenantSupportKnowledge, readTenantSupportActivation, saveTenantSupportActivation } from '@/lib/suporte-atendimento/tenant-knowledge';
import { canManageTenantSupportKnowledge } from '@/lib/suporte-atendimento/access';

export const dynamic = 'force-dynamic';

export const GET = withPermission('SETTINGS_VIEW', async (req, session) => {
  if (!canManageTenantSupportKnowledge(session)) return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  try {
    const [current, activation] = await Promise.all([
      readTenantSupportKnowledge(session.tenantId),
      readTenantSupportActivation(session.tenantId),
    ]);
    return NextResponse.json({
      version: current?.version || 0,
      title: current?.content.split('\n')[0] || null,
      updatedAt: current?.updatedAt ?? null,
      source: current?.source || null,
      enabled: activation.enabled,
      activationRevision: activation.revision,
      ...(req.nextUrl.searchParams.get('includeContent') === '1' ? { content: current?.content ?? null } : {}),
    }, { headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' } });
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


/** Botão liga/desliga do Proprietário. Não altera o manual nem outras empresas. */
export const PATCH = withPermission('SETTINGS_VIEW', async (req, session) => {
  if (!canManageTenantSupportKnowledge(session)) {
    return NextResponse.json({ error: 'Acesso negado.' }, { status: 403 });
  }
  if (Number(req.headers.get('content-length') || 0) > 1_024) {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 413 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Requisição inválida.' }, { status: 400 });
  }
  const input = body && typeof body === 'object' && !Array.isArray(body)
    ? body as Record<string, unknown> : {};
  if (typeof input.enabled !== 'boolean' ||
      !Number.isSafeInteger(input.expectedRevision) || (input.expectedRevision as number) < 0) {
    return NextResponse.json({ error: 'Informe o estado e a revisão atual.' }, { status: 400 });
  }
  try {
    const saved = await saveTenantSupportActivation({
      tenantId: session.tenantId,
      userId: session.userId,
      enabled: input.enabled,
      expectedRevision: input.expectedRevision as number,
    });
    return NextResponse.json(saved, {
      headers: { 'Cache-Control': 'no-store, private', 'X-Robots-Tag': 'noindex, nofollow' },
    });
  } catch (e) {
    const code = e instanceof Error ? e.message : '';
    if (code === 'SUPPORT_ACTIVATION_CONFLICT') {
      return NextResponse.json({ error: 'A configuração foi atualizada. Recarregue e tente novamente.' }, { status: 409 });
    }
    if (code === 'SUPPORT_ACTIVATION_NO_MANUAL') {
      return NextResponse.json({ error: 'Cadastre e publique um Markdown antes de ligar o Suporte.' }, { status: 409 });
    }
    if (code === 'SUPPORT_STORAGE_NOT_CONFIGURED') {
      return NextResponse.json({ error: 'Armazenamento privado ainda não está disponível.' }, { status: 503 });
    }
    if (code === 'SUPPORT_ACTIVATION_BAD_REQUEST') {
      return NextResponse.json({ error: 'Configuração inválida.' }, { status: 400 });
    }
    return NextResponse.json({ error: 'Não foi possível salvar o estado do Suporte.' }, { status: 503 });
  }
});

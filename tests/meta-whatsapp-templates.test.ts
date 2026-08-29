import assert from 'node:assert/strict';
import test from 'node:test';

process.env.JWT_SECRET_CURRENT = 'meta-whatsapp-templates-test-secret';

const { createWhatsAppMessageTemplate, listWhatsAppMessageTemplates } = await import('../lib/meta/whatsapp-templates');

test('lists templates only from the tenant-selected WABA using the server token', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.hostname, 'graph.facebook.com');
    assert.equal(url.pathname, '/v26.0/123456/message_templates');
    assert.equal(url.searchParams.get('after'), 'cursor-one');
    assert.equal(url.searchParams.get('limit'), '100');
    assert.equal(url.searchParams.get('fields'), 'id,name,status,category,language');
    assert.ok(url.searchParams.get('appsecret_proof'));
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer runtime-token');

    return new Response(JSON.stringify({
      data: [
        { id: 'tpl-1', name: 'confirmacao_atendimento', status: 'APPROVED', category: 'UTILITY', language: 'pt_BR' },
        { id: 'tpl-2', name: 'campanha_agosto', status: 'PENDING', category: 'MARKETING', language: 'pt_BR' },
      ],
      paging: { next: 'https://graph.facebook.com/next', cursors: { after: 'cursor-two' } },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  try {
    const result = await listWhatsAppMessageTemplates({
      accessToken: 'runtime-token',
      appSecret: 'app-secret',
      wabaId: '123456',
      after: 'cursor-one',
    });
    assert.equal(result.templates.length, 2);
    assert.deepEqual(result.templates[0], {
      id: 'tpl-1',
      name: 'confirmacao_atendimento',
      status: 'APPROVED',
      category: 'UTILITY',
      language: 'pt_BR',
    });
    assert.equal(result.nextCursor, 'cursor-two');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('creates a text template at the WABA endpoint and never sends credentials in the payload', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/v26.0/987654/message_templates');
    assert.equal(init?.method, 'POST');
    assert.equal((init?.headers as Record<string, string>).Authorization, 'Bearer runtime-token');
    assert.ok(url.searchParams.get('appsecret_proof'));

    const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, {
      name: 'confirmacao_atendimento',
      language: 'pt_BR',
      category: 'UTILITY',
      components: [
        { type: 'HEADER', format: 'TEXT', text: 'Atualização do atendimento' },
        { type: 'BODY', text: 'Seu atendimento recebeu uma atualização.' },
        { type: 'FOOTER', text: 'Equipe FlipForm' },
      ],
    });
    assert.equal('accessToken' in body, false);
    assert.equal('appSecret' in body, false);
    assert.equal('wabaId' in body, false);

    return new Response(JSON.stringify({ id: 'new-template-id', status: 'PENDING', category: 'UTILITY' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await createWhatsAppMessageTemplate({
      accessToken: 'runtime-token',
      appSecret: 'app-secret',
      wabaId: '987654',
      template: {
        name: 'confirmacao_atendimento',
        language: 'pt_BR',
        category: 'UTILITY',
        header: 'Atualização do atendimento',
        body: 'Seu atendimento recebeu uma atualização.',
        footer: 'Equipe FlipForm',
      },
    });
    assert.equal(result.id, 'new-template-id');
    assert.equal(result.status, 'PENDING');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('rejects variable placeholders before any request is sent', async () => {
  const previousFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    throw new Error('fetch should not be called');
  };

  try {
    await assert.rejects(
      createWhatsAppMessageTemplate({
        accessToken: 'runtime-token',
        appSecret: 'app-secret',
        wabaId: '987654',
        template: {
          name: 'confirmacao_atendimento',
          language: 'pt_BR',
          category: 'UTILITY',
          body: 'Olá, {{1}}',
        },
      }),
      /variables are not supported/i,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('preserves Meta provider status and code without leaking token data', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    error: { code: 190, type: 'OAuthException', message: 'Invalid OAuth access token.' },
  }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });

  try {
    await assert.rejects(
      listWhatsAppMessageTemplates({
        accessToken: 'runtime-token',
        appSecret: 'app-secret',
        wabaId: '123456',
      }),
      (error: any) => {
        assert.equal(error.status, 401);
        assert.equal(error.providerCode, 190);
        assert.equal(error.providerType, 'OAuthException');
        assert.equal(String(error.message).includes('runtime-token'), false);
        return true;
      },
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { instagramImageNote, instagramMediaUrl } from '../lib/instagram-ai/image-rules';

test('só endereços https dos servidores da Meta são aceitos', () => {
  assert.equal(instagramMediaUrl('https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1&signature=x'), 'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1&signature=x');
  assert.ok(instagramMediaUrl('https://scontent.xx.fbcdn.net/v/t1/a.jpg'));
  assert.ok(instagramMediaUrl('https://scontent.cdninstagram.com/a.jpg'));
  for (const bad of ['http://lookaside.fbsbx.com/a', 'https://evilfbcdn.net/a', 'https://fbcdn.net.evil.com/a', 'https://user:pw@scontent.fbcdn.net/a', 'https://scontent.fbcdn.net:8443/a', 'https://169.254.169.254/latest', 'javascript:alert(1)', '', null, 42]) {
    assert.equal(instagramMediaUrl(bad), null, String(bad));
  }
});

test('a nota diz o que aparece, ou pede para a pessoa contar', () => {
  assert.match(instagramImageNote('Print de uma conversa no WhatsApp.'), /O que aparece nela: Print de uma conversa no WhatsApp\./);
  assert.match(instagramImageNote(null), /não foi possível ver o conteúdo/);
});

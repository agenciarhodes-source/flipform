import assert from 'node:assert/strict';
import test from 'node:test';

import { CONTACT_AVATAR_COLOR_COUNT, contactAvatarColorIndex, contactInitials } from '../lib/inbox/contact-avatar';

test('as iniciais vêm do nome, sem acento e sem letras estilizadas', () => {
  assert.equal(contactInitials('Lucineide dos santos Azevedo'), 'LA');
  assert.equal(contactInitials('Mônica'), 'MO');
  assert.equal(contactInitials('\u{1D483}\u{1D486}\u{1D48D}\u{1D482}'), 'BE');
  assert.equal(contactInitials('  Ana  ❤️ Paula '), 'AP');
  assert.equal(contactInitials('558487780932'), '32');
  assert.equal(contactInitials(''), '?');
});

test('o mesmo contato tem sempre a mesma cor', () => {
  assert.equal(contactAvatarColorIndex('identity-1'), contactAvatarColorIndex('identity-1'));
  for (const key of ['a', 'identity-2', '', 'cm0xyz123']) {
    const index = contactAvatarColorIndex(key);
    assert.ok(Number.isInteger(index) && index >= 0 && index < CONTACT_AVATAR_COLOR_COUNT);
  }
});

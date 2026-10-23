/**
 * Names heard in a voice note can come out of the transcription with a wrong spelling
 * ("Eunice" -> "Eunício"). When a heard name is almost the name the company already has
 * (WhatsApp profile or registration), the known spelling wins. Global for every company.
 */

function plain(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let previous = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const current = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length];
}

/** The first names the company already knows for this person, written normally. */
export function knownFirstNames(names: Array<string | null | undefined>) {
  const result: string[] = [];
  for (const name of names) {
    const first = (name || '').replace(/[^\p{L}\p{M}\s'-]/gu, ' ').trim().split(/\s+/)[0] || '';
    if (first.length < 3) continue;
    const written = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
    if (!result.some((item) => plain(item) === plain(written))) result.push(written);
  }
  return result;
}

/** The known name a heard word stands for, or null when it is another word or another name. */
export function matchKnownName(word: string, known: string[], samePrefix = 3) {
  const heard = plain(word);
  if (heard.length < 4) return null;
  for (const name of known) {
    const target = plain(name);
    if (target.length < 4) continue;
    if (heard === target) return name;
    // Paulo / Paula, Fernando / Fernanda: two people, never a spelling slip.
    if (heard.slice(0, -1) === target.slice(0, -1) && /[ao]/.test(heard.slice(-1)) && /[ao]/.test(target.slice(-1))) continue;
    // Same start, about the same size and few letters apart: a spelling slip, not another name
    // ("Eunício" is "Eunice"; "Mariana" is not "Maria"). Short names allow one letter only.
    const allowed = target.length >= 6 ? 2 : 1;
    if (heard.slice(0, samePrefix) === target.slice(0, samePrefix)
      && Math.abs(heard.length - target.length) <= 1
      && distance(heard, target) <= allowed) return name;
  }
  return null;
}

/** A name the person gave (or the AI read), with the known spelling when it is the same name. */
export function alignNameSpelling(name: string | null | undefined, known: string[]) {
  const clean = (name || '').trim();
  if (!clean || !known.length) return clean || null;
  const words = clean.split(/\s+/);
  const first = matchKnownName(words[0], known);
  if (!first) return clean;
  return [first, ...words.slice(1)].join(' ');
}

/**
 * A voice-note transcript with the known names spelled the known way. Only capitalised words
 * that share the first four letters change, so ordinary words ("Estava" / "Estela") stay.
 */
export function alignTranscriptNames(text: string, known: string[]) {
  if (!known.length) return text;
  return text.replace(/\p{Lu}[\p{L}\p{M}]{3,}/gu, (word) => matchKnownName(word, known, 4) || word);
}

/** A hint for the transcription, so the names are spelled right from the start. */
export function transcriptionHint(known: string[]) {
  return known.length ? `Mensagem de voz no WhatsApp. Nome do cliente: ${known.join(', ')}.` : '';
}

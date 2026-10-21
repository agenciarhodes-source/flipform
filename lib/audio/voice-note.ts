/**
 * Prepares a voice note recorded in the browser for WhatsApp.
 * WhatsApp shows a voice message only for OGG files with the Opus codec. Chrome records WebM with
 * the same Opus audio, so the audio is moved from the WebM container to an OGG one without being
 * re-encoded (no quality loss, no external tools). Firefox already records OGG/Opus; Safari records
 * MP4/AAC, which WhatsApp accepts as an audio file.
 */

export class VoiceNoteError extends Error {
  constructor(readonly code: 'UNSUPPORTED_FORMAT' | 'INVALID_FILE' | 'EMPTY') {
    super(code);
    this.name = 'VoiceNoteError';
  }
}

export type PreparedVoiceNote = { bytes: Uint8Array; mimeType: string; voice: boolean; extension: string };

export function detectAudioFormat(bytes: Uint8Array): 'webm' | 'ogg' | 'mp4' | 'mpeg' | null {
  if (bytes.length < 12) return null;
  if (bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) return 'webm';
  if (bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'ogg';
  if (bytes[4] === 0x66 && bytes[5] === 0x74 && bytes[6] === 0x79 && bytes[7] === 0x70) return 'mp4';
  if ((bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) return 'mpeg';
  return null;
}

export function prepareVoiceNote(bytes: Uint8Array): PreparedVoiceNote {
  const format = detectAudioFormat(bytes);
  if (format === 'webm') return { bytes: webmOpusToOgg(bytes), mimeType: 'audio/ogg', voice: true, extension: 'ogg' };
  if (format === 'ogg') return { bytes, mimeType: 'audio/ogg', voice: true, extension: 'ogg' };
  if (format === 'mp4') return { bytes, mimeType: 'audio/mp4', voice: false, extension: 'm4a' };
  if (format === 'mpeg') return { bytes, mimeType: 'audio/mpeg', voice: false, extension: 'mp3' };
  throw new VoiceNoteError('UNSUPPORTED_FORMAT');
}

// ---------------------------------------------------------------- WebM (Matroska) reading

const ID_SEGMENT = 0x18538067;
const ID_CLUSTER = 0x1f43b675;
const ID_TRACKS = 0x1654ae6b;
const ID_TRACK_ENTRY = 0xae;
const ID_AUDIO = 0xe1;
const ID_BLOCK_GROUP = 0xa0;
const ID_SIMPLE_BLOCK = 0xa3;
const ID_BLOCK = 0xa1;
const ID_CODEC_ID = 0x86;
const ID_CODEC_PRIVATE = 0x63a2;
const ID_CHANNELS = 0x9f;
const MASTER_IDS = new Set([ID_SEGMENT, ID_CLUSTER, ID_TRACKS, ID_TRACK_ENTRY, ID_AUDIO, ID_BLOCK_GROUP]);

function readVint(bytes: Uint8Array, pos: number, keepMarker: boolean) {
  if (pos >= bytes.length) throw new VoiceNoteError('INVALID_FILE');
  const first = bytes[pos];
  if (first === 0) throw new VoiceNoteError('INVALID_FILE');
  let length = 1;
  let mask = 0x80;
  while (!(first & mask)) { mask >>= 1; length += 1; }
  if (pos + length > bytes.length) throw new VoiceNoteError('INVALID_FILE');
  let value = keepMarker ? first : first & (mask - 1);
  let allOnes = (first & (mask - 1)) === mask - 1;
  for (let i = 1; i < length; i += 1) {
    value = value * 256 + bytes[pos + i];
    if (bytes[pos + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

/** The frames of one Matroska block (with Xiph, fixed or EBML lacing). */
function blockFrames(data: Uint8Array): Uint8Array[] {
  const track = readVint(data, 0, false);
  let pos = track.length + 2; // track number + 16-bit relative time
  const flags = data[pos];
  pos += 1;
  const lacing = (flags >> 1) & 0x03;
  if (lacing === 0) return [data.subarray(pos)];
  const count = data[pos] + 1;
  pos += 1;
  const sizes: number[] = [];
  if (lacing === 1) {
    for (let i = 0; i < count - 1; i += 1) {
      let size = 0;
      let byte = 255;
      while (byte === 255) { byte = data[pos]; pos += 1; size += byte; }
      sizes.push(size);
    }
  } else if (lacing === 3) {
    const first = readVint(data, pos, false);
    pos += first.length;
    sizes.push(first.value);
    for (let i = 1; i < count - 1; i += 1) {
      const raw = readVint(data, pos, false);
      pos += raw.length;
      const bias = 2 ** (7 * raw.length - 1) - 1;
      sizes.push(sizes[i - 1] + raw.value - bias);
    }
  }
  const frames: Uint8Array[] = [];
  if (lacing === 2) {
    const size = Math.floor((data.length - pos) / count);
    for (let i = 0; i < count; i += 1) frames.push(data.subarray(pos + i * size, pos + (i + 1) * size));
    return frames;
  }
  for (const size of sizes) { frames.push(data.subarray(pos, pos + size)); pos += size; }
  frames.push(data.subarray(pos));
  return frames;
}

export function readWebmOpus(bytes: Uint8Array) {
  const state = { codecId: '', codecPrivate: null as Uint8Array | null, channels: 1, packets: [] as Uint8Array[] };
  const walk = (start: number, end: number) => {
    let pos = start;
    while (pos < end) {
      if (end - pos < 2) break;
      const id = readVint(bytes, pos, true);
      pos += id.length;
      const size = readVint(bytes, pos, false);
      pos += size.length;
      const dataEnd = size.unknown ? end : Math.min(pos + size.value, end);
      if (MASTER_IDS.has(id.value)) {
        walk(pos, dataEnd);
      } else if (id.value === ID_SIMPLE_BLOCK || id.value === ID_BLOCK) {
        for (const frame of blockFrames(bytes.subarray(pos, dataEnd))) if (frame.length) state.packets.push(frame);
      } else if (id.value === ID_CODEC_ID) {
        state.codecId = new TextDecoder().decode(bytes.subarray(pos, dataEnd));
      } else if (id.value === ID_CODEC_PRIVATE) {
        state.codecPrivate = bytes.subarray(pos, dataEnd);
      } else if (id.value === ID_CHANNELS) {
        let channels = 0;
        for (let i = pos; i < dataEnd; i += 1) channels = channels * 256 + bytes[i];
        if (channels > 0 && channels <= 2) state.channels = channels;
      }
      pos = dataEnd;
    }
  };
  walk(0, bytes.length);
  return state;
}

// ---------------------------------------------------------------- OGG (Opus) writing

/** Number of 48 kHz samples in one Opus packet, from its TOC byte (RFC 6716). */
export function opusPacketSamples(packet: Uint8Array) {
  if (!packet.length) return 0;
  const toc = packet[0];
  const config = toc >> 3;
  const frameSize = config < 12 ? [480, 960, 1920, 2880][config % 4]
    : config < 16 ? [480, 960][config % 2]
      : [120, 240, 480, 960][config % 4];
  const code = toc & 0x03;
  const frames = code === 0 ? 1 : code === 3 ? (packet[1] || 0) & 0x3f : 2;
  return frameSize * frames;
}

let CRC_TABLE: Uint32Array | null = null;
function oggCrc(data: Uint8Array) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let i = 0; i < 256; i += 1) {
      let r = i << 24;
      for (let j = 0; j < 8; j += 1) r = r & 0x80000000 ? ((r << 1) ^ 0x04c11db7) : (r << 1);
      CRC_TABLE[i] = r >>> 0;
    }
  }
  let crc = 0;
  for (let i = 0; i < data.length; i += 1) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ data[i]) & 0xff]) >>> 0;
  return crc >>> 0;
}

function oggPage(packets: Uint8Array[], granule: number, serial: number, sequence: number, headerType: number) {
  const segments: number[] = [];
  for (const packet of packets) {
    let left = packet.length;
    while (left >= 255) { segments.push(255); left -= 255; }
    segments.push(left);
  }
  const bodyLength = packets.reduce((sum, packet) => sum + packet.length, 0);
  const page = new Uint8Array(27 + segments.length + bodyLength);
  const view = new DataView(page.buffer);
  page.set([0x4f, 0x67, 0x67, 0x53], 0);
  page[4] = 0;
  page[5] = headerType;
  view.setUint32(6, granule % 0x100000000, true);
  view.setUint32(10, Math.floor(granule / 0x100000000), true);
  view.setUint32(14, serial, true);
  view.setUint32(18, sequence, true);
  page[26] = segments.length;
  page.set(segments, 27);
  let offset = 27 + segments.length;
  for (const packet of packets) { page.set(packet, offset); offset += packet.length; }
  view.setUint32(22, oggCrc(page), true);
  return page;
}

function opusHead(channels: number) {
  const head = new Uint8Array(19);
  const view = new DataView(head.buffer);
  head.set(new TextEncoder().encode('OpusHead'), 0);
  head[8] = 1;
  head[9] = channels;
  view.setUint16(10, 312, true); // pre-skip
  view.setUint32(12, 48_000, true);
  view.setUint16(16, 0, true);
  head[18] = 0;
  return head;
}

function opusTags() {
  const vendor = new TextEncoder().encode('FlipForm');
  const tags = new Uint8Array(8 + 4 + vendor.length + 4);
  const view = new DataView(tags.buffer);
  tags.set(new TextEncoder().encode('OpusTags'), 0);
  view.setUint32(8, vendor.length, true);
  tags.set(vendor, 12);
  view.setUint32(12 + vendor.length, 0, true);
  return tags;
}

/** Moves the Opus audio of a WebM recording into an OGG file, without re-encoding. */
export function webmOpusToOgg(bytes: Uint8Array): Uint8Array {
  const webm = readWebmOpus(bytes);
  if (webm.codecId && webm.codecId !== 'A_OPUS') throw new VoiceNoteError('UNSUPPORTED_FORMAT');
  if (!webm.packets.length) throw new VoiceNoteError('EMPTY');
  const head = webm.codecPrivate && new TextDecoder().decode(webm.codecPrivate.subarray(0, 8)) === 'OpusHead'
    ? webm.codecPrivate : opusHead(webm.channels);
  const serial = 0x464c4950; // "FLIP"
  const pages: Uint8Array[] = [oggPage([head], 0, serial, 0, 0x02), oggPage([opusTags()], 0, serial, 1, 0)];
  let sequence = 2;
  let granule = 0;
  let batch: Uint8Array[] = [];
  let batchSegments = 0;
  let batchBytes = 0;
  const flush = (last: boolean) => {
    if (!batch.length) return;
    pages.push(oggPage(batch, granule, serial, sequence, last ? 0x04 : 0));
    sequence += 1;
    batch = [];
    batchSegments = 0;
    batchBytes = 0;
  };
  for (const [index, packet] of webm.packets.entries()) {
    const segments = Math.floor(packet.length / 255) + 1;
    if (batch.length && (batchSegments + segments > 255 || batchBytes + packet.length > 4_000)) flush(false);
    batch.push(packet);
    batchSegments += segments;
    batchBytes += packet.length;
    granule += opusPacketSamples(packet);
    if (index === webm.packets.length - 1) flush(true);
  }
  const total = pages.reduce((sum, page) => sum + page.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const page of pages) { out.set(page, offset); offset += page.length; }
  return out;
}

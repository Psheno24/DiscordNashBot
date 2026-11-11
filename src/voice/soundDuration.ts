/** Discord не отдаёт длительность саундборда и не шлёт событие «звук закончился». Длина есть в самом файле. */

const TAIL_MS = 250;
const FALLBACK_HOLD_MS = 5_000;
const MAX_HOLD_MS = 12_000;

const holdCache = new Map<string, number>();

const V1_L1 = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0];
const V1_L2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0];
const V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
const V2_L1 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0];
const V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];

export function audioDurationMs(buf: Buffer): number | null {
  if (buf.length >= 4 && buf.toString("latin1", 0, 4) === "OggS") return oggDurationMs(buf);
  return mp3DurationMs(buf);
}

/** Сколько ещё держать бота в канале после того, как Discord принял звук. */
export async function joinSoundHoldMs(sound: { soundId: string; url: string }): Promise<number> {
  const hit = holdCache.get(sound.soundId);
  if (hit) return hit;
  try {
    const res = await fetch(sound.url, { signal: AbortSignal.timeout(4_000) });
    if (!res.ok) return FALLBACK_HOLD_MS;
    const len = Number(res.headers.get("content-length") ?? 0);
    if (len > 1_000_000) return FALLBACK_HOLD_MS;
    const buf = Buffer.from(await res.arrayBuffer());
    const ms = audioDurationMs(buf);
    if (ms == null || ms < 150 || ms > MAX_HOLD_MS) return FALLBACK_HOLD_MS;
    const hold = Math.min(MAX_HOLD_MS, ms + TAIL_MS);
    holdCache.set(sound.soundId, hold);
    return hold;
  } catch {
    return FALLBACK_HOLD_MS;
  }
}

function mp3DurationMs(buf: Buffer): number | null {
  let offset = 0;
  if (buf.length >= 10 && buf.toString("latin1", 0, 3) === "ID3") {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f);
    offset = 10 + size;
    if ((buf[5] & 0x10) !== 0) offset += 10;
  }
  let samples = 0;
  let rate = 0;
  let frames = 0;
  while (offset + 4 <= buf.length && frames < 10_000) {
    if (buf[offset] !== 0xff || (buf[offset + 1] & 0xe0) !== 0xe0) {
      offset += 1;
      continue;
    }
    const b1 = buf[offset + 1];
    const b2 = buf[offset + 2];
    const version = (b1 >> 3) & 0x3;
    const layer = (b1 >> 1) & 0x3;
    const bitrateIdx = (b2 >> 4) & 0xf;
    const srIdx = (b2 >> 2) & 0x3;
    const padding = (b2 >> 1) & 0x1;
    if (version === 1 || layer === 0 || bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) {
      offset += 1;
      continue;
    }
    const mpeg1 = version === 3;
    const sampleRate = (mpeg1 ? [44100, 48000, 32000] : version === 2 ? [22050, 24000, 16000] : [11025, 12000, 8000])[srIdx];
    const kbps = (mpeg1 ? (layer === 3 ? V1_L1 : layer === 2 ? V1_L2 : V1_L3) : layer === 3 ? V2_L1 : V2_L3)[bitrateIdx];
    const spf = mpeg1 ? (layer === 3 ? 384 : 1152) : layer === 3 ? 384 : layer === 2 ? 1152 : 576;
    const frameLen =
      layer === 3
        ? Math.floor((12 * kbps * 1000) / sampleRate + padding) * 4
        : Math.floor(((spf / 8) * kbps * 1000) / sampleRate + padding);
    if (frameLen < 4) {
      offset += 1;
      continue;
    }
    if (offset + frameLen > buf.length) break;
    if (rate === 0) rate = sampleRate;
    samples += spf;
    frames += 1;
    offset += frameLen;
  }
  if (frames < 2 || rate === 0) return null;
  return Math.round((samples / rate) * 1000);
}

function oggDurationMs(buf: Buffer): number | null {
  let sampleRate = 0;
  let granule = 0;
  let offset = 0;
  while (offset + 27 <= buf.length) {
    if (buf.toString("latin1", offset, offset + 4) !== "OggS") break;
    const gran = Number(buf.readBigInt64LE(offset + 6));
    if (gran > 0) granule = gran;
    const segs = buf[offset + 26];
    if (offset + 27 + segs > buf.length) break;
    const body = offset + 27 + segs;
    let pageLen = 27 + segs;
    for (let i = 0; i < segs; i += 1) pageLen += buf[offset + 27 + i];
    if (pageLen < 27 || offset + pageLen > buf.length) break;
    if (sampleRate === 0 && body + 16 <= buf.length && buf.toString("latin1", body + 1, body + 7) === "vorbis") {
      sampleRate = buf.readUInt32LE(body + 12);
    }
    offset += pageLen;
  }
  if (sampleRate <= 0 || granule <= 0) return null;
  return Math.round((granule / sampleRate) * 1000);
}

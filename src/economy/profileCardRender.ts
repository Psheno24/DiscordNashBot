import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import { buildProfileCardContent, type ProfileCardContent } from "./profileCardData.js";
import type { ProfileFrameColorId } from "./profileThemes.js";
import { getEconomyUser } from "./userStore.js";
import type { GuildMember } from "discord.js";

/** Как изначально (Discord сам масштабирует превью). */
const W = 820;
const H = 420;

const FONT_NAME = 30;
const FONT_BODY = 19;
const FONT_SMALL = 13;
const FONT_BADGE = 14;
const FONT_WATERMARK = 52;
const MIN_FONT_NAME = 22;
const MIN_FONT_BODY = 13;

const AVATAR_SIZE = 140;
const AVATAR_X = 32;
const AVATAR_Y = 108;
const TEXT_X = 188;
const LINE_H = 24;
const GAP_SECTION = 8;
const TEXT_RIGHT_PAD = 28;
const BODY_BOTTOM_PAD = 56;

const FONT_FAMILY = "ProfileDejaVu";

export type ProfileCardRenderOptions = {
  previewFrameColorId?: ProfileFrameColorId;
  watermark?: boolean;
};

let fontsReady = false;

function ensureFonts(): void {
  if (fontsReady) return;
  const require = createRequire(import.meta.url);
  const fontPath = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
  const fontBold = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");
  GlobalFonts.registerFromPath(fontPath, FONT_FAMILY);
  GlobalFonts.registerFromPath(fontBold, `${FONT_FAMILY}Bold`);
  fontsReady = true;
}

function drawRoundedRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawAvatar(ctx: SKRSContext2D, img: Image, x: number, y: number, size: number): void {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
  ctx.strokeStyle = "#ffffff44";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, r - 2, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTopBadge(ctx: SKRSContext2D, text: string, x: number, y: number, fill: string, stroke: string): void {
  ctx.font = `bold ${FONT_BADGE}px "${FONT_FAMILY}Bold"`;
  const padX = 10;
  const tw = ctx.measureText(text).width;
  const bw = tw + padX * 2;
  const bh = 24;
  drawRoundedRect(ctx, x, y, bw, bh, 6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#0a0a0a";
  ctx.fillText(text, x + padX, y + 17);
}

function topBadgeXRange(content: ProfileCardContent): { minX: number; maxX: number } | undefined {
  const ranges: Array<{ minX: number; maxX: number }> = [];
  if (content.isTopRub) ranges.push({ minX: W - 158, maxX: W - 158 + 98 });
  if (content.isTopPs) {
    const bx = content.isTopRub ? W - 158 : W - 148;
    ranges.push({ minX: bx, maxX: bx + 100 });
  }
  if (ranges.length === 0) return undefined;
  return {
    minX: Math.min(...ranges.map((r) => r.minX)),
    maxX: Math.max(...ranges.map((r) => r.maxX)),
  };
}

function fitTextToWidth(ctx: SKRSContext2D, input: string, maxWidth: number): string {
  if (maxWidth <= 0) return "";
  if (ctx.measureText(input).width <= maxWidth) return input;
  const ellipsis = "…";
  const ellipsisWidth = ctx.measureText(ellipsis).width;
  if (ellipsisWidth > maxWidth) return "";
  let lo = 0;
  let hi = input.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const candidate = `${input.slice(0, mid)}${ellipsis}`;
    if (ctx.measureText(candidate).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return `${input.slice(0, lo)}${ellipsis}`;
}

function splitTokenToWidth(ctx: SKRSContext2D, token: string, maxWidth: number): string[] {
  const chars = Array.from(token);
  const out: string[] = [];
  let chunk = "";
  for (const ch of chars) {
    const candidate = `${chunk}${ch}`;
    if (chunk.length === 0 || ctx.measureText(candidate).width <= maxWidth) {
      chunk = candidate;
      continue;
    }
    out.push(chunk);
    chunk = ch;
  }
  if (chunk.length > 0) out.push(chunk);
  return out;
}

function wrapTextToWidth(ctx: SKRSContext2D, text: string, maxWidth: number): string[] {
  if (maxWidth <= 0) return [""];
  if (ctx.measureText(text).width <= maxWidth) return [text];
  const words = text.trim().split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) lines.push(current);
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      continue;
    }
    const parts = splitTokenToWidth(ctx, word, maxWidth);
    for (let i = 0; i < parts.length - 1; i += 1) lines.push(parts[i] ?? "");
    current = parts[parts.length - 1] ?? "";
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [fitTextToWidth(ctx, text, maxWidth)];
}

type BodyRow = { text: string; source: string; isGap: boolean };

function buildBodyRows(ctx: SKRSContext2D, lines: string[], maxWidth: number): BodyRow[] {
  const rows: BodyRow[] = [];
  for (const source of lines) {
    if (source === "") {
      rows.push({ text: "", source, isGap: true });
      continue;
    }
    const wrapped = wrapTextToWidth(ctx, source, maxWidth);
    for (const piece of wrapped) rows.push({ text: piece, source, isGap: false });
  }
  return rows;
}

function bodyLayoutHeight(rows: BodyRow[], lineHeight: number, gapHeight: number): number {
  return rows.reduce((sum, row) => sum + (row.isGap ? gapHeight : lineHeight), 0);
}

function drawFrameEffects(ctx: SKRSContext2D, content: ProfileCardContent, accent: string): void {
  const pad = 8;
  drawRoundedRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 14);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.stroke();

  if (content.isTopRub) {
    drawTopBadge(ctx, "★ TOP ₽", W - 158, 16, "#ffd700cc", "#ffd700");
  }
  if (content.isTopPs) {
    const bx = content.isTopRub ? W - 158 : W - 148;
    const by = content.isTopRub ? 44 : 16;
    drawTopBadge(ctx, "★ TOP СР", bx, by, "#00e5ffcc", "#00e5ff");
  }
}

function drawWatermark(ctx: SKRSContext2D, accent: string): void {
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.font = `bold ${FONT_WATERMARK}px "${FONT_FAMILY}Bold"`;
  ctx.fillStyle = accent;
  ctx.textAlign = "center";
  ctx.translate(W / 2, H / 2);
  ctx.rotate(-0.32);
  ctx.fillText("ПРЕВЬЮ", 0, 0);
  ctx.restore();
  ctx.textAlign = "start";
}

async function fetchAvatar(url: string): Promise<Image> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`avatar fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return loadImage(buf);
}

export async function renderProfileCardPng(
  member: GuildMember,
  options: ProfileCardRenderOptions = {},
): Promise<Buffer> {
  ensureFonts();
  const u = getEconomyUser(member.guild.id, member.id);
  const content = buildProfileCardContent(member, u, undefined, options.previewFrameColorId);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0e0e12";
  ctx.fillRect(0, 0, W, H);

  drawRoundedRect(ctx, 12, 12, W - 24, H - 24, 12);
  ctx.fillStyle = content.background;
  ctx.fill();

  drawFrameEffects(ctx, content, content.accent);

  try {
    const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 256 });
    const avatar = await fetchAvatar(avatarUrl);
    drawAvatar(ctx, avatar, AVATAR_X, AVATAR_Y, AVATAR_SIZE);
  } catch {
    ctx.fillStyle = "#333";
    drawRoundedRect(ctx, AVATAR_X, AVATAR_Y, AVATAR_SIZE, AVATAR_SIZE, AVATAR_SIZE / 2);
    ctx.fill();
    ctx.fillStyle = "#888";
    ctx.font = `${FONT_BODY}px "${FONT_FAMILY}"`;
    ctx.fillText("нет фото", AVATAR_X + 36, AVATAR_Y + 76);
  }

  let y = 50;
  ctx.fillStyle = "#f0f0f0";
  const badgeRange = topBadgeXRange(content);
  const nameRightEdge = badgeRange ? badgeRange.minX - 14 : W - 12;
  const nameMaxWidth = Math.max(0, nameRightEdge - TEXT_X);
  let nameFontSize = FONT_NAME;
  for (let size = FONT_NAME; size >= MIN_FONT_NAME; size -= 1) {
    ctx.font = `bold ${size}px "${FONT_FAMILY}Bold"`;
    if (ctx.measureText(content.displayName).width <= nameMaxWidth) {
      nameFontSize = size;
      break;
    }
    nameFontSize = size;
  }
  ctx.font = `bold ${nameFontSize}px "${FONT_FAMILY}Bold"`;
  const nameText =
    ctx.measureText(content.displayName).width <= nameMaxWidth
      ? content.displayName
      : fitTextToWidth(ctx, content.displayName, nameMaxWidth);
  ctx.fillText(nameText, TEXT_X, y);

  y += Math.round(nameFontSize * 1.12);
  const bodyMaxWidth = Math.max(0, W - TEXT_X - TEXT_RIGHT_PAD);
  const bodyMaxHeight = H - BODY_BOTTOM_PAD - y;
  const bodyLineCandidates = [FONT_BODY, FONT_BODY - 1, FONT_BODY - 2, FONT_BODY - 3, FONT_BODY - 4, FONT_BODY - 5]
    .filter((v, i, arr) => v >= MIN_FONT_BODY && arr.indexOf(v) === i);
  let bodyFontSize = FONT_BODY;
  let lineHeight = LINE_H;
  let gapHeight = GAP_SECTION;
  let bodyRows: BodyRow[] = [];
  for (const size of bodyLineCandidates) {
    ctx.font = `${size}px "${FONT_FAMILY}"`;
    const candidateRows = buildBodyRows(ctx, content.lines, bodyMaxWidth);
    const candidateLineHeight = Math.max(16, Math.round(size * 1.22));
    const candidateGapHeight = Math.max(6, Math.round(candidateLineHeight * 0.33));
    const h = bodyLayoutHeight(candidateRows, candidateLineHeight, candidateGapHeight);
    bodyFontSize = size;
    lineHeight = candidateLineHeight;
    gapHeight = candidateGapHeight;
    bodyRows = candidateRows;
    if (h <= bodyMaxHeight) break;
  }
  ctx.font = `${bodyFontSize}px "${FONT_FAMILY}"`;
  let consumed = 0;
  for (let i = 0; i < bodyRows.length; i += 1) {
    const row = bodyRows[i];
    const step = row.isGap ? gapHeight : lineHeight;
    if (consumed + step > bodyMaxHeight) break;
    if (row.isGap) {
      y += step;
      consumed += step;
      continue;
    }
    ctx.fillStyle = row.source.startsWith("СР:") || row.source.startsWith("₽:") ? content.accent : "#d0d0d8";
    if (row.source.startsWith("Престиж:") || row.source.startsWith("Быт:")) ctx.fillStyle = "#e8e8f0";
    ctx.fillText(row.text, TEXT_X, y);
    y += step;
    consumed += step;
  }

  ctx.fillStyle = "#ffffff55";
  ctx.font = `${FONT_SMALL}px "${FONT_FAMILY}"`;
  ctx.fillText("НЕЙРОКОМ · досье", 20, H - 22);

  if (options.watermark) {
    drawWatermark(ctx, content.accent);
  }

  return canvas.toBuffer("image/png");
}

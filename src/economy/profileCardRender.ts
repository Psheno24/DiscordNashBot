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
  ctx.font = `bold ${FONT_NAME}px "${FONT_FAMILY}Bold"`;
  const badgeRange = topBadgeXRange(content);
  const nameRightEdge = badgeRange ? badgeRange.minX - 14 : W - 12;
  const nameMaxWidth = Math.max(0, nameRightEdge - TEXT_X);
  ctx.fillText(fitTextToWidth(ctx, content.displayName, nameMaxWidth), TEXT_X, y);

  y += 34;
  ctx.font = `${FONT_BODY}px "${FONT_FAMILY}"`;
  const bodyMaxWidth = Math.max(0, W - TEXT_X - TEXT_RIGHT_PAD);
  const bodyBottomY = H - BODY_BOTTOM_PAD;
  for (let i = 0; i < content.lines.length; i += 1) {
    const line = content.lines[i];
    if (line === "") {
      y += GAP_SECTION;
      continue;
    }
    if (y > bodyBottomY) break;
    ctx.fillStyle = line.startsWith("СР:") || line.startsWith("₽:") ? content.accent : "#d0d0d8";
    if (line.startsWith("Престиж:") || line.startsWith("Быт:")) ctx.fillStyle = "#e8e8f0";
    const hasMoreBodyLines = content.lines.slice(i + 1).some((v) => v !== "");
    const text = hasMoreBodyLines && y + LINE_H > bodyBottomY ? "…" : fitTextToWidth(ctx, line, bodyMaxWidth);
    ctx.fillText(text, TEXT_X, y);
    if (text === "…") break;
    y += LINE_H;
  }

  ctx.fillStyle = "#ffffff55";
  ctx.font = `${FONT_SMALL}px "${FONT_FAMILY}"`;
  ctx.fillText("НЕЙРОКОМ · досье", 20, H - 22);

  if (options.watermark) {
    drawWatermark(ctx, content.accent);
  }

  return canvas.toBuffer("image/png");
}

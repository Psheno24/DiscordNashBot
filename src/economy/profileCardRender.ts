import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import { buildProfileCardContent, type ProfileCardContent } from "./profileCardData.js";
import type { ProfileFrameColorId } from "./profileThemes.js";
import { getEconomyUser } from "./userStore.js";
import type { GuildMember } from "discord.js";

/** 2× для чёткого текста в превью Discord. */
const SCALE = 2;
const s = (n: number) => Math.round(n * SCALE);

const W = s(820);
const H = s(420);
const FONT_FAMILY = "ProfileDejaVu";

export type ProfileCardRenderOptions = {
  /** Цвет рамки для примерки (без сохранения). */
  previewColorId?: ProfileFrameColorId;
  /** Водяной знак «ПРЕВЬЮ» (пример до покупки). */
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
  ctx.arc(cx, cy, r - s(2), 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();
  ctx.drawImage(img, x, y, size, size);
  ctx.restore();
  ctx.strokeStyle = "#ffffff44";
  ctx.lineWidth = s(2);
  ctx.beginPath();
  ctx.arc(cx, cy, r - s(2), 0, Math.PI * 2);
  ctx.stroke();
}

function drawTopBadge(ctx: SKRSContext2D, text: string, x: number, y: number, fill: string, stroke: string): void {
  ctx.font = `bold ${s(13)}px "${FONT_FAMILY}Bold"`;
  const padX = s(10);
  const tw = ctx.measureText(text).width;
  const bw = tw + padX * 2;
  const bh = s(22);
  drawRoundedRect(ctx, x, y, bw, bh, s(6));
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = s(2);
  ctx.stroke();
  ctx.fillStyle = "#0a0a0a";
  ctx.fillText(text, x + padX, y + s(16));
}

function drawFrameEffects(ctx: SKRSContext2D, content: ProfileCardContent, accent: string): void {
  const pad = s(8);
  drawRoundedRect(ctx, pad, pad, W - pad * 2, H - pad * 2, s(14));
  ctx.strokeStyle = accent;
  ctx.lineWidth = s(4);
  ctx.stroke();

  if (content.isTopRub) {
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = s(5);
    drawRoundedRect(ctx, pad - s(2), pad - s(2), W - pad * 2 + s(4), H - pad * 2 + s(4), s(16));
    ctx.stroke();
    drawTopBadge(ctx, "★ TOP ₽", W - s(150), s(18), "#ffd700cc", "#ffd700");
  }
  if (content.isTopPs) {
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = content.isTopRub ? s(3) : s(5);
    if (!content.isTopRub) {
      drawRoundedRect(ctx, pad - s(2), pad - s(2), W - pad * 2 + s(4), H - pad * 2 + s(4), s(16));
      ctx.stroke();
    }
    const bx = content.isTopRub ? W - s(150) : W - s(140);
    const by = content.isTopRub ? s(46) : s(18);
    drawTopBadge(ctx, "★ TOP СР", bx, by, "#00e5ffcc", "#00e5ff");
  }
}

function drawWatermark(ctx: SKRSContext2D, accent: string): void {
  ctx.save();
  ctx.globalAlpha = 0.38;
  ctx.font = `bold ${s(56)}px "${FONT_FAMILY}Bold"`;
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
  const content = buildProfileCardContent(member, u, undefined, options.previewColorId);
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext("2d");

  ctx.fillStyle = "#0e0e12";
  ctx.fillRect(0, 0, W, H);

  drawRoundedRect(ctx, s(12), s(12), W - s(24), H - s(24), s(12));
  ctx.fillStyle = content.background;
  ctx.fill();

  drawFrameEffects(ctx, content, content.accent);

  try {
    const avatarUrl = member.user.displayAvatarURL({ extension: "png", size: 512 });
    const avatar = await fetchAvatar(avatarUrl);
    drawAvatar(ctx, avatar, s(36), s(118), s(132));
  } catch {
    ctx.fillStyle = "#333";
    drawRoundedRect(ctx, s(36), s(118), s(132), s(132), s(66));
    ctx.fill();
    ctx.fillStyle = "#888";
    ctx.font = `${s(14)}px "${FONT_FAMILY}"`;
    ctx.fillText("нет фото", s(62), s(188));
  }

  const textX = s(196);
  let y = s(56);
  ctx.fillStyle = "#f0f0f0";
  ctx.font = `bold ${s(24)}px "${FONT_FAMILY}Bold"`;
  ctx.fillText(content.displayName, textX, y);

  y += s(36);
  ctx.font = `${s(16)}px "${FONT_FAMILY}"`;
  for (const line of content.lines) {
    if (line === "") {
      y += s(10);
      continue;
    }
    ctx.fillStyle = line.startsWith("СР:") || line.startsWith("₽:") ? content.accent : "#d0d0d8";
    if (line.startsWith("Престиж:") || line.startsWith("Быт:")) ctx.fillStyle = "#e8e8f0";
    ctx.fillText(line, textX, y);
    y += s(26);
  }

  ctx.fillStyle = "#ffffff55";
  ctx.font = `${s(12)}px "${FONT_FAMILY}"`;
  ctx.fillText("НЕЙРОКОМ · досье", s(24), H - s(28));

  if (options.watermark) {
    drawWatermark(ctx, content.accent);
  }

  return canvas.toBuffer("image/png");
}

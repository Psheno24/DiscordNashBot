import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import { buildProfileCardContent, type ProfileCardContent } from "./profileCardData.js";
import { getEconomyUser } from "./userStore.js";
import type { GuildMember } from "discord.js";

const W = 820;
const H = 420;
const FONT_FAMILY = "ProfileDejaVu";

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

function drawRoundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
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

function drawTopBadge(
  ctx: SKRSContext2D,
  text: string,
  x: number,
  y: number,
  fill: string,
  stroke: string,
): void {
  ctx.font = `bold 13px "${FONT_FAMILY}Bold"`;
  const padX = 10;
  const padY = 6;
  const tw = ctx.measureText(text).width;
  const bw = tw + padX * 2;
  const bh = 22;
  drawRoundedRect(ctx, x, y, bw, bh, 6);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#0a0a0a";
  ctx.fillText(text, x + padX, y + 16);
}

function drawFrameEffects(
  ctx: SKRSContext2D,
  content: ProfileCardContent,
  accent: string,
): void {
  const pad = 8;
  drawRoundedRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 14);
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.stroke();

  if (content.isTopRub) {
    ctx.strokeStyle = "#ffd700";
    ctx.lineWidth = 5;
    drawRoundedRect(ctx, pad - 2, pad - 2, W - pad * 2 + 4, H - pad * 2 + 4, 16);
    ctx.stroke();
    drawTopBadge(ctx, "★ TOP ₽", W - 150, 18, "#ffd700cc", "#ffd700");
  }
  if (content.isTopPs) {
    ctx.strokeStyle = "#00e5ff";
    ctx.lineWidth = content.isTopRub ? 3 : 5;
    if (!content.isTopRub) {
      drawRoundedRect(ctx, pad - 2, pad - 2, W - pad * 2 + 4, H - pad * 2 + 4, 16);
      ctx.stroke();
    }
    const bx = content.isTopRub ? W - 150 : W - 140;
    const by = content.isTopRub ? 46 : 18;
    drawTopBadge(ctx, "★ TOP СР", bx, by, "#00e5ffcc", "#00e5ff");
  }
}

async function fetchAvatar(url: string): Promise<Image> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`avatar fetch ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  return loadImage(buf);
}

export async function renderProfileCardPng(member: GuildMember): Promise<Buffer> {
  ensureFonts();
  const u = getEconomyUser(member.guild.id, member.id);
  const content = buildProfileCardContent(member, u);
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
    drawAvatar(ctx, avatar, 36, 118, 132);
  } catch {
    ctx.fillStyle = "#333";
    drawRoundedRect(ctx, 36, 118, 132, 132, 66);
    ctx.fill();
    ctx.fillStyle = "#888";
    ctx.font = `14px "${FONT_FAMILY}"`;
    ctx.fillText("нет фото", 62, 188);
  }

  const textX = 196;
  let y = 56;
  ctx.fillStyle = "#f0f0f0";
  ctx.font = `bold 24px "${FONT_FAMILY}Bold"`;
  ctx.fillText(content.displayName, textX, y);

  y += 36;
  ctx.font = `16px "${FONT_FAMILY}"`;
  for (const line of content.lines) {
    if (line === "") {
      y += 10;
      continue;
    }
    ctx.fillStyle = line.startsWith("СР:") || line.startsWith("₽:") ? content.accent : "#d0d0d8";
    if (line.startsWith("Престиж:") || line.startsWith("Быт:")) ctx.fillStyle = "#e8e8f0";
    ctx.fillText(line, textX, y);
    y += 26;
  }

  ctx.fillStyle = "#ffffff55";
  ctx.font = `12px "${FONT_FAMILY}"`;
  ctx.fillText("НЕЙРОКОМ · досье", 24, H - 28);

  return canvas.toBuffer("image/png");
}

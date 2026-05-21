/**
 * Генерирует пример PNG карточки в docs/profile-card-sample.png
 * Запуск: node scripts/gen-profile-card-sample.mjs
 */
import { createCanvas, GlobalFonts, loadImage } from "@napi-rs/canvas";
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");
const require = createRequire(import.meta.url);
const fontPath = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans.ttf");
const fontBold = require.resolve("dejavu-fonts-ttf/ttf/DejaVuSans-Bold.ttf");
const FONT = "ProfileDejaVu";
GlobalFonts.registerFromPath(fontPath, FONT);
GlobalFonts.registerFromPath(fontBold, `${FONT}Bold`);

const W = 820;
const H = 420;
const accent = "#ff003c";
const bg = "#14080c";

const content = {
  displayName: "Гражданин СССР",
  lines: [
    "Престиж: 120",
    "Быт: 340",
    "",
    "Телефон: «Нокиа» 3310 · сим 48291",
    "Авто: «Жигули» 2107",
    "Жильё: аренда (сов.) · нет (зам.)",
    "Питомец: Кот «Мурзик»",
    "",
    "Работа: Доставка",
    "СР: 12 400 (1-е место)",
    "₽: 1 250 000 (2-е место)",
  ],
  isTopPs: true,
  isTopRub: true,
};

// Simplified draw (same layout as profileCardRender.ts)
const canvas = createCanvas(W, H);
const ctx = canvas.getContext("2d");
ctx.fillStyle = "#0e0e12";
ctx.fillRect(0, 0, W, H);
ctx.fillStyle = bg;
ctx.fillRect(12, 12, W - 24, H - 24);
ctx.strokeStyle = accent;
ctx.lineWidth = 4;
ctx.strokeRect(14, 14, W - 28, H - 28);
ctx.strokeStyle = "#ffd700";
ctx.lineWidth = 5;
ctx.strokeRect(10, 10, W - 20, H - 20);

ctx.fillStyle = "#ffd700cc";
ctx.fillRect(W - 150, 18, 120, 22);
ctx.fillStyle = "#0a0a0a";
ctx.font = `bold 13px "${FONT}Bold"`;
ctx.fillText("★ TOP ₽", W - 140, 34);
ctx.fillStyle = "#00e5ffcc";
ctx.fillRect(W - 150, 46, 120, 22);
ctx.fillText("★ TOP СР", W - 140, 62);

ctx.fillStyle = "#444";
ctx.fillRect(36, 118, 132, 132);
ctx.fillStyle = "#888";
ctx.font = `14px "${FONT}"`;
ctx.fillText("аватар", 78, 188);

let y = 56;
ctx.fillStyle = "#f0f0f0";
ctx.font = `bold 24px "${FONT}Bold"`;
ctx.fillText(content.displayName, 196, y);
y += 36;
ctx.font = `16px "${FONT}"`;
for (const line of content.lines) {
  if (line === "") {
    y += 10;
    continue;
  }
  ctx.fillStyle = line.startsWith("СР:") || line.startsWith("₽:") ? accent : "#d0d0d8";
  ctx.fillText(line, 196, y);
  y += 26;
}
ctx.fillStyle = "#ffffff55";
ctx.font = `12px "${FONT}"`;
ctx.fillText("НЕЙРОКОМ · досье", 24, H - 28);

const outDir = join(root, "docs");
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "profile-card-sample.png");
writeFileSync(outPath, canvas.toBuffer("image/png"));
console.log("Written:", outPath);

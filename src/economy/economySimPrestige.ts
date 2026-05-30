import type { SimNumberParts } from "./economySimNumber.js";
import { isValidSimNumberParts, simFullDigits } from "./economySimNumber.js";

export interface SimPrestigeBreakdown {
  total: number;
  base: number;
  lines: string[];
  multipliers: string[];
}

function isTriple(d: string): boolean {
  return d.length === 3 && d[0] === d[1] && d[1] === d[2];
}

function isPalindrome3(d: string): boolean {
  return d.length === 3 && d[0] === d[2];
}

function hasPair3(d: string): boolean {
  return d[0] === d[1] || d[1] === d[2] || d[0] === d[2];
}

function isAllSame(d: string): boolean {
  return d.length > 0 && [...d].every((ch) => ch === d[0]);
}

function isPalindrome(s: string): boolean {
  return s === [...s].reverse().join("");
}

function maxConsecutiveRun(d: string): { len: number; digit: string } {
  let bestLen = 1;
  let bestDigit = d[0] ?? "0";
  let i = 0;
  while (i < d.length) {
    const ch = d[i]!;
    let len = 1;
    while (i + len < d.length && d[i + len] === ch) len++;
    if (len > bestLen) {
      bestLen = len;
      bestDigit = ch;
    }
    i += len;
  }
  return { len: bestLen, digit: bestDigit };
}

function maxSameDigitCount(d: string): number {
  const counts = new Map<string, number>();
  for (const ch of d) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

function isAscendingRun(d: string): boolean {
  for (let i = 0; i < d.length - 1; i++) {
    if (Number(d[i]) + 1 !== Number(d[i + 1])) return false;
  }
  return true;
}

function isDescendingRun(d: string): boolean {
  for (let i = 0; i < d.length - 1; i++) {
    if (Number(d[i]) - 1 !== Number(d[i + 1])) return false;
  }
  return true;
}

function isAbac4(d: string): boolean {
  return d.length === 4 && d[0] === d[2] && d[1] === d[3] && d[0] !== d[1];
}

/** Повтор короткого фрагмента (напр. **29** в **9292929**). */
function hasRepeatingChunk(s: string, chunkLen: number, minRepeats: number): boolean {
  if (s.length < chunkLen * minRepeats) return false;
  for (let start = 0; start <= s.length - chunkLen * minRepeats; start++) {
    const chunk = s.slice(start, start + chunkLen);
    let reps = 1;
    let pos = start + chunkLen;
    while (pos + chunkLen <= s.length && s.slice(pos, pos + chunkLen) === chunk) {
      reps++;
      pos += chunkLen;
    }
    if (reps >= minRepeats) return true;
  }
  return false;
}

/** Ритм **AB** по всему номеру (9292929292…). */
function isAlternatingPairRhythm(s: string): boolean {
  if (s.length < 6) return false;
  const a = s[0]!;
  const b = s[1]!;
  if (a === b) return false;
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== (i % 2 === 0 ? a : b)) return false;
  }
  return true;
}

function digitBlockScore(d: string, kind: "op" | "mid" | "last"): { score: number; label?: string; allNine?: boolean; triple?: boolean } {
  if (d.length === 0) return { score: 0 };

  if (isAllSame(d)) {
    const ch = d[0]!;
    if (ch === "9") {
      const cap = kind === "last" ? 380 : kind === "mid" ? 320 : 300;
      return { score: cap, label: kind === "op" ? "все девятки в коде" : `все ${ch} (${d})`, allNine: true, triple: d.length === 3 };
    }
    const cap = kind === "last" ? 260 : 220;
    return { score: cap, label: `все ${ch}`, triple: d.length === 3 && isTriple(d) };
  }

  if (d.length === 3 && isTriple(d)) {
    if (d[0] === "9") return { score: 280, label: `тройка ${d}`, triple: true, allNine: false };
    return { score: 200, label: `тройка ${d}`, triple: true };
  }

  if (d.length === 4 && maxConsecutiveRun(d).len >= 4) {
    const ch = maxConsecutiveRun(d).digit;
    return { score: ch === "9" ? 300 : 220, label: `четверо «${ch}» подряд` };
  }

  if (d.length === 3 && isPalindrome3(d) && !isTriple(d)) {
    return { score: 120, label: `зеркало ${d}` };
  }
  if (d.length === 4 && isPalindrome(d)) {
    return { score: 140, label: `палиндром ${d}` };
  }
  if (d.length === 4 && isAbac4(d)) {
    return { score: 150, label: `зеркало ${d}` };
  }

  const run = maxConsecutiveRun(d);
  if (run.len >= 3) {
    return { score: run.digit === "9" ? 180 : 130, label: `три «${run.digit}» подряд` };
  }

  if (d.length === 4 && (isAscendingRun(d) || isDescendingRun(d))) {
    return { score: 150, label: isAscendingRun(d) ? "лестница вверх" : "лестница вниз" };
  }

  if (hasPair3(d) || /(\d)\1/.test(d)) {
    return { score: 55, label: "повтор цифр" };
  }

  if (d.endsWith("00") || d.startsWith("00")) {
    return { score: 40, label: "двойной ноль" };
  }

  return { score: 0 };
}

function fullNumberScore(full: string): { score: number; label?: string; allNine?: boolean; rhythm?: boolean } {
  if (full.length !== 10) return { score: 0 };

  if (isAllSame(full) && full[0] === "9") {
    return { score: 900, label: "все 10 цифр — девятки", allNine: true };
  }

  if (isAllSame(full)) {
    return { score: 520, label: `все цифры «${full[0]}»` };
  }

  const nineCount = [...full].filter((ch) => ch === "9").length;
  if (nineCount >= 8) {
    return { score: 620, label: `${nineCount}/10 девяток`, allNine: true };
  }
  if (nineCount >= 6) {
    return { score: 380, label: `${nineCount}/10 девяток` };
  }

  if (isPalindrome(full)) {
    return { score: 320, label: `палиндром ${full}` };
  }

  if (isAlternatingPairRhythm(full)) {
    return { score: 340, label: `ритм ${full.slice(0, 2)} по всему номеру`, rhythm: true };
  }

  if (hasRepeatingChunk(full, 2, 4) || hasRepeatingChunk(full, 3, 3)) {
    return { score: 300, label: "повторяющийся фрагмент", rhythm: true };
  }

  const run = maxConsecutiveRun(full);
  if (run.len >= 6) {
    return { score: run.digit === "9" ? 400 : 280, label: `${run.len} «${run.digit}» подряд` };
  }
  if (run.len >= 5) {
    return { score: run.digit === "9" ? 320 : 220, label: `${run.len} «${run.digit}» подряд` };
  }

  if (maxSameDigitCount(full) >= 7) {
    const dominant = [...full].sort((a, b) => [...full].filter((x) => x === b).length - [...full].filter((x) => x === a).length)[0];
    return { score: dominant === "9" ? 280 : 180, label: `доминирует «${dominant}»` };
  }

  if (isAscendingRun(full) || isDescendingRun(full)) {
    return { score: 260, label: "лестница на весь номер" };
  }

  if (hasRepeatingChunk(full, 2, 3)) {
    return { score: 200, label: "пары по всему номеру" };
  }

  const blocksMatch = full.slice(0, 3) === full.slice(3, 6) || full.slice(3, 6) === full.slice(6, 10);
  if (blocksMatch) {
    return { score: 160, label: "эхо блоков" };
  }

  return { score: 0 };
}

function comboMultipliers(
  p: SimNumberParts,
  full: string,
  op: ReturnType<typeof digitBlockScore>,
  mid: ReturnType<typeof digitBlockScore>,
  last: ReturnType<typeof digitBlockScore>,
  whole: ReturnType<typeof fullNumberScore>,
): { mult: number; labels: string[] } {
  const labels: string[] = [];
  let mult = 1;

  const allNineBlocks = (op.allNine ? 1 : 0) + (mid.allNine ? 1 : 0) + (last.allNine ? 1 : 0);
  if (allNineBlocks >= 2) {
    mult *= 1.35;
    labels.push("×1,35 девятки в нескольких блоках");
  }
  if (allNineBlocks === 3 || whole.allNine) {
    mult *= 1.45;
    labels.push("×1,45 почти все девятки");
  }

  if (op.triple && isTriple(p.mid)) {
    mult *= 1.25;
    labels.push("×1,25 тройки в коде и середине");
  }
  if (isPalindrome3(p.mid) && isPalindrome(p.last)) {
    mult *= 1.2;
    labels.push("×1,2 зеркала середины и конца");
  }
  if (whole.rhythm && (mid.score > 0 || last.score > 0)) {
    mult *= 1.22;
    labels.push("×1,22 ритм на весь номер");
  }
  if (maxConsecutiveRun(full).len >= 5 && last.score >= 130) {
    mult *= 1.18;
    labels.push("×1,18 длинная серия + красивый конец");
  }

  return { mult, labels: [...new Set(labels)] };
}

export function computeSimPrestige(parts: SimNumberParts): SimPrestigeBreakdown {
  if (!isValidSimNumberParts(parts)) {
    return { total: 0, base: 0, lines: [], multipliers: [] };
  }

  const full = simFullDigits(parts);
  const op = digitBlockScore(parts.operator, "op");
  const mid = digitBlockScore(parts.mid, "mid");
  const last = digitBlockScore(parts.last, "last");
  const whole = fullNumberScore(full);

  const lines: string[] = [];
  let base = 0;

  if (op.score > 0) {
    base += op.score;
    lines.push(`оператор **+${op.score}** (${op.label})`);
  }
  if (mid.score > 0) {
    base += mid.score;
    lines.push(`середина **+${mid.score}** (${mid.label})`);
  }
  if (last.score > 0) {
    base += last.score;
    lines.push(`конец **+${last.score}** (${last.label})`);
  }
  if (whole.score > 0) {
    base += whole.score;
    lines.push(`весь номер **+${whole.score}** (${whole.label})`);
  }

  const { mult, labels } = comboMultipliers(parts, full, op, mid, last, whole);
  const total = Math.floor(base * mult);

  return { total, base, lines, multipliers: labels };
}

export function formatSimPrestigeBreakdownShort(b: SimPrestigeBreakdown): string {
  const parts: string[] = [];
  if (b.lines.length) parts.push(b.lines.join("; "));
  if (b.multipliers.length) parts.push(b.multipliers.join("; "));
  return parts.join(" · ") || "без бонусов";
}

export type SimShopLastRoll = {
  action: string;
  number: string;
  breakdown: SimPrestigeBreakdown;
  prestigeDelta: number;
};

export function formatSimRollEmbedFooter(roll: SimShopLastRoll): string[] {
  const lines = ["", "---", `**${roll.action}:** ${roll.number}`];
  const d = roll.prestigeDelta;
  if (d > 0) lines.push(`**+${d.toLocaleString("ru-RU")}** к престижу профиля`);
  else if (d < 0) lines.push(`**${d.toLocaleString("ru-RU")}** к престижу профиля`);
  else lines.push("Престиж профиля без изменений");
  lines.push(`(${formatSimPrestigeBreakdownShort(roll.breakdown)})`);
  return lines;
}

export function formatSimPrestigeBreakdownEmbedLines(b: SimPrestigeBreakdown): string[] {
  if (b.total <= 0) return [];
  const out: string[] = [...b.lines];
  if (b.multipliers.length) out.push(`Множители: ${b.multipliers.join(", ")}`);
  return out;
}

export const SIM_SHOP_PRESTIGE_HINT_LINES = [
  "Престиж за **красоту цифр**: повторы, зеркала, серии, ритмы — по **блокам** и за **весь номер** (ниже, чем у госномера).",
  "Максимум — **все девятки**; сильны номера вроде **9292929292** (ритм и повторы). Полный номер **уникален** на сервере.",
];

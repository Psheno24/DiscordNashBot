/** Престиж 5-значного номера сим-карты (упрощённая версия госномера). */

export const SIM_PRESTIGE_CAP = 2_500;

const LUCKY_EDGE_DIGITS = "13779";

const SPECIAL_SIM_NUMBERS: Readonly<Record<string, { score: number; label: string }>> = {
  "00700": { score: 420, label: "007" },
  "00707": { score: 400, label: "007" },
  "12345": { score: 380, label: "последовательность 1→5" },
  "54321": { score: 380, label: "последовательность 5→1" },
  "69696": { score: 350, label: "69696" },
  "42069": { score: 340, label: "42069" },
  "80085": { score: 320, label: "80085" },
  "77777": { score: 500, label: "семёрки" },
  "88888": { score: 480, label: "восьмёрки" },
  "99999": { score: 460, label: "девятки" },
  "10000": { score: 280, label: "круглая 10k" },
  "50000": { score: 300, label: "круглая 50k" },
  "90000": { score: 290, label: "круглая 90k" },
};

export interface SimPrestigeBreakdown {
  total: number;
  base: number;
  lines: string[];
  multipliers: string[];
}

function isAllSameDigit(d: string): boolean {
  return d[0] === d[1] && d[1] === d[2] && d[2] === d[3] && d[3] === d[4];
}

function isPalindrome5(d: string): boolean {
  return d[0] === d[4] && d[1] === d[3];
}

/** ABABA (72727, 80808) — полное зеркало по центру. */
function isAbaba(d: string): boolean {
  return d[0] === d[2] && d[2] === d[4] && d[1] === d[3] && d[0] !== d[1];
}

function isAscendingRun(d: string): boolean {
  for (let i = 0; i < 4; i++) {
    if (Number(d[i]) + 1 !== Number(d[i + 1])) return false;
  }
  return true;
}

function isDescendingRun(d: string): boolean {
  for (let i = 0; i < 4; i++) {
    if (Number(d[i]) - 1 !== Number(d[i + 1])) return false;
  }
  return true;
}

/** Самая длинная серия **одинаковых цифр подряд**. */
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
  let best = 1;
  for (let i = 0; i < d.length; i++) {
    let n = 1;
    for (let j = i + 1; j < d.length && d[j] === d[i]; j++) n++;
    best = Math.max(best, n);
  }
  return best;
}

function hasPairBlock(d: string): boolean {
  return /(\d)\1(?!\1)(\d)\2/.test(d) || /(\d)\1\1(?!\1)/.test(d);
}

function digitPatternScore(d: string): { score: number; label?: string } {
  const special = SPECIAL_SIM_NUMBERS[d];
  if (special) return special;

  if (isAllSameDigit(d)) {
    const ch = d[0];
    if (ch === "7") return { score: 500, label: `все ${ch}` };
    if (ch === "8") return { score: 480, label: `все ${ch}` };
    return { score: 400, label: `все ${ch}` };
  }

  const run = maxConsecutiveRun(d);
  if (run.len >= 4) {
    return { score: 310, label: `четыре «${run.digit}» подряд` };
  }

  if (isAbaba(d)) return { score: 350, label: `зеркало ${d}` };
  if (isPalindrome5(d)) return { score: 300, label: `палиндром ${d}` };

  if (isAscendingRun(d)) return { score: 380, label: "1→5 подряд" };
  if (isDescendingRun(d)) return { score: 380, label: "5→1 подряд" };

  if (run.len >= 3) return { score: 220, label: `три «${run.digit}» подряд` };

  if (hasPairBlock(d)) return { score: 150, label: "пары цифр" };

  const scattered = maxSameDigitCount(d);
  if (scattered >= 4) return { score: 240, label: "четыре одинаковых (не подряд)" };
  if (scattered >= 3) return { score: 120, label: "три одинаковых (не подряд)" };
  if (scattered >= 2) return { score: 45, label: "две одинаковых" };

  if (d.endsWith("00") || d.startsWith("00")) return { score: 60, label: "двойной ноль" };

  return { score: 0 };
}

function comboMultipliers(d: string, pattern: { score: number; label?: string }): { mult: number; labels: string[] } {
  const labels: string[] = [];
  let mult = 1;

  if (isAllSameDigit(d)) {
    mult *= 1.2;
    labels.push("×1,2 все цифры");
  }
  const luckyStart = LUCKY_EDGE_DIGITS.includes(d[0] ?? "");
  const luckyEnd = LUCKY_EDGE_DIGITS.includes(d[4] ?? "");
  if (luckyStart && luckyEnd && pattern.score >= 150) {
    mult *= 1.08;
    labels.push("×1,08 «счастливые» края");
  }

  return { mult, labels };
}

export function isValidSimNumber(digits: string | undefined): boolean {
  return typeof digits === "string" && /^\d{5}$/.test(digits) && digits !== "00000";
}

export function computeSimPrestige(digits: string): SimPrestigeBreakdown {
  const d = digits.trim();
  if (!isValidSimNumber(d)) {
    return { total: 0, base: 0, lines: [], multipliers: [] };
  }

  const pattern = digitPatternScore(d);
  const lines: string[] = [];
  let base = 0;
  if (pattern.score > 0) {
    base = pattern.score;
    lines.push(`Паттерн: **+${pattern.score}** (${pattern.label})`);
  }

  const { mult, labels } = comboMultipliers(d, pattern);
  let total = Math.floor(base * mult);
  total = Math.min(SIM_PRESTIGE_CAP, total);

  return { total, base, lines, multipliers: labels };
}

export function formatSimPrestigeBreakdownShort(b: SimPrestigeBreakdown): string {
  const parts: string[] = [];
  if (b.lines.length) parts.push(b.lines.map((l) => l.replace(/\*\*/g, "")).join("; "));
  if (b.multipliers.length) parts.push(b.multipliers.join("; "));
  return parts.join(" · ") || "без бонусов";
}

/** Строки для embed магазина (по одной на строку). */
export function formatSimPrestigeBreakdownEmbedLines(b: SimPrestigeBreakdown): string[] {
  if (b.total <= 0) return [];
  const out: string[] = [...b.lines];
  if (b.multipliers.length) out.push(`Множители: ${b.multipliers.join(", ")}`);
  return out;
}

export const SIM_SHOP_PRESTIGE_HINT_LINES = [
  "Чем «красивее» паттерн цифр, тем выше **престиж** (учитывается в общем престиже профиля).",
  "Сильнее всего: **5/4/3 цифры подряд**, **зеркало** (72727), **палиндром**, **12345**/**54321**, пары и **особые** номера.",
  "Края **1·3·7·9** с обеих сторон дают **×1,08** к уже найденному паттерну.",
];

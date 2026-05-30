import type { SimNumberParts } from "./economySimNumber.js";
import { isValidSimNumberParts } from "./economySimNumber.js";

export const SIM_PRESTIGE_CAP = 10_000;

const LUCKY_DIGITS = "13779";
const VANITY_OPERATORS = new Set(["900", "901", "902", "903", "905", "906", "909", "910", "911", "912", "913", "916", "917", "919", "920", "921", "922", "923", "924", "925", "926", "927", "928", "929", "930", "931", "932", "933", "934", "936", "937", "938", "939", "950", "951", "952", "953", "958", "960", "961", "962", "963", "964", "965", "966", "967", "968", "969", "977", "978", "980", "981", "982", "983", "984", "985", "986", "987", "988", "989", "991", "992", "993", "994", "995", "996", "997", "999"]);

export interface SimPrestigeBreakdown {
  total: number;
  base: number;
  lines: string[];
  multipliers: string[];
  comboHint?: string;
}

function isTripleDigit3(d: string): boolean {
  return d[0] === d[1] && d[1] === d[2];
}

function isPalindromeDigit3(d: string): boolean {
  return d[0] === d[2];
}

function hasTwoSameDigits3(d: string): boolean {
  return d[0] === d[1] || d[1] === d[2] || d[0] === d[2];
}

function isSpecialDigit3(digits: string): boolean {
  if (["001", "007", "100", "200", "300", "500", "777", "888", "999"].includes(digits)) return true;
  const n = Number(digits);
  return n > 0 && n % 100 === 0 && n <= 900;
}

function isAllSameDigit4(d: string): boolean {
  return d[0] === d[1] && d[1] === d[2] && d[2] === d[3];
}

function isPalindrome4(d: string): boolean {
  return d[0] === d[3] && d[1] === d[2];
}

function isAbac4(d: string): boolean {
  return d[0] === d[2] && d[1] === d[3] && d[0] !== d[1];
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

function isAscendingRun4(d: string): boolean {
  for (let i = 0; i < 3; i++) {
    if (Number(d[i]) + 1 !== Number(d[i + 1])) return false;
  }
  return true;
}

function isDescendingRun4(d: string): boolean {
  for (let i = 0; i < 3; i++) {
    if (Number(d[i]) - 1 !== Number(d[i + 1])) return false;
  }
  return true;
}

function isTripleOperator(op: string): boolean {
  return op[1] === op[2] && op[0] === "9";
}

function isPalindromeOperator(op: string): boolean {
  return op[1] === op[2] || (op[0] === op[2] && op[0] === "9");
}

function operatorScore(op: string): { score: number; label?: string; triple?: boolean; vanity?: boolean } {
  if (op === "999") return { score: 800, label: "код **999**", triple: true, vanity: true };
  if (op === "977" || op === "978") return { score: 650, label: `код **${op}**`, vanity: true };
  if (op === "900") return { score: 420, label: "код **900**", vanity: true };
  if (isTripleOperator(op)) return { score: 550, label: `тройка в коде ${op}`, triple: true };
  if (isPalindromeOperator(op) && !isTripleOperator(op)) return { score: 280, label: `зеркало кода ${op}` };
  if (VANITY_OPERATORS.has(op)) return { score: 180, label: `мобильный код ${op}`, vanity: true };
  if (op.endsWith("00") || op.endsWith("11")) return { score: 90, label: `круглый хвост кода ${op}` };
  return { score: 0 };
}

function midDigitScore(mid: string): { score: number; label?: string } {
  if (isTripleDigit3(mid)) {
    const ch = mid[0];
    if (ch === "7") return { score: 500, label: `тройка ${mid}` };
    if (ch === "8") return { score: 480, label: `тройка ${mid}` };
    return { score: 400, label: `тройка ${mid}` };
  }
  if (isPalindromeDigit3(mid) && !isTripleDigit3(mid)) return { score: 160, label: `зеркало ${mid}` };
  if (isSpecialDigit3(mid)) return { score: 90, label: `особые ${mid}` };
  if (hasTwoSameDigits3(mid)) return { score: 60, label: `повтор в ${mid}` };
  return { score: 0 };
}

function lastDigitScore(last: string): { score: number; label?: string } {
  if (last === "7777") return { score: 500, label: "четверо 7" };
  if (last === "8888") return { score: 480, label: "четверо 8" };
  if (last === "0000") return { score: 350, label: "нули" };
  if (isAllSameDigit4(last)) return { score: 420, label: `все ${last[0]}` };
  const run = maxConsecutiveRun(last);
  if (run.len >= 4) return { score: 310, label: `четыре «${run.digit}» подряд` };
  if (isAbac4(last)) return { score: 350, label: `зеркало ${last}` };
  if (isPalindrome4(last)) return { score: 300, label: `палиндром ${last}` };
  if (isAscendingRun4(last)) return { score: 380, label: "1→4 подряд" };
  if (isDescendingRun4(last)) return { score: 380, label: "4→1 подряд" };
  if (run.len >= 3) return { score: 220, label: `три «${run.digit}» подряд` };
  if (/(\d)\1(?!\1)(\d)\2/.test(last)) return { score: 150, label: "пары цифр" };
  if (last.endsWith("00") || last.startsWith("00")) return { score: 60, label: "двойной ноль" };
  return { score: 0 };
}

function comboMultipliers(
  p: SimNumberParts,
  op: ReturnType<typeof operatorScore>,
  mid: ReturnType<typeof midDigitScore>,
  last: ReturnType<typeof lastDigitScore>,
): { mult: number; labels: string[] } {
  const labels: string[] = [];
  let mult = 1;
  const tripleMid = isTripleDigit3(p.mid);
  const tripleLast = isAllSameDigit4(p.last) || maxConsecutiveRun(p.last).len >= 4;

  if (op.triple && tripleMid) {
    mult *= 1.75;
    labels.push("×1,75 тройной код + тройка в блоке");
  }
  if (op.vanity && tripleMid) {
    mult *= 1.35;
    labels.push("×1,35 красивый код + тройка");
  }
  if (tripleMid && tripleLast) {
    mult *= 1.8;
    labels.push("×1,8 тройки в обоих блоках");
  }
  if (isPalindromeDigit3(p.mid) && isPalindrome4(p.last)) {
    mult *= 1.4;
    labels.push("×1,4 зеркала в обоих блоках");
  }
  if (op.score >= 550 && last.score >= 300) {
    mult *= 1.3;
    labels.push("×1,3 топ-код + красивый хвост");
  }
  const luckyStart = LUCKY_DIGITS.includes(p.mid[0] ?? "");
  const luckyEnd = LUCKY_DIGITS.includes(p.last[3] ?? "");
  if (luckyStart && luckyEnd && mid.score + last.score >= 150) {
    mult *= 1.08;
    labels.push("×1,08 «счастливые» края");
  }
  return { mult, labels: [...new Set(labels)] };
}

function comboHint(p: SimNumberParts, op: ReturnType<typeof operatorScore>): string | undefined {
  if (op.triple && p.operator !== "999") {
    return "Подсказка: **999** даёт максимум за код; **977** — сильный компромисс.";
  }
  if (isTripleDigit3(p.mid) && !isTripleOperator(p.operator)) {
    return "Подсказка: смените **код** на **9XX** с тройкой — множитель к тройке в середине.";
  }
  return undefined;
}

export function computeSimPrestige(parts: SimNumberParts): SimPrestigeBreakdown {
  if (!isValidSimNumberParts(parts)) {
    return { total: 0, base: 0, lines: [], multipliers: [] };
  }

  const op = operatorScore(parts.operator);
  const mid = midDigitScore(parts.mid);
  const last = lastDigitScore(parts.last);

  const lines: string[] = [];
  let base = 0;

  if (op.score > 0) {
    base += op.score;
    lines.push(`код **+${op.score}** (${op.label})`);
  }
  if (mid.score > 0) {
    base += mid.score;
    lines.push(`блок 1 **+${mid.score}** (${mid.label})`);
  }
  if (last.score > 0) {
    base += last.score;
    lines.push(`хвост **+${last.score}** (${last.label})`);
  }

  const { mult, labels } = comboMultipliers(parts, op, mid, last);
  let total = Math.floor(base * mult);
  total = Math.min(SIM_PRESTIGE_CAP, total);

  return {
    total,
    base,
    lines,
    multipliers: labels,
    comboHint: comboHint(parts, op),
  };
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
  if (roll.breakdown.comboHint) lines.push(roll.breakdown.comboHint);
  return lines;
}

export function formatSimPrestigeBreakdownEmbedLines(b: SimPrestigeBreakdown): string[] {
  if (b.total <= 0) return [];
  const out: string[] = [...b.lines];
  if (b.multipliers.length) out.push(`Множители: ${b.multipliers.join(", ")}`);
  return out;
}

export const SIM_SHOP_PRESTIGE_HINT_LINES = [
  "Престиж номера **складывается** из кода **9XX**, блока **XXX** и хвоста **XX-XX**; **×множители** за сочетания (тройки, зеркала, топ-коды).",
  "Полный номер **уникален** на сервере; при смене одного блока **два других** могут совпасть с чужим номером.",
];

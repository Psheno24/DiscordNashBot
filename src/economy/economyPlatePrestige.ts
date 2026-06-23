import { vehiclePlateKey, type VehiclePlateParts } from "./economyLicensePlate.js";

/** Серия госномера: первая буква + две последние (напр. **С 222 КР** → **СКР**). */
function plateSeries(p: VehiclePlateParts): string {
  return `${p.l1}${p.l2}`;
}

function isTripleLetter(p: VehiclePlateParts): boolean {
  return p.l1 === p.l2[0] && p.l1 === p.l2[1];
}

function isTripleDigit(digits: string): boolean {
  return digits[0] === digits[1] && digits[1] === digits[2];
}

function isPalindromeDigit(digits: string): boolean {
  return digits[0] === digits[2];
}

function hasTwoSameDigits(digits: string): boolean {
  return digits[0] === digits[1] || digits[1] === digits[2] || digits[0] === digits[2];
}

function isRoundHundred(digits: string): boolean {
  const n = Number(digits);
  return n > 0 && n % 100 === 0 && n <= 900;
}

/** Статусные серии из таблиц (не тройные буквы). */
const STATUS_SERIES_SCORES: Readonly<Record<string, { score: number; label: string }>> = {
  АМР: { score: 25_000, label: "АМР" },
  ЕКХ: { score: 22_000, label: "ЕКХ" },
  ООО: { score: 18_000, label: "ООО" },
  ССС: { score: 17_000, label: "ССС" },
  АМО: { score: 12_000, label: "АМО" },
  АММ: { score: 11_000, label: "АММ" },
  ММР: { score: 11_000, label: "ММР" },
  ХКХ: { score: 11_000, label: "ХКХ" },
  ВМР: { score: 10_000, label: "ВМР" },
  ТМР: { score: 10_000, label: "ТМР" },
  ВОР: { score: 9000, label: "ВОР" },
  СКР: { score: 8000, label: "СКР" },
  РМР: { score: 7500, label: "РМР" },
  КМР: { score: 7000, label: "КМР" },
  АКР: { score: 6000, label: "АКР" },
  ВКР: { score: 6000, label: "ВКР" },
  ККХ: { score: 6000, label: "ККХ" },
  КРА: { score: 5000, label: "КРА" },
  АОО: { score: 4500, label: "АОО" },
  ВОО: { score: 4500, label: "ВОО" },
  МОО: { score: 4500, label: "МОО" },
  СОО: { score: 4500, label: "СОО" },
  РОО: { score: 4300, label: "РОО" },
  УОО: { score: 4300, label: "УОО" },
  ЕОО: { score: 4200, label: "ЕОО" },
  ОМО: { score: 6000, label: "ОМО" },
  ОСС: { score: 5200, label: "ОСС" },
  САС: { score: 4600, label: "САС" },
  КОО: { score: 5500, label: "КОО" },
  ОСК: { score: 4200, label: "ОСК" },
  ОКО: { score: 3500, label: "ОКО" },
  ОМР: { score: 4000, label: "ОМР" },
  УМР: { score: 4000, label: "УМР" },
  МУР: { score: 4000, label: "МУР" },
  АУЕ: { score: 1500, label: "АУЕ" },
  ХАМ: { score: 1500, label: "ХАМ" },
  КОТ: { score: 1000, label: "КОТ" },
  ВЕС: { score: 1000, label: "ВЕС" },
  МЕР: { score: 1000, label: "МЕР" },
  ТОМ: { score: 1000, label: "ТОМ" },
  РОТ: { score: 1000, label: "РОТ" },
  СОН: { score: 1000, label: "СОН" },
};

const TRIPLE_LETTER_SERIES = new Set(["ААА", "ВВВ", "МММ", "ХХХ"]);

const REGION_SCORES: Readonly<Record<string, { score: number; label: string }>> = {
  "77": { score: 12_000, label: "Москва 77" },
  "97": { score: 10_000, label: "Москва 97" },
  "99": { score: 9000, label: "Москва 99" },
  "50": { score: 7000, label: "МО 50" },
  "90": { score: 6500, label: "МО 90" },
  "190": { score: 6200, label: "МО 190" },
  "750": { score: 6000, label: "МО 750" },
  "790": { score: 5800, label: "МО 790" },
  "78": { score: 6000, label: "СПб 78" },
  "98": { score: 5500, label: "СПб 98" },
  "178": { score: 5000, label: "СПб 178" },
  "777": { score: 5000, label: "Москва 777" },
  "177": { score: 4500, label: "Москва 177" },
  "799": { score: 4300, label: "Москва 799" },
  "797": { score: 4300, label: "Москва 797" },
  "199": { score: 4000, label: "Москва 199" },
  "197": { score: 3800, label: "Москва 197" },
  "95": { score: 3500, label: "Чечня 95" },
  "616": { score: 2500, label: "Татарстан 616" },
  "222": { score: 2000, label: "красивый код 222" },
  "333": { score: 2000, label: "красивый код 333" },
  "444": { score: 2000, label: "красивый код 444" },
  "555": { score: 2000, label: "красивый код 555" },
  "666": { score: 2000, label: "красивый код 666" },
};

const DIGIT_EXTRA_BONUSES: Readonly<Record<string, number>> = {
  "777": 1500,
  "999": 1200,
  "111": 1000,
  "888": 1000,
  "222": 800,
  "333": 600,
  "555": 600,
  "666": 400,
};

/** **О** ↔ **0**, **В** ↔ **8**. */
const LETTER_VISUAL_DIGIT: Readonly<Record<string, string>> = {
  О: "0",
  В: "8",
};

type SeriesScore = { score: number; label?: string; isStatus: boolean };

function seriesScore(p: VehiclePlateParts): SeriesScore {
  const s3 = plateSeries(p);
  const status = STATUS_SERIES_SCORES[s3];
  if (status) return { score: status.score, label: status.label, isStatus: true };

  if (isTripleLetter(p) && TRIPLE_LETTER_SERIES.has(s3)) {
    return { score: 5000, label: `тройная серия ${s3}`, isStatus: false };
  }

  return { score: 0, isStatus: false };
}

function digitScore(digits: string): { score: number; label?: string } {
  let base = 0;
  let label: string | undefined;

  if (digits === "001" || digits === "007") {
    base = 2500;
    label = `особый ${digits}`;
  } else if (isTripleDigit(digits)) {
    base = 3000;
    label = `тройка ${digits}`;
  } else if (isRoundHundred(digits)) {
    base = 1500;
    label = `круглая сотня ${digits}`;
  } else if (isPalindromeDigit(digits)) {
    base = 1200;
    label = `палиндром ${digits}`;
  } else if (hasTwoSameDigits(digits)) {
    base = 500;
    label = `повтор в ${digits}`;
  }

  const extra = DIGIT_EXTRA_BONUSES[digits] ?? 0;
  if (extra > 0) {
    base += extra;
    label = label ? `${label} +${extra}` : `бонус ${digits} +${extra}`;
  }

  return { score: base, label };
}

function regionScore(region: string): { score: number; label?: string } {
  const hit = REGION_SCORES[region];
  if (hit) return { score: hit.score, label: hit.label };
  return { score: 0 };
}

function letterMatchesDigitVisually(letter: string, digitChar: string): boolean {
  return LETTER_VISUAL_DIGIT[letter] === digitChar;
}

function visualScore(p: VehiclePlateParts): { score: number; label?: string } {
  let n = 0;
  if (letterMatchesDigitVisually(p.l1, p.digits[0]!)) n++;
  if (letterMatchesDigitVisually(p.l2[0]!, p.digits[1]!)) n++;
  if (letterMatchesDigitVisually(p.l2[1]!, p.digits[2]!)) n++;

  if (n === 3) return { score: 1000, label: "визуал 3/3" };
  if (n === 2) return { score: 300, label: "визуал 2/3" };
  if (n === 1) return { score: 100, label: "визуал 1/3" };
  return { score: 0 };
}

const THEMATIC_MULTIPLIERS: ReadonlyArray<{ series: string; region: string; mult: number; label: string }> = [
  { series: "АМР", region: "77", mult: 2.0, label: "×2,0 АМР + Москва 77" },
  { series: "АМР", region: "97", mult: 1.8, label: "×1,8 АМР + Москва 97" },
  { series: "АМР", region: "99", mult: 1.7, label: "×1,7 АМР + Москва 99" },
  { series: "ЕКХ", region: "77", mult: 1.9, label: "×1,9 ЕКХ + Москва 77" },
  { series: "ЕКХ", region: "97", mult: 1.8, label: "×1,8 ЕКХ + Москва 97" },
  { series: "ЕКХ", region: "99", mult: 1.7, label: "×1,7 ЕКХ + Москва 99" },
  { series: "ООО", region: "77", mult: 1.8, label: "×1,8 ООО + Москва 77" },
  { series: "ССС", region: "77", mult: 1.8, label: "×1,8 ССС + Москва 77" },
  { series: "СКР", region: "77", mult: 1.8, label: "×1,8 СКР + Москва 77" },
  { series: "СКР", region: "97", mult: 1.7, label: "×1,7 СКР + Москва 97" },
  { series: "СКР", region: "99", mult: 1.6, label: "×1,6 СКР + Москва 99" },
  { series: "СКР", region: "197", mult: 1.5, label: "×1,5 СКР + Москва 197" },
  { series: "СКР", region: "199", mult: 1.5, label: "×1,5 СКР + Москва 199" },
  { series: "РМР", region: "77", mult: 1.6, label: "×1,6 РМР + Москва 77" },
  { series: "АМО", region: "77", mult: 1.7, label: "×1,7 АМО + Москва 77" },
  { series: "АМО", region: "97", mult: 1.5, label: "×1,5 АМО + Москва 97" },
  { series: "АМО", region: "99", mult: 1.4, label: "×1,4 АМО + Москва 99" },
  { series: "ЕОО", region: "97", mult: 1.45, label: "×1,45 ЕОО + Москва 97" },
  { series: "ОМО", region: "97", mult: 1.45, label: "×1,45 ОМО + Москва 97" },
  { series: "ККХ", region: "77", mult: 1.45, label: "×1,45 ККХ + Москва 77" },
  { series: "ОСС", region: "99", mult: 1.4, label: "×1,4 ОСС + Москва 99" },
  { series: "ОСС", region: "199", mult: 1.35, label: "×1,35 ОСС + Москва 199" },
  { series: "САС", region: "77", mult: 1.35, label: "×1,35 САС + Москва 77" },
  { series: "КОО", region: "77", mult: 1.4, label: "×1,4 КОО + Москва 77" },
  { series: "ОСК", region: "78", mult: 1.35, label: "×1,35 ОСК + СПб 78" },
  { series: "ОСК", region: "98", mult: 1.35, label: "×1,35 ОСК + СПб 98" },
  { series: "КРА", region: "95", mult: 1.6, label: "×1,6 КРА + Чечня 95" },
];

function comboMultipliers(
  p: VehiclePlateParts,
  series: SeriesScore,
  digitScoreValue: number,
  visualScoreValue: number,
): { thematicMult: number; vanityMult: number; labels: string[] } {
  let thematicMult = 1;
  let vanityMult = 1;
  const labels: string[] = [];
  const s3 = plateSeries(p);

  const thematic = THEMATIC_MULTIPLIERS.find((t) => t.series === s3 && t.region === p.region);
  if (thematic) {
    thematicMult = thematic.mult;
    labels.push(thematic.label);
  }

  const vanitySubtotal = digitScoreValue + visualScoreValue;
  if (isTripleDigit(p.digits) && isTripleLetter(p) && !series.isStatus && vanitySubtotal > 0) {
    vanityMult = 1.5;
    labels.push("×1,5 тройные цифры + тройные буквы");
  }

  return { thematicMult, vanityMult, labels };
}

export interface PlatePrestigeBreakdown {
  total: number;
  base: number;
  lines: string[];
  multipliers: string[];
  regionHint?: string;
  upgradeTips?: string[];
}

export function computePlatePrestige(p: VehiclePlateParts): PlatePrestigeBreakdown {
  const series = seriesScore(p);
  const region = regionScore(p.region);
  const digit = digitScore(p.digits);
  const visual = visualScore(p);

  const lines: string[] = [];
  let base = 0;

  if (series.score > 0) {
    base += series.score;
    lines.push(`серия **+${series.score}** (${series.label})`);
  }
  if (region.score > 0) {
    base += region.score;
    lines.push(`регион **+${region.score}** (${region.label})`);
  }
  if (digit.score > 0) {
    base += digit.score;
    lines.push(`цифры **+${digit.score}** (${digit.label})`);
  }
  if (visual.score > 0) {
    base += visual.score;
    lines.push(`визуал **+${visual.score}** (${visual.label})`);
  }

  const coreSubtotal = series.score + region.score;
  const digitPart = digit.score;
  const visualPart = visual.score;
  const { thematicMult, vanityMult, labels } = comboMultipliers(p, series, digitPart, visualPart);

  let total: number;
  const multiplierLines = [...labels];
  if (series.isStatus && thematicMult > 1) {
    total = Math.floor((coreSubtotal + digitPart) * thematicMult + visualPart);
  } else if (vanityMult > 1) {
    total = Math.floor(coreSubtotal + (digitPart + visualPart) * vanityMult);
  } else {
    total = base;
  }

  const multBonus = total - base;
  if (multBonus > 0 && labels.length > 0) {
    multiplierLines[labels.length - 1] = `${labels[labels.length - 1]!} **+${multBonus.toLocaleString("ru-RU")}**`;
  }

  return { total, base, lines, multipliers: multiplierLines };
}

export function formatPlatePrestigeBreakdownShort(b: PlatePrestigeBreakdown): string {
  const parts: string[] = [];
  if (b.lines.length) parts.push(b.lines.join("; "));
  if (b.multipliers.length) parts.push(b.multipliers.join("; "));
  if (b.total !== b.base) parts.push(`база **${b.base.toLocaleString("ru-RU")}** → **${b.total.toLocaleString("ru-RU")}**`);
  return parts.join(" · ") || "без бонусов";
}

const SUGGESTION_DIGITS = ["777", "999", "111", "888", "001", "007", "222", "333", "555", "666"] as const;

type UpgradeSuggestion = {
  score: number;
  text: string;
};

function bestRegionSuggestion(parts: VehiclePlateParts, takenKeys: ReadonlySet<string>): UpgradeSuggestion | undefined {
  const series = plateSeries(parts);
  const options = THEMATIC_MULTIPLIERS.filter((t) => t.series === series && t.region !== parts.region);
  let best: UpgradeSuggestion | undefined;
  for (const opt of options) {
    const candidate = { ...parts, region: opt.region };
    if (takenKeys.has(vehiclePlateKey(candidate))) continue;
    const next = computePlatePrestige(candidate).total;
    const now = computePlatePrestige(parts).total;
    if (next <= now) continue;
    const delta = next - now;
    const suggestion = {
      score: delta,
      text: `С этой серией выгоднее регион **${opt.region}** (${opt.label}), если не занят: **+${delta.toLocaleString("ru-RU")}** престижа.`,
    };
    if (!best || suggestion.score > best.score) best = suggestion;
  }
  return best;
}

function bestSeriesSuggestion(parts: VehiclePlateParts, takenKeys: ReadonlySet<string>): UpgradeSuggestion | undefined {
  const region = parts.region;
  const currentSeries = plateSeries(parts);
  const options = THEMATIC_MULTIPLIERS.filter((t) => t.region === region && t.series !== currentSeries);
  let best: UpgradeSuggestion | undefined;
  for (const opt of options) {
    const candidate = { ...parts, l1: opt.series[0]!, l2: `${opt.series[1]!}${opt.series[2]!}` };
    if (takenKeys.has(vehiclePlateKey(candidate))) continue;
    const next = computePlatePrestige(candidate).total;
    const now = computePlatePrestige(parts).total;
    if (next <= now) continue;
    const delta = next - now;
    const suggestion = {
      score: delta,
      text: `С этим регионом можно собрать серию **${opt.series}** (${opt.label}), если не занято: **+${delta.toLocaleString("ru-RU")}** престижа.`,
    };
    if (!best || suggestion.score > best.score) best = suggestion;
  }
  return best;
}

function bestDigitsSuggestion(parts: VehiclePlateParts, takenKeys: ReadonlySet<string>): UpgradeSuggestion | undefined {
  let best: UpgradeSuggestion | undefined;
  for (const digits of SUGGESTION_DIGITS) {
    if (digits === parts.digits) continue;
    const candidate = { ...parts, digits };
    if (takenKeys.has(vehiclePlateKey(candidate))) continue;
    const next = computePlatePrestige(candidate).total;
    const now = computePlatePrestige(parts).total;
    if (next <= now) continue;
    const delta = next - now;
    const suggestion = {
      score: delta,
      text: `По цифрам здесь часто лучше **${digits}** (если свободно): **+${delta.toLocaleString("ru-RU")}** престижа.`,
    };
    if (!best || suggestion.score > best.score) best = suggestion;
  }
  return best;
}

export function buildPlateUpgradeTips(
  parts: VehiclePlateParts,
  takenKeys: ReadonlySet<string>,
  maxTips: number = 3,
): string[] {
  const suggestions = [bestRegionSuggestion(parts, takenKeys), bestSeriesSuggestion(parts, takenKeys), bestDigitsSuggestion(parts, takenKeys)]
    .filter((v): v is UpgradeSuggestion => Boolean(v))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, maxTips));
  return suggestions.map((s) => s.text);
}

export type PlateShopLastRoll = {
  action: string;
  plate: string;
  breakdown: PlatePrestigeBreakdown;
  prestigeDelta: number;
};

/** Строки в конец embed госномера после оформления/смены. */
export function formatPlateRollEmbedFooter(roll: PlateShopLastRoll): string[] {
  const lines = ["", "---", `**${roll.action}:** ${roll.plate}`];
  const d = roll.prestigeDelta;
  if (d > 0) lines.push(`**+${d.toLocaleString("ru-RU")}** к престижу профиля`);
  else if (d < 0) lines.push(`**${d.toLocaleString("ru-RU")}** к престижу профиля`);
  else lines.push("Престиж профиля без изменений");
  lines.push(`(${formatPlatePrestigeBreakdownShort(roll.breakdown)})`);
  if (roll.breakdown.regionHint) lines.push(roll.breakdown.regionHint);
  if (roll.breakdown.upgradeTips?.length) {
    lines.push("", "**Подсказки для апгрейда:**");
    for (const tip of roll.breakdown.upgradeTips) lines.push(`• ${tip}`);
  }
  return lines;
}

export const PLATE_SHOP_PRESTIGE_HINT_LINES = [
  "Престиж госномера отражает его статусную ценность в России.",
  "Главный принцип: **серия** важнее региона, цифр и визуальных совпадений букв с цифрами; тематические **×множители** усиливают удачные сочетания серии и региона.",
];

import type { VehiclePlateParts } from "./economyLicensePlate.js";

export const PLATE_PRESTIGE_CAP = 12_000;

/** Москва «классика» — выше прочих московских кодов. */
const MOSCOW_CORE = new Set(["77"]);
/** Москва и близкие vanity-коды. */
const MOSCOW_VANITY = new Set(["97", "99", "177", "197", "199", "277", "299", "777", "797", "799", "977", "497", "999"]);
/** Московская область (AMM150, AMM50…). */
const MOSCOW_OBL = new Set(["50", "90", "150", "190", "250", "550", "750", "790"]);
const SPB_REGIONS = new Set(["78", "98", "178", "198", "778", "278", "878"]);
const CHECHNYA_REGIONS = new Set(["95", "195", "995"]);
const SKR_REGIONS = new Set(["197", "199"]);
/** «Красивые» коды региона (222, 333, 444…). */
const VANITY_REGION_DIGITS = new Set(["222", "330", "333", "444", "660", "661", "663", "664", "665", "667", "668", "669"]);

type BlatTier = "S" | "A" | "B" | "C" | "word";

const BLAT_SERIES: Readonly<Record<string, { tier: BlatTier; label: string; score: number }>> = {
  АМР: { tier: "S", label: "АМР (правительство)", score: 3200 },
  ЕКХ: { tier: "S", label: "ЕКХ (ФСО)", score: 3200 },
  ООО: { tier: "S", label: "ООО (ФСО/статус)", score: 3200 },
  ССС: { tier: "S", label: "ССС (спецсвязь)", score: 3200 },
  МММ: { tier: "S", label: "МММ (МВД/статус)", score: 3200 },
  ХХХ: { tier: "S", label: "ХХХ (статус)", score: 3200 },
  ВОР: { tier: "A", label: "ВОР", score: 2000 },
  АММ: { tier: "A", label: "АММ (МВД)", score: 2000 },
  ММР: { tier: "A", label: "ММР", score: 2000 },
  АМО: { tier: "A", label: "АМО (мэрия)", score: 2000 },
  ТМР: { tier: "A", label: "ТМР", score: 2000 },
  ВМР: { tier: "A", label: "ВМР", score: 2000 },
  ХКХ: { tier: "A", label: "ХКХ (ФСБ)", score: 2000 },
  ККХ: { tier: "A", label: "ККХ (ФСБ/ФСО)", score: 1800 },
  АКР: { tier: "B", label: "АКР (МВД)", score: 650 },
  ВКР: { tier: "B", label: "ВКР (МВД)", score: 650 },
  СКР: { tier: "B", label: "СКР (Следком)", score: 800 },
  ЕРЕ: { tier: "B", label: "ЕРЕ (Ед. Россия)", score: 800 },
  КРА: { tier: "B", label: "КРА", score: 800 },
  АОО: { tier: "B", label: "АОО (УДП)", score: 800 },
  ВОО: { tier: "B", label: "ВОО (УДП)", score: 800 },
  КОО: { tier: "B", label: "КОО (КС/УДП)", score: 800 },
  МОО: { tier: "B", label: "МОО (УДП/МО)", score: 800 },
  СОО: { tier: "B", label: "СОО (Совфед/УДП)", score: 800 },
  РМР: { tier: "B", label: "РМР (юстиция)", score: 800 },
  КМР: { tier: "B", label: "КМР", score: 800 },
  АУЕ: { tier: "C", label: "АУЕ", score: 350 },
  ХАМ: { tier: "C", label: "ХАМ", score: 350 },
  СММ: { tier: "C", label: "СММ (МВД)", score: 350 },
  ОМР: { tier: "C", label: "ОМР", score: 350 },
  УМР: { tier: "C", label: "УМР", score: 350 },
  МУР: { tier: "C", label: "МУР", score: 350 },
  ОКО: { tier: "C", label: "ОКО", score: 300 },
  САС: { tier: "C", label: "САС (МВД/ФСБ)", score: 300 },
  ВЕС: { tier: "word", label: "ВЕС", score: 120 },
  КОТ: { tier: "word", label: "КОТ", score: 120 },
  МЕР: { tier: "word", label: "МЕР", score: 120 },
  ТОМ: { tier: "word", label: "ТОМ", score: 120 },
  МАХ: { tier: "word", label: "МАХ", score: 120 },
  РОТ: { tier: "word", label: "РОТ", score: 120 },
  СОН: { tier: "word", label: "СОН", score: 120 },
};

const NEGATIVE_BLAT = new Set(["ССУ", "СРУ", "ХЕР", "МУН"]);

export interface PlatePrestigeBreakdown {
  total: number;
  base: number;
  lines: string[];
  multipliers: string[];
  regionHint?: string;
}

function plateLetters3(p: VehiclePlateParts): string {
  return `${p.l1}${p.l2}`;
}

function isTripleLetter(p: VehiclePlateParts): boolean {
  return p.l1 === p.l2[0] && p.l1 === p.l2[1];
}

function isPairLetters(p: VehiclePlateParts): boolean {
  return p.l2[0] === p.l2[1];
}

/** Серия **X YZ** зеркальна: **X…X** (напр. **O MO** → OMO). */
function isPalindromeLetterSeries(p: VehiclePlateParts): boolean {
  const s3 = plateLetters3(p);
  return s3.length === 3 && s3[0] === s3[2] && s3[0] !== s3[1];
}

/** Книжное зеркало: первая буква = вторая буква пары (**А ВА**). */
function isBookendMirrorLetters(p: VehiclePlateParts): boolean {
  return p.l1 === p.l2[1] && !isTripleLetter(p) && !isPairLetters(p);
}

type LetterTierKind = "triple" | "blat" | "pair" | "mirror" | "partial" | "none";

/** Один бонус за буквы: тир выше «голого» зеркала; зеркало не дублируется, если уже есть тир. */
function letterTierScore(p: VehiclePlateParts): {
  score: number;
  label?: string;
  tier?: BlatTier;
  kind: LetterTierKind;
} {
  const s3 = plateLetters3(p);
  if (NEGATIVE_BLAT.has(s3)) return { score: 0, kind: "none", label: `${s3} (без бонуса)` };

  if (isTripleLetter(p)) return { score: 750, label: `тройная буква ${s3}`, kind: "triple" };

  const blat = BLAT_SERIES[s3];
  if (blat) return { score: blat.score, label: blat.label, tier: blat.tier, kind: "blat" };

  if (isPairLetters(p)) return { score: 180, label: `пара ${p.l2}`, kind: "pair" };

  if (isPalindromeLetterSeries(p)) return { score: 200, label: `зеркальная серия ${s3}`, kind: "mirror" };
  if (isBookendMirrorLetters(p)) return { score: 180, label: `зеркало ${p.l1}·${p.l2}`, kind: "mirror" };

  if (p.l1 === p.l2[0]) return { score: 50, label: "частичное повторение", kind: "partial" };
  return { score: 0, kind: "none" };
}

/** Буквы симметричны (для ×полного зеркала; очки — только по тиру). */
function hasMirrorLetters(p: VehiclePlateParts): boolean {
  return isTripleLetter(p) || isPairLetters(p) || isPalindromeLetterSeries(p) || isBookendMirrorLetters(p);
}

/** Зеркальные цифры и буквы — **×1,4**, даже если буквы уже дали тир (серия, тройка…). */
export function isFullPlateMirror(p: VehiclePlateParts): boolean {
  return isPalindromeDigit(p.digits) && hasMirrorLetters(p);
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

function isSpecialDigit(digits: string): boolean {
  if (["001", "007", "911", "100", "200", "300", "500"].includes(digits)) return true;
  const n = Number(digits);
  return n > 0 && n % 100 === 0 && n <= 900;
}

/**
 * Буквы госномера, визуально похожие на цифры (кириллица на знаке).
 * **О** ↔ **0**, **В** ↔ **8**.
 */
const LETTER_VISUAL_DIGIT: Readonly<Record<string, string>> = {
  О: "0",
  В: "8",
};

function letterMatchesDigitVisually(letter: string, digitChar: string): boolean {
  return LETTER_VISUAL_DIGIT[letter] === digitChar;
}

function visualDigitHint(digitChar: string): string {
  if (digitChar === "0") return "**О** как **0**";
  if (digitChar === "8") return "**В** как **8**";
  return `буквы как **${digitChar}**`;
}

function countVisualMatchesOnPlate(p: VehiclePlateParts): number {
  let n = 0;
  if (letterMatchesDigitVisually(p.l1, p.digits[0]!)) n++;
  if (letterMatchesDigitVisually(p.l2[0]!, p.digits[1]!)) n++;
  if (letterMatchesDigitVisually(p.l2[1]!, p.digits[2]!)) n++;
  return n;
}

/** Визуальное совпадение букв и цифр (**В 888 ВВ**, **О 101 ОО** и т.п.). */
function visualLetterDigitUnity(p: VehiclePlateParts): { score: number; label?: string; full: boolean } {
  if (isTripleDigit(p.digits)) {
    const d = p.digits[0]!;
    const l1ok = letterMatchesDigitVisually(p.l1, d);
    const l2a = letterMatchesDigitVisually(p.l2[0]!, d);
    const l2b = letterMatchesDigitVisually(p.l2[1]!, d);
    const n = (l1ok ? 1 : 0) + (l2a ? 1 : 0) + (l2b ? 1 : 0);
    if (n === 3) {
      return {
        score: 2000,
        label: `${visualDigitHint(d)} · ${p.l1} ${p.digits} ${p.l2}`,
        full: true,
      };
    }
    if (n === 2) return { score: 900, label: `${visualDigitHint(d)} (2/3 буквы)`, full: false };
    if (n === 1) return { score: 320, label: `${visualDigitHint(d)} (частично)`, full: false };
    return { score: 0, full: false };
  }

  const n = countVisualMatchesOnPlate(p);
  if (n >= 2) {
    return {
      score: 480,
      label: `визуал ${n}/3 · ${p.l1} ${p.digits} ${p.l2}`,
      full: false,
    };
  }
  if (n === 1) {
    return {
      score: 180,
      label: `визуал 1/3 · ${p.l1} ${p.digits} ${p.l2}`,
      full: false,
    };
  }
  return { score: 0, full: false };
}

function digitScore(digits: string): { score: number; label?: string } {
  if (isTripleDigit(digits)) return { score: 500, label: `тройка ${digits}` };
  if (isPalindromeDigit(digits) && !isTripleDigit(digits)) return { score: 160, label: `зеркало ${digits}` };
  if (isSpecialDigit(digits)) return { score: 90, label: `особые ${digits}` };
  if (hasTwoSameDigits(digits)) return { score: 60, label: `повтор в ${digits}` };
  return { score: 0 };
}


function regionScore(region: string): { score: number; label?: string; moscowCore?: boolean; moscowVanity?: boolean; moscowObl?: boolean; spb?: boolean } {
  if (MOSCOW_CORE.has(region)) return { score: 500, label: `Москва ${region}`, moscowCore: true };
  if (MOSCOW_VANITY.has(region)) return { score: 400, label: `Москва ${region}`, moscowVanity: true };
  if (MOSCOW_OBL.has(region)) return { score: 280, label: `МО ${region}`, moscowObl: true };
  if (SPB_REGIONS.has(region)) return { score: 320, label: `СПб ${region}`, spb: true };
  if (CHECHNYA_REGIONS.has(region)) return { score: 150, label: `Чечня ${region}` };
  if (VANITY_REGION_DIGITS.has(region)) return { score: 120, label: `красивый код ${region}` };
  if (["616"].includes(region)) return { score: 100, label: `Татарстан ${region}` };
  return { score: 0 };
}

function comboMultipliers(
  p: VehiclePlateParts,
  letter: ReturnType<typeof letterTierScore>,
  region: ReturnType<typeof regionScore>,
  digit: ReturnType<typeof digitScore>,
  visual: ReturnType<typeof visualLetterDigitUnity>,
): { mult: number; labels: string[] } {
  let mult = 1;
  const labels: string[] = [];
  const tripleL = letter.kind === "triple";
  const tripleD = isTripleDigit(p.digits);
  const blatS = letter.tier === "S";
  const hasBlat = letter.kind === "blat";

  if (tripleL && tripleD) {
    mult *= 1.8;
    labels.push("×1,8 тройные буквы + цифры");
  }
  if (blatS && region.moscowCore) {
    mult *= 1.55;
    labels.push("×1,55 спецсерия + Москва **77**");
  } else if (blatS && region.moscowVanity) {
    mult *= 1.45;
    labels.push("×1,45 спецсерия + московский регион");
  } else if (blatS && region.moscowObl) {
    mult *= 1.35;
    labels.push("×1,35 спецсерия + МО (**50/90/150**…)");
  } else if (hasBlat && region.moscowCore) {
    mult *= 1.4;
    labels.push("×1,4 блат + Москва **77**");
  } else if (hasBlat && (region.moscowVanity || region.moscowObl)) {
    mult *= 1.25;
    labels.push("×1,25 блат + московский регион");
  }
  if (tripleD && region.moscowCore) {
    mult *= 1.35;
    labels.push("×1,35 тройные цифры + **77**");
  }
  if (hasBlat && tripleD && mult === 1) {
    mult *= 1.25;
    labels.push("×1,25 блат + тройные цифры");
  }
  if (isFullPlateMirror(p)) {
    mult *= 1.4;
    labels.push("×1,4 полное зеркало (цифры + буквы)");
  }
  if (visual.full) {
    mult *= 1.55;
    labels.push(`×1,55 ${visualDigitHint(p.digits[0]!)} (полное)`);
  } else if (visual.score >= 900) {
    mult *= 1.28;
    labels.push("×1,28 визуал букв (2/3)");
  }

  return { mult, labels: [...new Set(labels)] };
}

function regionComboHint(
  p: VehiclePlateParts,
  letter: ReturnType<typeof letterTierScore>,
  region: ReturnType<typeof regionScore>,
): string | undefined {
  const s3 = plateLetters3(p);
  if (letter.tier === "S" && letter.kind === "blat" && !region.moscowCore && !region.moscowVanity && !region.moscowObl) {
    if (s3 === "ЕКХ") return "Подсказка: **ЕКХ** ценится с **77, 99, 177, 199, 97** — попробуйте сменить регион.";
    if (s3 === "АМР") return "Подсказка: **АМР** максимален с **77** (на **50/90** — слабее, но дешевле крутить).";
    if (["ООО", "ССС", "МММ", "ХХХ"].includes(s3)) return "Подсказка: **" + s3 + "** с **77** или **99** — топ; **МО 50/90/150** — хороший компромисс.";
    return "Подсказка: спецсерия **" + s3 + "** с **77/99/777** даст больше престижа.";
  }
  if (s3 === "СКР" && !SKR_REGIONS.has(p.region)) {
    return "Подсказка: **СКР** логичнее с **197** или **199**.";
  }
  if (s3 === "КРА" && !CHECHNYA_REGIONS.has(p.region)) {
    return "Подсказка: **КРА** ассоциируется с **95/195/995**.";
  }
  if (s3 === "ЕРЕ" && !region.moscowCore && !region.moscowVanity) {
    return "Подсказка: **ЕРЕ** ценится с **177** или московскими **77/97/99**.";
  }
  if (s3 === "АММ" && region.moscowObl) {
    return "Подсказка: **АММ** на **150** — редкая московская область (см. статьи).";
  }
  return undefined;
}

export function computePlatePrestige(p: VehiclePlateParts): PlatePrestigeBreakdown {
  const digit = digitScore(p.digits);
  const letter = letterTierScore(p);
  const visual = visualLetterDigitUnity(p);
  const region = regionScore(p.region);

  const lines: string[] = [];
  let base = 0;

  if (digit.score > 0) {
    base += digit.score;
    lines.push(`цифры **+${digit.score}** (${digit.label})`);
  }
  if (letter.score > 0) {
    base += letter.score;
    const cat = letter.kind === "blat" ? "серия" : "буквы";
    lines.push(`${cat} **+${letter.score}** (${letter.label})`);
  }
  if (visual.score > 0) {
    base += visual.score;
    lines.push(`визуал **+${visual.score}** (${visual.label})`);
  }
  if (region.score > 0) {
    base += region.score;
    lines.push(`регион **+${region.score}** (${region.label})`);
  }

  const { mult, labels } = comboMultipliers(p, letter, region, digit, visual);
  let total = Math.floor(base * mult);
  total = Math.min(PLATE_PRESTIGE_CAP, total);

  const regionHint = regionComboHint(p, letter, region);

  return { total, base, lines, multipliers: labels, regionHint };
}

export function formatPlatePrestigeBreakdownShort(b: PlatePrestigeBreakdown): string {
  const parts: string[] = [];
  if (b.lines.length) parts.push(b.lines.join("; "));
  if (b.multipliers.length) parts.push(b.multipliers.join("; "));
  return parts.join(" · ") || "без бонусов";
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
  return lines;
}

export const PLATE_SHOP_PRESTIGE_HINT_LINES = [
  "Престиж номера **складывается** из цифр, **одного** бонуса за буквы (тройка, серия **АМР**/**ОКО**, пара, зеркало…) и региона; **×множители** за сочетания.",
  "Спецсерии с **77**, **99**, **777**, **497**, **999** и **МО 50/90/150** дают **больше** — см. подсказку после выпадения.",
  "Тройные буквы/цифры (**А 777 АА**, **В 888 ВВ**) и зеркала (**О 727 MO**, **А 121 АА**) усиливают престиж.",
  "Визуал: **В** как **8**, **О** как **0** (**В 888 ВВ**, **О 707 ОО**…) — отдельный бонус и **×множители**.",
  "Полное зеркало (зеркальные **цифры и буквы**) — **×1,4** к итогу, в т.ч. если буквы уже дали серию/тройку.",
  "Цифры на знаке: **001–999** (комбинации **000** не бывает).",
];

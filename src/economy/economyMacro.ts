import { getGuildConfig, patchGuildConfig, type GuildConfig } from "../guildConfig/store.js";
import {
  getApartmentDef,
  getCarDef,
  getPhoneDef,
  housingRentPlanPriceRub,
  shopApartmentPurchaseCostRub,
  shopCarPurchaseCostRub,
  shopPhonePurchaseCostRub,
  type ApartmentDef,
  type CarDef,
  type HousingRentPlan,
  type PhoneDef,
} from "./economyCatalog.js";
import { isMskFirstCalendarDay, mskMonthFirstDayMs, mskTodayYmd } from "./mskCalendar.js";
import { roundEconomyPrice } from "./economyRound.js";
import { getShopVatPercent } from "./taxTreasury.js";

export { roundEconomyPrice } from "./economyRound.js";

const DEFAULT_SALARY_INDEXING_PERCENT = 6;
const DEFAULT_SALARY_INCOME_MULT = 1;
const DEFAULT_SHOP_PRICE_MULT = 1;

export function getSalaryIndexingPercentSetting(guildId: string): number {
  const v = getGuildConfig(guildId).salaryIndexingPercent;
  if (v == null || !Number.isFinite(v)) return DEFAULT_SALARY_INDEXING_PERCENT;
  return Math.min(50, Math.max(0, Math.round(v * 100) / 100));
}

export function getSalaryIncomeMultiplier(guildId: string): number {
  const v = getGuildConfig(guildId).salaryIncomeMultiplier;
  if (v == null || !Number.isFinite(v) || v <= 0) return DEFAULT_SALARY_INCOME_MULT;
  return v;
}

export function getShopPriceMultiplier(guildId: string): number {
  const v = getGuildConfig(guildId).shopPriceMultiplier;
  if (v == null || !Number.isFinite(v) || v <= 0) return DEFAULT_SHOP_PRICE_MULT;
  return v;
}

export function getLastMonthInflationPercent(guildId: string): number {
  const v = getGuildConfig(guildId).lastMonthInflationPercent;
  if (v == null || !Number.isFinite(v)) return 0;
  return Math.round(v * 100) / 100;
}

/** Цена в магазине с учётом инфляции (сим и лотерея — без инфляции). */
export function scaledShopPrice(guildId: string, baseRub: number, fixed: boolean = false): number {
  if (fixed) return roundEconomyPrice(baseRub);
  return roundEconomyPrice(baseRub * getShopPriceMultiplier(guildId));
}

/** Доход/штраф с учётом индексации зарплат: плюс растёт, минус глубже. */
export function scaleSignedIncome(guildId: string, rub: number): number {
  if (rub === 0) return 0;
  const m = getSalaryIncomeMultiplier(guildId);
  if (m === 1) return Math.floor(rub);
  if (rub > 0) return Math.floor(rub * m);
  return Math.floor(rub * m);
}

export function scalePositiveIncome(guildId: string, rub: number): number {
  if (rub <= 0) return 0;
  return scaleSignedIncome(guildId, rub);
}

export function mskYearMonth(nowMs: number = Date.now()): string {
  return mskTodayYmd(nowMs).slice(0, 7);
}

function addMonthsYm(ym: string, delta: number): string {
  let y = Number.parseInt(ym.slice(0, 4), 10);
  let m = Number.parseInt(ym.slice(5, 7), 10) + delta;
  while (m > 12) {
    m -= 12;
    y += 1;
  }
  while (m < 1) {
    m += 12;
    y -= 1;
  }
  return `${y}-${String(m).padStart(2, "0")}`;
}

export function hasMacroInflationEverRun(guildId: string): boolean {
  return getGuildConfig(guildId).lastMacroMonthYm != null;
}

export function hasMacroIndexingEverRun(guildId: string): boolean {
  return getGuildConfig(guildId).lastSalaryIndexingYm != null;
}

/** Следующая полночь 1-го числа месяца (МСК) строго после `afterMs`. */
export function nextMskMonthFirstDayMs(afterMs: number = Date.now()): number {
  let ym = mskYearMonth(afterMs);
  for (let i = 0; i < 36; i++) {
    const at = mskMonthFirstDayMs(ym);
    if (at > afterMs) return at;
    ym = addMonthsYm(ym, 1);
  }
  return mskMonthFirstDayMs(addMonthsYm(ym, 0));
}

/** Следующая индексация: 1 марта / июня / сентября / декабря, 00:00 МСК. */
export function nextSalaryIndexingMs(afterMs: number = Date.now()): number {
  let ym = mskYearMonth(afterMs);
  for (let i = 0; i < 36; i++) {
    if (isSalaryIndexingMonthYm(ym)) {
      const at = mskMonthFirstDayMs(ym);
      if (at > afterMs) return at;
    }
    ym = addMonthsYm(ym, 1);
  }
  return mskMonthFirstDayMs(addMonthsYm(ym, 0));
}

function formatMskEventCountdown(atMs: number): string {
  const sec = Math.floor(atMs / 1000);
  return `будет через <t:${sec}:R> (<t:${sec}:f>)`;
}

/** Сброс цен и доходов к базе; история инфляции/индексации очищается. */
export function resetGuildMacroBaseline(guildId: string): void {
  patchGuildConfig(guildId, {
    salaryIncomeMultiplier: DEFAULT_SALARY_INCOME_MULT,
    shopPriceMultiplier: DEFAULT_SHOP_PRICE_MULT,
    lastMonthInflationPercent: undefined,
    lastMacroMonthYm: undefined,
    lastSalaryIndexingYm: undefined,
    macroQuarterKey: undefined,
    macroQuarterInflationAccumPercent: undefined,
  });
}

/** Однократно: откат ошибочных множителей и включение расписания «только 1-е число». */
export async function ensureMacroScheduleV2Migration(client: import("discord.js").Client): Promise<void> {
  for (const guild of client.guilds.cache.values()) {
    const cfg = getGuildConfig(guild.id);
    if (cfg.macroScheduleV2) continue;
    resetGuildMacroBaseline(guild.id);
    patchGuildConfig(guild.id, { macroScheduleV2: true });
  }
}

/** Месяцы индексации: март, июнь, сентябрь, декабрь (МСК). */
export function isSalaryIndexingMonthYm(ym: string): boolean {
  const m = ym.slice(5, 7);
  return m === "03" || m === "06" || m === "09" || m === "12";
}

/** Ключ «инфляционного квартала» между индексациями: мар–май, июн–авг, сен–ноя, дек–фев. */
export function macroQuarterKey(ym: string): string {
  const y = Number.parseInt(ym.slice(0, 4), 10);
  const m = Number.parseInt(ym.slice(5, 7), 10);
  if (m >= 3 && m <= 5) return `${y}-I1`;
  if (m >= 6 && m <= 8) return `${y}-I2`;
  if (m >= 9 && m <= 11) return `${y}-I3`;
  if (m === 12) return `${y}-I4`;
  return `${y - 1}-I4`;
}

/** Позиция месяца в цикле до следующей индексации: 1 — месяц индексации, 2–3 — следующие два. */
export function monthInMacroQuarter(ym: string): 1 | 2 | 3 {
  const m = Number.parseInt(ym.slice(5, 7), 10);
  if (m === 3 || m === 6 || m === 9 || m === 12) return 1;
  if (m === 4 || m === 7 || m === 10 || m === 1) return 2;
  return 3;
}

function rollMonthlyInflationPercent(indexingSetting: number, monthInQ: 1 | 2 | 3, accumSoFar: number): number {
  const monthsLeft = 4 - monthInQ;
  const targetRemaining = Math.max(0, indexingSetting - accumSoFar);
  if (monthInQ === 3) {
    const bias = 0.88 + Math.random() * 0.22;
    return Math.max(0.1, Math.round(targetRemaining * bias * 100) / 100);
  }
  const fairShare = monthsLeft > 0 ? targetRemaining / monthsLeft : targetRemaining;
  const jitterAmp = Math.max(0.3, indexingSetting * 0.14);
  const jitter = (Math.random() * 2 - 1) * jitterAmp;
  return Math.max(0.1, Math.round((fairShare + jitter) * 100) / 100);
}

/** Текст макропоказателей для публичного терминала. */
export function buildMacroTerminalLines(guildId: string, nowMs: number = Date.now()): string[] {
  const tax = getGuildConfig(guildId).legalIncomeTaxPercent ?? 0;
  const incomeTax = Number.isFinite(tax) ? Math.min(100, Math.max(0, tax)) : 0;
  const indexing = getSalaryIndexingPercentSetting(guildId);
  const cfg = getGuildConfig(guildId);

  let indexingLine: string;
  if (!hasMacroIndexingEverRun(guildId)) {
    const at = nextSalaryIndexingMs(nowMs);
    indexingLine = `**Индексация:** **${indexing}** % (**1 марта**, **1 июня**, **1 сентября**, **1 декабря**) — ещё **не было** · первая ${formatMskEventCountdown(at)}`;
  } else {
    indexingLine = `**Индексация:** **${indexing}** % (**1 марта**, **1 июня**, **1 сентября**, **1 декабря**)`;
    const nextIdx = nextSalaryIndexingMs(nowMs);
    if (nextIdx > nowMs) {
      indexingLine += ` · следующая ${formatMskEventCountdown(nextIdx)}`;
    }
  }

  let inflationLine: string;
  if (!hasMacroInflationEverRun(guildId)) {
    const at = nextMskMonthFirstDayMs(nowMs);
    inflationLine = `**Инфляция:** ещё **не было** · первая **1-го числа** в **00:00 МСК** · ${formatMskEventCountdown(at)}`;
  } else {
    const lastYm = cfg.lastMacroMonthYm ?? mskYearMonth(nowMs);
    const monthLabel = new Date(`${lastYm}-15T12:00:00+03:00`).toLocaleDateString("ru-RU", {
      month: "long",
      year: "numeric",
      timeZone: "Europe/Moscow",
    });
    const inflation = getLastMonthInflationPercent(guildId);
    inflationLine = `**Инфляция за ${monthLabel}:** **${inflation}** %`;
    const nextInf = nextMskMonthFirstDayMs(nowMs);
    if (nextInf > nowMs) {
      inflationLine += ` · следующая ${formatMskEventCountdown(nextInf)}`;
    }
  }

  return [
    `**Текущий подоходный налог:** **${incomeTax}** %`,
    `**НДС:** **${getShopVatPercent(guildId)}** % (включён в стоимость товаров)`,
    indexingLine,
    inflationLine,
  ];
}

export type MacroMonthProcessResult = {
  appliedInflation: boolean;
  appliedIndexing: boolean;
  inflationPercent?: number;
};

/** Один раз за календарный месяц (МСК) на гильдию. */
export function processGuildMacroMonthStart(guildId: string, ym: string, nowMs: number = Date.now()): MacroMonthProcessResult {
  const cfg = getGuildConfig(guildId);
  if (cfg.lastMacroMonthYm === ym) return { appliedInflation: false, appliedIndexing: false };

  let salaryMult = cfg.salaryIncomeMultiplier ?? DEFAULT_SALARY_INCOME_MULT;
  let shopMult = cfg.shopPriceMultiplier ?? DEFAULT_SHOP_PRICE_MULT;
  let quarterKey = cfg.macroQuarterKey ?? macroQuarterKey(ym);
  let quarterInflAccum = cfg.macroQuarterInflationAccumPercent ?? 0;
  const indexingSetting = getSalaryIndexingPercentSetting(guildId);

  let appliedIndexing = false;
  if (isSalaryIndexingMonthYm(ym)) {
    const factor = 1 + indexingSetting / 100;
    salaryMult = Math.round(salaryMult * factor * 1_000_000) / 1_000_000;
    quarterKey = macroQuarterKey(ym);
    quarterInflAccum = 0;
    appliedIndexing = true;
  }

  const monthInQ = monthInMacroQuarter(ym);
  if (quarterKey !== macroQuarterKey(ym)) {
    quarterKey = macroQuarterKey(ym);
    quarterInflAccum = 0;
  }

  const inflationPct = rollMonthlyInflationPercent(indexingSetting, monthInQ, quarterInflAccum);
  shopMult = Math.round(shopMult * (1 + inflationPct / 100) * 1_000_000) / 1_000_000;
  quarterInflAccum = Math.round((quarterInflAccum + inflationPct) * 100) / 100;

  const patch: Partial<GuildConfig> = {
    lastMacroMonthYm: ym,
    salaryIncomeMultiplier: salaryMult,
    shopPriceMultiplier: shopMult,
    lastMonthInflationPercent: inflationPct,
    macroQuarterKey: quarterKey,
    macroQuarterInflationAccumPercent: quarterInflAccum,
  };
  if (appliedIndexing) patch.lastSalaryIndexingYm = ym;
  patchGuildConfig(guildId, patch);

  void nowMs;
  return { appliedInflation: true, appliedIndexing, inflationPercent: inflationPct };
}

/** Инфляция и индексация — только в полночь **1-го** числа месяца (МСК). */
export async function processAllGuildsMacroMonth(
  client: import("discord.js").Client,
  nowMs: number = Date.now(),
): Promise<void> {
  if (!isMskFirstCalendarDay(nowMs)) return;
  const ym = mskYearMonth(nowMs);
  for (const guild of client.guilds.cache.values()) {
    processGuildMacroMonthStart(guild.id, ym, nowMs);
  }
}

function scaleCatalogPhone(guildId: string, p: PhoneDef): PhoneDef {
  return { ...p, priceRub: scaledShopPrice(guildId, p.priceRub) };
}

function scaleCatalogCar(guildId: string, c: CarDef): CarDef {
  return { ...c, priceRub: scaledShopPrice(guildId, c.priceRub) };
}

function scaleCatalogApartment(guildId: string, a: ApartmentDef): ApartmentDef {
  return {
    ...a,
    priceRub: scaledShopPrice(guildId, a.priceRub),
    monthlyUtilityRub: scaledShopPrice(guildId, a.monthlyUtilityRub),
  };
}

export function inflatedHousingRentPrice(guildId: string, plan: HousingRentPlan): number {
  return scaledShopPrice(guildId, housingRentPlanPriceRub(plan));
}

export function inflatedPhonePurchaseCost(
  guildId: string,
  cur: PhoneDef | undefined,
  next: PhoneDef,
  hasPhone: boolean,
): number {
  const c = cur ? scaleCatalogPhone(guildId, cur) : undefined;
  return roundEconomyPrice(shopPhonePurchaseCostRub(c, scaleCatalogPhone(guildId, next), hasPhone));
}

export function inflatedCarPurchaseCost(guildId: string, cur: CarDef | undefined, next: CarDef): number {
  const c = cur ? scaleCatalogCar(guildId, cur) : undefined;
  return roundEconomyPrice(shopCarPurchaseCostRub(c, scaleCatalogCar(guildId, next)));
}

export function inflatedApartmentPurchaseCost(
  guildId: string,
  cur: ApartmentDef | undefined,
  next: ApartmentDef,
  purchasedAtMs: number | undefined,
  nowMs?: number,
): number {
  const c = cur ? scaleCatalogApartment(guildId, cur) : undefined;
  return roundEconomyPrice(shopApartmentPurchaseCostRub(c, scaleCatalogApartment(guildId, next), purchasedAtMs, nowMs));
}

export function inflatedCatalogPhonePrice(guildId: string, phoneId: string | undefined): number {
  const p = getPhoneDef(phoneId);
  return p ? scaledShopPrice(guildId, p.priceRub) : 0;
}

export function inflatedCatalogCarPrice(guildId: string, carId: string | undefined): number {
  const c = getCarDef(carId);
  return c ? scaledShopPrice(guildId, c.priceRub) : 0;
}

export function inflatedCatalogApartmentPrice(guildId: string, aptId: string | undefined): number {
  const a = getApartmentDef(aptId);
  return a ? scaledShopPrice(guildId, a.priceRub) : 0;
}

export function inflatedApartmentUtilityRub(guildId: string, aptId: string | undefined): number {
  const a = getApartmentDef(aptId);
  return a ? scaledShopPrice(guildId, a.monthlyUtilityRub) : 0;
}

import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { writeJsonAtomicSync } from "../storage/atomicJson.js";

export interface GuildConfig {
  welcomeChannelId?: string;
  neuroControlChannelId?: string;
  economyTerminalChannelId?: string;
  economyFeedChannelId?: string;
  /** Казна страны (₽), пополняется налогами и комиссиями. */
  treasuryRubles?: number;
  /** Подоходный налог с легальных начислений на личный счёт, % (0–100). */
  legalIncomeTaxPercent?: number;
  /** НДС с покупок в магазине, % (0–100), включён в цену. */
  shopVatPercent?: number;
  /** Комиссия при выводе с баланса ИП на личный счёт, % (0–100). */
  solePropWithdrawFeePercent?: number;
  /** Еженедельный налог с баланса бизнеса ИП (календарный понедельник), % (0–100). */
  solePropWeeklyCapitalTaxPercent?: number;
  /** Календарная дата (YYYY-MM-DD), когда уже начисляли еженедельный налог ИП. */
  solePropWeeklyTaxLastMskYmd?: string;
  /** Индексация зарплат за квартал, % (применяется в янв/апр/июл/окт). */
  salaryIndexingPercent?: number;
  /** Накопленный множитель доходов от индексаций (старт 1). */
  salaryIncomeMultiplier?: number;
  /** Накопленный множитель цен магазина от инфляции (старт 1). */
  shopPriceMultiplier?: number;
  /** Последняя применённая месячная инфляция, %. */
  lastMonthInflationPercent?: number;
  /** YYYY-MM — последний обработанный макро-месяц. */
  lastMacroMonthYm?: string;
  /** YYYY-MM — последняя индексация зарплат. */
  lastSalaryIndexingYm?: string;
  /** Ключ квартала для накопления инфляции (например 2026-Q2). */
  macroQuarterKey?: string;
  /** Сумма инфляции за текущий макро-квартал, %. */
  macroQuarterInflationAccumPercent?: number;
  /** Макро только по расписанию (1-е число МСК); после миграции v2 — сброс ошибочных множителей. */
  macroScheduleV2?: boolean;
}

interface StoreShape {
  guilds: Record<string, GuildConfig>;
}

const storePath = () => {
  const dir = join(process.cwd(), "data");
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, "guild-config.json");
};

function readStore(): StoreShape {
  const p = storePath();
  if (!existsSync(p)) return { guilds: {} };
  try {
    return JSON.parse(readFileSync(p, "utf-8")) as StoreShape;
  } catch {
    return { guilds: {} };
  }
}

function writeStore(s: StoreShape) {
  writeJsonAtomicSync(storePath(), s);
}

export function getGuildConfig(guildId: string): GuildConfig {
  return readStore().guilds[guildId] ?? {};
}

export function setGuildConfig(guildId: string, next: GuildConfig) {
  const s = readStore();
  s.guilds[guildId] = next;
  writeStore(s);
}

export function patchGuildConfig(guildId: string, patch: Partial<GuildConfig>): GuildConfig {
  return updateGuildConfig(guildId, (cur) => ({ ...cur, ...patch }));
}

export function updateGuildConfig(guildId: string, updater: (current: GuildConfig) => GuildConfig): GuildConfig {
  const s = readStore();
  const current = s.guilds[guildId] ?? {};
  const next = updater(current);
  s.guilds[guildId] = next;
  writeStore(s);
  return next;
}

export function addTreasuryRubles(guildId: string, amountRub: number): number {
  const delta = Math.floor(amountRub);
  if (!Number.isFinite(delta) || delta <= 0) return getGuildConfig(guildId).treasuryRubles ?? 0;
  const next = updateGuildConfig(guildId, (cur) => {
    const prev = Number.isFinite(cur.treasuryRubles) ? (cur.treasuryRubles as number) : 0;
    return { ...cur, treasuryRubles: Math.round((prev + delta) * 100) / 100 };
  });
  return next.treasuryRubles ?? 0;
}

export type SpendTreasuryRublesResult = { ok: true; balance: number } | { ok: false; balance: number };

export function trySpendTreasuryRubles(guildId: string, amountRub: number): SpendTreasuryRublesResult {
  const spend = Math.floor(amountRub);
  if (!Number.isFinite(spend) || spend <= 0) {
    const balance = getGuildConfig(guildId).treasuryRubles ?? 0;
    return { ok: false, balance: Math.round(balance * 100) / 100 };
  }
  const s = readStore();
  const current = s.guilds[guildId] ?? {};
  const prev = Number.isFinite(current.treasuryRubles) ? (current.treasuryRubles as number) : 0;
  if (prev < spend) return { ok: false, balance: Math.round(prev * 100) / 100 };
  const nextBalance = Math.round((prev - spend) * 100) / 100;
  s.guilds[guildId] = { ...current, treasuryRubles: nextBalance };
  writeStore(s);
  return { ok: true, balance: nextBalance };
}


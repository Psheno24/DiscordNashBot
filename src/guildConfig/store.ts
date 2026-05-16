import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

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
  writeFileSync(storePath(), JSON.stringify(s, null, 2), "utf-8");
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
  const cur = getGuildConfig(guildId);
  const next: GuildConfig = { ...cur, ...patch };
  setGuildConfig(guildId, next);
  return next;
}


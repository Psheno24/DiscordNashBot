import { scaleSignedIncome } from "./economyMacro.js";
import {
  SHIFT_PAY_MIN_APPLY_CD_MS,
  shiftPayCoeffEmbedBlock,
  shiftPayCoeffExemptEmbedLine,
} from "./shiftPayCoeff.js";
import { getTier3JobDef } from "./tier3Jobs.js";
import type { JobId } from "./userStore.js";

const HOUR_MS = 60 * 60 * 1000;

/** Базовый КД смены из каталога (без вела/авто). */
function jobCatalogBaseCooldownMs(jobId: JobId): number {
  switch (jobId) {
    case "courier":
      return 3 * HOUR_MS;
    case "waiter":
      return 8 * HOUR_MS;
    case "watchman":
      return 24 * HOUR_MS;
    case "dispatcher":
      return 24 * HOUR_MS;
    case "assembler":
      return 3 * HOUR_MS;
    case "expediter":
      return 6 * HOUR_MS;
    case "officeAnalyst":
    case "shadowFixer":
    case "soleProp":
      return getTier3JobDef(jobId).baseCooldownMs;
    default:
      return 0;
  }
}

/** Блок лимита по КД за сутки для «Подробнее». */
function jobShiftPayCoeffDetailLine(jobId: JobId): string {
  if (jobId === "soleProp") return "";
  if (jobCatalogBaseCooldownMs(jobId) >= SHIFT_PAY_MIN_APPLY_CD_MS) return shiftPayCoeffExemptEmbedLine();
  return shiftPayCoeffEmbedBlock();
}

export const ASSEMBLER_7TH_BONUS_BASE_RUB = 22_000;
const OFFICE_SHIFT_RANK_BONUS_BASE_RUB = 1_000;
const OFFICE_SHIFT_STREAK_BONUS_MAX_BASE_RUB = 500;
const SHADOW_LINK_REFERENCE_BASE_RUB = 70_000;
const SOLE_PROP_DAILY_BASE_RUB = 45_000;
const SOLE_PROP_CAPITAL_RATE = 0.0045;
const SOLE_PROP_EXAMPLE_CAPITAL_RUB = 1_000_000;

function locFmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  const x = isWhole ? Math.round(rounded) : rounded;
  return x.toLocaleString("ru-RU", isWhole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function si(guildId: string, rub: number): number {
  return scaleSignedIncome(guildId, rub);
}

/** ₽ в текстах UI с учётом индексации зарплат. */
export function fmtJobIncome(guildId: string, baseRub: number): string {
  return locFmt(si(guildId, baseRub));
}

function fmtJobIncomeRange(guildId: string, lo: number, hi: number, sep = "–"): string {
  const a = si(guildId, lo);
  const b = si(guildId, hi);
  return `${locFmt(Math.min(a, b))}${sep}${locFmt(Math.max(a, b))}`;
}

function compactJobRub(guildId: string, baseRub: number): string {
  const v = si(guildId, baseRub);
  const neg = v < 0;
  const a = Math.abs(v);
  let s: string;
  if (a >= 1_000_000) {
    s = a % 1_000_000 === 0 ? `${a / 1_000_000}m` : `${(a / 1_000_000).toFixed(1).replace(".", ",")}m`;
  } else if (a >= 1000) {
    s = a % 1000 === 0 ? `${a / 1000}k` : `${(a / 1000).toFixed(1).replace(".", ",")}k`;
  } else {
    s = locFmt(v);
    return s;
  }
  return neg ? `−${s}` : s;
}

function compactJobRange(guildId: string, lo: number, hi: number): string {
  return `${compactJobRub(guildId, lo)}–${compactJobRub(guildId, hi)}`;
}

function shiftPayLine(guildId: string, inner: string): string {
  return `Оплата за смену: ${inner}`;
}

/** Краткая строка в списке вакансий. */
export function jobOpeningLine(guildId: string, jobId: JobId): string {
  switch (jobId) {
    case "courier":
      return `**Доставка** · КД **3** ч (ускоряется велом/авто) · фикс **${compactJobRange(guildId, 6_500, 8_000)}**`;
    case "waiter":
      return `**Уличный брокер** · КД **8** ч · **от ${compactJobRub(guildId, -10_000)} до ~${compactJobRub(guildId, 58_000)}** (шансы в **Подробнее**) · **×ранг** т1`;
    case "watchman":
      return `**Кладбище** · КД **24** ч · фикс **${compactJobRange(guildId, 11_000, 13_000)}** · **×ранг** т1`;
    case "dispatcher":
      return `**Колл-центр** · КД **24** ч · фикс **${compactJobRange(guildId, 26_000, 30_000)}** · **×ранг** т2`;
    case "assembler":
      return `**Склад** · КД **3** ч · с **личным авто** из магазина короче (скутер ~**2,5** ч) · фикс **${compactJobRange(guildId, 15_000, 18_000)}** · **×ранг** т2`;
    case "expediter":
      return `**Развлекательный центр** · КД **6** ч · **от ~${compactJobRub(guildId, -38_000)} до ~${compactJobRub(guildId, 155_000)}** (шансы в **Подробнее**) · **×ранг** т2`;
    case "officeAnalyst": {
      const basePass = getTier3JobDef("officeAnalyst").passiveBaseRub;
      return `**Офис · аналитик** · суточный оклад **${fmtJobIncome(guildId, basePass)}** ₽ + смена КД **4** ч · фикс смены **${compactJobRange(guildId, 45_000, 55_000)}**+`;
    }
    case "shadowFixer":
      return `**Схемы · посредник** · КД **12** ч · рандом (шансы в **Подробнее**)`;
    case "soleProp":
      return `**ИП · услуги** · суточный оклад от капитала · смен **нет**`;
    default:
      return `**${jobId}**`;
  }
}

/** Строка оплаты в карточке «Моя работа» / профессии. */
export function jobShiftPayEmbedLine(guildId: string, jobId: JobId): string {
  switch (jobId) {
    case "courier":
      return shiftPayLine(guildId, `случайно **${fmtJobIncomeRange(guildId, 6_500, 8_000)}** ₽`);
    case "waiter":
      return shiftPayLine(guildId, `**от ${fmtJobIncome(guildId, -10_000)}** до **~${fmtJobIncome(guildId, 58_000)}** ₽ (шансы — в **Подробнее**).`);
    case "watchman":
      return shiftPayLine(guildId, `случайно **${fmtJobIncomeRange(guildId, 11_000, 13_000)}** ₽`);
    case "dispatcher":
      return shiftPayLine(guildId, `случайно **${fmtJobIncomeRange(guildId, 26_000, 30_000)}** ₽`);
    case "assembler":
      return shiftPayLine(guildId, `случайно **${fmtJobIncomeRange(guildId, 15_000, 18_000)}** ₽`);
    case "expediter":
      return shiftPayLine(
        guildId,
        `**от ~${fmtJobIncome(guildId, -38_000)}** до **~${fmtJobIncome(guildId, 155_000)}** ₽ (шансы — в **Подробнее**).`,
      );
    case "officeAnalyst":
      return shiftPayLine(
        guildId,
        `случайно **${fmtJobIncomeRange(guildId, 45_000, 55_000)}** ₽ плюс мелкие **надбавки** от ранга и стрика`,
      );
    case "shadowFixer":
      return shiftPayLine(
        guildId,
        `**от ${fmtJobIncome(guildId, -150_000)}** до **~${fmtJobIncome(guildId, 1_200_000)}+** ₽ (шансы — в **Подробнее**).`,
      );
    case "soleProp":
      return "Смен **нет**: **суточный оклад** (пассивно) и кнопки **в панели ИП**.";
    default:
      return shiftPayLine(guildId, "—");
  }
}

export function jobPayoutShortForMenu(guildId: string, jobId: JobId, baseRub: number): string {
  if (jobId === "waiter" || jobId === "expediter" || jobId === "shadowFixer") return "без фикса (рандом)";
  if (jobId === "soleProp") return "суточный оклад";
  switch (jobId) {
    case "courier":
      return `${fmtJobIncomeRange(guildId, 6_500, 8_000)} ₽`;
    case "watchman":
      return `${fmtJobIncomeRange(guildId, 11_000, 13_000)} ₽`;
    case "dispatcher":
      return `${fmtJobIncomeRange(guildId, 26_000, 30_000)} ₽`;
    case "assembler":
      return `${fmtJobIncomeRange(guildId, 15_000, 18_000)} ₽`;
    case "officeAnalyst":
      return `${fmtJobIncomeRange(guildId, 45_000, 55_000)} ₽+`;
    default:
      return `${fmtJobIncome(guildId, baseRub)} ₽`;
  }
}

export function tier3OfficeShiftBonusLine(guildId: string): string {
  return `**Надбавка к выплате за смену:** **+${fmtJobIncome(guildId, OFFICE_SHIFT_RANK_BONUS_BASE_RUB)}** ₽ × **ранг** и до **${fmtJobIncome(guildId, OFFICE_SHIFT_STREAK_BONUS_MAX_BASE_RUB)}** ₽ за стрик (краткими шагами).`;
}

/** Основной текст экрана «Подробнее» (без блока «Сейчас у вас»). */
export function buildJobDetailMainBlock(guildId: string, jobId: JobId, opts: { promotionEveryDays: number }): string {
  let main: string;
  switch (jobId) {
    case "courier":
      main = [
        "**КД:** **3** ч пешком · **2** ч с электровелом · с авто (**скутер ~2,5 ч** … **топ ~1 ч**).",
        `**Оплата за смену:** случайно **${fmtJobIncomeRange(guildId, 6_500, 8_000)}** ₽.`,
        "**Множитель ранга** тир-1 применяется к итогу смены (см. карточку профессии).",
        "**Сим:** тариф фиксированный (не индексируется) — см. карточку профессии при устройстве.",
      ].join("\n\n");
      break;
    case "waiter":
      main = [
        "**КД:** **8** ч.",
        `**Оплата за смену:** **от ${fmtJobIncome(guildId, -10_000)}** до **~${fmtJobIncome(guildId, 58_000)}** ₽ (диапазоны веток слегка дрожат).`,
        "**Вилки и доли (ориентир при ранге 0, до умножения на ×ранг):**",
        `• штраф **${fmtJobIncome(guildId, -10_000)}** ₽ — **8%**`,
        `• малый плюс **~${fmtJobIncomeRange(guildId, 2800, 3200)}** ₽ — **32%**`,
        `• норма **~${fmtJobIncomeRange(guildId, 10400, 11600)}** ₽ — **40%**`,
        `• хорошо **~${fmtJobIncomeRange(guildId, 23800, 26200)}** ₽ — **15%**`,
        `• джекпот **~${fmtJobIncomeRange(guildId, 52000, 58000)}** ₽ — **5%**`,
        "**Ранг:** шанс штрафа **−1%**, джекпота **+1%** за ступень (штраф не ниже **3%**, джекпот не выше **10%**; доли «середины» пересчитываются).",
        "**После:** итог × **ранг** тир-1.",
      ].join("\n\n");
      break;
    case "watchman":
      main = [
        "**КД:** **24** ч.",
        `**Оплата за смену:** случайно **${fmtJobIncomeRange(guildId, 11_000, 13_000)}** ₽.`,
        "**Множитель ранга** тир-1 применяется к итогу (см. карточку профессии).",
      ].join("\n\n");
      break;
    case "dispatcher":
      main = [
        "**КД:** **24** ч.",
        `**Оплата за смену:** случайно **${fmtJobIncomeRange(guildId, 26_000, 30_000)}** ₽.`,
        "**Множитель ранга** тир-2 применяется к итогу (см. карточку профессии).",
        "**Навыки:** коммуникация **28+**, дисциплина **20+** · нужно **жильё**.",
      ].join("\n\n");
      break;
    case "assembler":
      main = [
        "**КД:** **3** ч без **личного** транспорта; с **авто** из магазина — по классу (например **скутер ~2,5 ч** … **не ниже 1 ч 45 мин**).",
        `**Оплата за смену:** случайно **${fmtJobIncomeRange(guildId, 15_000, 18_000)}** ₽.`,
        `**3%** штраф **${fmtJobIncome(guildId, -4500)}…${fmtJobIncome(guildId, -6500)}** ₽ · каждая **7-я** смена: **+${fmtJobIncome(guildId, ASSEMBLER_7TH_BONUS_BASE_RUB)}** ₽.`,
        "**После:** **×ранг** тир-2.",
        "**Навыки:** дисциплина **28+**, логистика **20+** · нужно **жильё**.",
      ].join("\n\n");
      break;
    case "expediter":
      main = [
        "**КД:** **6** ч.",
        `**Оплата за смену:** **от ~${fmtJobIncome(guildId, -38_000)}** до **~${fmtJobIncome(guildId, 155_000)}** ₽.`,
        "**Вилки и доли (ориентир при ранге 0, до ×ранг):**",
        `• штраф **~${fmtJobIncome(guildId, -38_000)}…${fmtJobIncome(guildId, -32_000)}** — **8%**`,
        `• слабый плюс **~${fmtJobIncomeRange(guildId, 7200, 8800)}** — **32%**`,
        `• норма **~${fmtJobIncomeRange(guildId, 20500, 23500)}** — **42%**`,
        `• крупнее **~${fmtJobIncomeRange(guildId, 51000, 59000)}** — **14%**`,
        `• контракт **~${fmtJobIncomeRange(guildId, 135000, 155000)}** — **4%**`,
        "**Ранг:** шанс штрафа **max(3, 8−ранг)%**, контракта **min(10, 4+ранг)%**; остальное перераспределяется по «середине».",
        "**После:** **×ранг** тир-2 к итогу.",
        "**Навыки:** логистика **28+**, коммуникация **20+** · нужно **жильё**.",
      ].join("\n\n");
      break;
    case "officeAnalyst": {
      const basePass = getTier3JobDef("officeAnalyst").passiveBaseRub;
      main = [
        `**Суточный оклад** (пассивно): **${fmtJobIncome(guildId, basePass)}** ₽ × (**1** + **8%** × **ранг**). Ранг каждые **${opts.promotionEveryDays}** дней стрика (макс. **15**).`,
        "**КД смены:** **4** ч.",
        `**Оплата за смену:** случайно **${fmtJobIncomeRange(guildId, 45_000, 55_000)}** ₽ + надбавки от ранга и стрика · **3%** штраф **${fmtJobIncome(guildId, -12_000)}…${fmtJobIncome(guildId, -22_000)}**.`,
        "**Связь** и **Совещание** (КД **24** ч): **10–30%** ориентира **суточного оклада** того же ранга.",
        "**Навыки:** коммуникация **30+**, логистика **28+**, дисциплина **35+** · **жильё**.",
      ].join("\n\n");
      break;
    }
    case "shadowFixer": {
      const linkRef = fmtJobIncome(guildId, SHADOW_LINK_REFERENCE_BASE_RUB);
      main = [
        "**Суточного пассивного оклада нет.**",
        "**КД смены:** **12** ч.",
        `**Оплата за смену:** **от ${fmtJobIncome(guildId, -150_000)}** до **~${fmtJobIncome(guildId, 1_200_000)}+** ₽ (положительные ветки × **posBoost** от ранга и стрика).`,
        "**Вилки и доли (до posBoost):**",
        `• **${fmtJobIncome(guildId, -150_000)}** ₽ — **10%**`,
        `• **${fmtJobIncome(guildId, -40_000)}** ₽ — **22%**`,
        `• **~${fmtJobIncome(guildId, 40_000)}** ₽ — **32%**`,
        `• **~${fmtJobIncome(guildId, 130_000)}** ₽ — **24%**`,
        `• **~${fmtJobIncome(guildId, 400_000)}** ₽ — **9%**`,
        `• **~${fmtJobIncome(guildId, 1_200_000)}** ₽ — **3%**`,
        `**Связь:** **10–30%** ориентира **${linkRef}**×(**1**+**8%**×ранг) ₽ **за сутки**, КД **24** ч.`,
        "**Куратор:** ускорение стрика · КД **24** ч.",
        "**Навыки:** коммуникация **42+**, логистика **38+**, дисциплина **48+** · **жильё**.",
      ].join("\n\n");
      break;
    }
    case "soleProp": {
      const base = fmtJobIncome(guildId, SOLE_PROP_DAILY_BASE_RUB);
      const capBonus = fmtJobIncome(guildId, Math.floor(SOLE_PROP_EXAMPLE_CAPITAL_RUB * SOLE_PROP_CAPITAL_RATE));
      main = [
        "**Суточный оклад** (пассивно): считается от **баланса бизнеса** (потолок **500 000 000** ₽).",
        `**Формула:** \`floor((${base} + капитал × ${SOLE_PROP_CAPITAL_RATE}) × (1 + 8%×ранг) × престиж × эффективность × …)\` — риск −2…+2 даёт сдвиг множителя.`,
        `**Пример:** при **0** ₽ на бизнесе и ранге **0** базовая часть **${base}** ₽ **за сутки** до престижа; при **${locFmt(SOLE_PROP_EXAMPLE_CAPITAL_RUB)}** ₽ на бизнесе **+${capBonus}** ₽ от капитала (до множителей).`,
        "**Реклама / персонал / контроль** — как в панели ИП.",
        "**Навыки:** коммуникация **55+**, логистика **52+**, дисциплина **60+** · **жильё**.",
      ].join("\n\n");
      break;
    }
    default:
      main = jobId;
  }
  const coeff = jobShiftPayCoeffDetailLine(jobId);
  return coeff ? `${main}\n\n${coeff}` : main;
}

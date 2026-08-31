import { scaleSignedIncome } from "./economyMacro.js";
import { COURIER_SIM_MONTHLY_FEE_RUB } from "./economyCatalog.js";
import {
  SHIFT_PAY_MIN_APPLY_CD_MS,
  shiftPayCoeffEmbedBlock,
  shiftPayCoeffExemptEmbedLine,
} from "./shiftPayCoeff.js";
import { getTier3JobDef } from "./tier3Jobs.js";
import { OFFICE_IP_SWITCH_CD_MS } from "./tier3JobSwitchGuard.js";
import { formatSkillRankReq, skillName, type JobSkillReq } from "./skills.js";
import type { JobId } from "./userStore.js";

function officeIpSwitchCdLine(): string {
  const days = OFFICE_IP_SWITCH_CD_MS / (24 * 60 * 60 * 1000);
  return `**Переход офис ↔ ИП:** пауза **${days} сут** после каждой смены стороны (в любую сторону).`;
}

function formatJobSkillReqText(req: JobSkillReq): string {
  return `${skillName(req.skill).toLowerCase()} ${formatSkillRankReq(req.minLevel)}`;
}

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
      return `**Офис · аналитик** · суточный оклад **${fmtJobIncome(guildId, basePass)}** ₽ + смена КД **4** ч · фикс смены **${compactJobRange(guildId, 45_000, 55_000)}**+ · ${officeIpSwitchCdLine()}`;
    }
    case "shadowFixer":
      return `**Схемы · посредник** · КД **12** ч · рандом (шансы в **Подробнее**)`;
    case "soleProp":
      return `**ИП · услуги** · суточный оклад от капитала · смен **нет** · ${officeIpSwitchCdLine()}`;
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
        "**КД:** **3** ч пешком · **2** ч с велом · с авто короче (до **~1 ч**).",
        `**Оплата:** **${fmtJobIncomeRange(guildId, 6_500, 8_000)}** ₽ · × **ранг** т1.`,
        `**Сим:** **${locFmt(COURIER_SIM_MONTHLY_FEE_RUB)}** ₽/30 сут с баланса сим.`,
      ].join("\n\n");
      break;
    case "waiter":
      main = [
        "**КД:** **8** ч.",
        `**Оплата:** **от ${fmtJobIncome(guildId, -10_000)}** до **~${fmtJobIncome(guildId, 58_000)}** ₽ (случайно: штраф / норма / джекпот).`,
        "**Ранг** снижает шанс штрафа и повышает джекпот. Итог × **ранг** т1.",
      ].join("\n\n");
      break;
    case "watchman":
      main = [
        "**КД:** **24** ч.",
        `**Оплата:** **${fmtJobIncomeRange(guildId, 11_000, 13_000)}** ₽ · × **ранг** т1.`,
      ].join("\n\n");
      break;
    case "dispatcher":
      main = [
        "**КД:** **24** ч.",
        `**Оплата:** **${fmtJobIncomeRange(guildId, 26_000, 30_000)}** ₽ · × **ранг** т2.`,
        "**Навыки:** " + formatJobSkillReqText({ skill: "communication", minLevel: 48 }) + " · **жильё**.",
      ].join("\n\n");
      break;
    case "assembler":
      main = [
        "**КД:** **3** ч без авто; с авто — по классу (**~2,5** … **~1** ч).",
        `**Оплата:** **${fmtJobIncomeRange(guildId, 15_000, 18_000)}** ₽ · **7-я** смена: **+${fmtJobIncome(guildId, ASSEMBLER_7TH_BONUS_BASE_RUB)}** ₽.`,
        "**Навыки:** " + formatJobSkillReqText({ skill: "discipline", minLevel: 48 }) + " · **жильё**.",
      ].join("\n\n");
      break;
    case "expediter":
      main = [
        "**КД:** **6** ч.",
        `**Оплата:** **от ~${fmtJobIncome(guildId, -38_000)}** до **~${fmtJobIncome(guildId, 155_000)}** ₽ (случайно).`,
        "**Ранг** влияет на шансы. Итог × **ранг** т2. **Навыки:** " + formatJobSkillReqText({ skill: "logistics", minLevel: 48 }) + " · **жильё**.",
      ].join("\n\n");
      break;
    case "officeAnalyst": {
      const basePass = getTier3JobDef("officeAnalyst").passiveBaseRub;
      main = [
        `**Суточный оклад:** **${fmtJobIncome(guildId, basePass)}** ₽ × (**1** + **8%** × **ранг**) × **престиж**. Ранг — каждые **${opts.promotionEveryDays}** дн. стрика.`,
        "**КД смены:** **4** ч · **Совещание** — КД **24** ч (влияет на стрик).",
        `**Смена:** **${fmtJobIncomeRange(guildId, 45_000, 55_000)}** ₽ + надбавки, тоже × **престиж**.`,
        "**Престиж к ₽:** линейно от очков престижа (телефон мало, машина больше, жильё сильно больше, номер мало). Vertu + порш + поместье + лучший номер — **×2**.",
        "**Навыки:** " + formatJobSkillReqText({ skill: "communication", minLevel: 93 }) + " · **жильё**.",
        officeIpSwitchCdLine(),
      ].join("\n\n");
      break;
    }
    case "shadowFixer":
      main = [
        "**Пассива нет.** КД смены: **12** ч.",
        `**Смена:** **от ${fmtJobIncome(guildId, -150_000)}** до **~${fmtJobIncome(guildId, 1_200_000)}+** ₽ (рандом × **posBoost**).`,
        "**Связь** и **куратор** — КД **24** ч. **Навыки:** " + formatJobSkillReqText({ skill: "logistics", minLevel: 128 }) + " · **жильё**.",
      ].join("\n\n");
      break;
    case "soleProp": {
      main = [
        "**Суточный оклад** только от **баланса бизнеса** (потолок **500 млн** ₽). Без капитала — **0** ₽.",
        "Затухающая отдача (не линейный %) × ранг × **престиж** × риск. Около **7 млн** чуть выгоднее полного гринда офиса. Престиж линейно от очков, полный набор лучших покупок — **×2**.",
        "Каждый следующий миллион на балансе даёт **меньше**, чем предыдущий. Дальше сильнее **ранг, престиж и эффективность** (персонал).",
        "**Реклама / персонал / контроль** — в панели ИП.",
        "**Навыки:** " + formatJobSkillReqText({ skill: "discipline", minLevel: 167 }) + " · **жильё**.",
        officeIpSwitchCdLine(),
      ].join("\n\n");
      break;
    }
    default:
      main = jobId;
  }
  const coeff = jobShiftPayCoeffDetailLine(jobId);
  return coeff ? `${main}\n\n${coeff}` : main;
}

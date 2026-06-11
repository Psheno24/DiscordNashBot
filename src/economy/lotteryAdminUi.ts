import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";
import { NEURO_ADMIN_ECON } from "../neurocontrol/adminHub.js";
import {
  isPeriodDrawOverdue,
  lotteryPeriodMskYmd,
  msUntilNextLotteryDrawMsk,
  periodDrawAtMs,
} from "./lotteryDraw.js";
import { listLotteryDrawLogs, type LotteryDrawLogEntry } from "./lotteryLogStore.js";
import { getStoredLotteryState, LOTTERY_MIN_JACKPOT_RUB } from "./lotteryStore.js";

export const NEURO_ADMIN_LOTTERY_PAGE_PREFIX = "neuroAdmin:lotteryPage:";

const ADMIN_COLOR = 0x0d47a1;
const LOGS_PER_PAGE = 3;

const REASON_LABEL: Record<LotteryDrawLogEntry["reason"], string> = {
  scheduled: "по расписанию",
  "catch-up": "догоняющий",
  startup: "при запуске",
};

function fmt(n: number): string {
  return n.toLocaleString("ru-RU");
}

function formatLogEntry(entry: LotteryDrawLogEntry): string {
  const drawTs = Math.floor(periodDrawAtMs(entry.periodMskYmd) / 1000);
  const lines = [
    `**${entry.periodMskYmd}** · <t:${drawTs}:d> · ${REASON_LABEL[entry.reason]}`,
    `Билетов: **${entry.ticketsSold}** · Джекпот: **${fmt(entry.jackpotBefore)}** → **${fmt(entry.jackpotAfter)}** ₽`,
  ];
  if (!entry.winners.length) {
    lines.push("Без выигрышей.");
  } else {
    for (const w of entry.winners.slice(0, 5)) {
      const breakdown = w.labels.length <= 2 ? w.labels.join(", ") : `${w.labels.length} выплат`;
      lines.push(`• <@${w.userId}> — **+${fmt(w.rub)}** ₽ (${breakdown})`);
    }
    if (entry.winners.length > 5) lines.push(`… ещё **${entry.winners.length - 5}**`);
  }
  return lines.join("\n");
}

function buildCurrentStateBlock(guildId: string, nowMs: number): string[] {
  const period = lotteryPeriodMskYmd(nowMs);
  const stored = getStoredLotteryState(guildId);
  const drawTs = Math.floor(periodDrawAtMs(period) / 1000);
  const msLeft = msUntilNextLotteryDrawMsk(nowMs);

  if (!stored) {
    return [
      "**Текущий период**",
      `Период: **${period}** · Розыгрыш: <t:${drawTs}:R>`,
      `Джекпот: **${fmt(LOTTERY_MIN_JACKPOT_RUB)}** ₽ · Билетов: **0**`,
    ];
  }

  const overdue = stored.periodMskYmd !== period && isPeriodDrawOverdue(stored.periodMskYmd, nowMs);
  const lines = [
    "**Текущий период**",
    overdue
      ? `⚠ Просрочен период **${stored.periodMskYmd}** — розыгрыш будет проведён автоматически.`
      : stored.periodMskYmd !== period
        ? `Период в базе: **${stored.periodMskYmd}** (ожидается **${period}**).`
        : `Период: **${period}** · Розыгрыш: <t:${drawTs}:R> (через **${Math.ceil(msLeft / 60_000)}** мин)`,
    `Джекпот: **${fmt(stored.jackpotRub)}** ₽ · Билетов: **${stored.ticketsSold}**`,
  ];
  return lines;
}

export function buildLotteryAdminEmbed(guildId: string, page: number, nowMs: number = Date.now()): EmbedBuilder {
  const logs = listLotteryDrawLogs(guildId);
  const totalPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);
  const slice = logs.slice(safePage * LOGS_PER_PAGE, safePage * LOGS_PER_PAGE + LOGS_PER_PAGE);

  const body: string[] = [...buildCurrentStateBlock(guildId, nowMs), "", "**Журнал розыгрышей**"];
  if (!slice.length) {
    body.push("_Записей пока нет._");
  } else {
    body.push(...slice.map((e, i) => `**${safePage * LOGS_PER_PAGE + i + 1}.**\n${formatLogEntry(e)}`));
  }

  return new EmbedBuilder()
    .setColor(ADMIN_COLOR)
    .setTitle("Лотерея · админ")
    .setDescription(body.join("\n\n"))
    .setFooter({ text: `Страница ${safePage + 1} / ${totalPages} · в журнале ${logs.length} записей` });
}

export function buildLotteryAdminRows(page: number, guildId: string): ActionRowBuilder<ButtonBuilder>[] {
  const logs = listLotteryDrawLogs(guildId);
  const totalPages = Math.max(1, Math.ceil(logs.length / LOGS_PER_PAGE));
  const safePage = Math.min(Math.max(0, page), totalPages - 1);

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${NEURO_ADMIN_LOTTERY_PAGE_PREFIX}${safePage - 1}`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage <= 0),
    new ButtonBuilder()
      .setCustomId(`${NEURO_ADMIN_LOTTERY_PAGE_PREFIX}${safePage + 1}`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(safePage >= totalPages - 1),
    new ButtonBuilder().setCustomId(NEURO_ADMIN_ECON).setLabel("Назад").setStyle(ButtonStyle.Secondary),
  );

  return [nav];
}

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type Client,
  type GuildMember,
  type ModalSubmitInteraction,
} from "discord.js";
import { economyFeedChannelId, economyTerminalChannelId } from "../config.js";
import { getVoiceSeconds } from "../voice/timeStore.js";
import { appendFeedEvent, listFeedEvents } from "./feedStore.js";
import {
  getEconomyFeedPanelMessageId,
  getEconomyTerminalPanelMessageId,
  setEconomyFeedPanelMessageId,
  setEconomyTerminalPanelMessageId,
} from "./panelStore.js";
import {
  ECONOMY_SKILL_MAX,
  getEconomyUser,
  listEconomyUsers,
  patchEconomyUser,
  type FocusPreset,
  type JobId,
  type SkillId,
} from "./userStore.js";
import { loadVoiceLadder } from "../voice/loadLadder.js";
import { listBetEvents, type BetEvent } from "../bets/store.js";
import { drawSimNumberFromPool, releaseSimNumberToPool } from "./simPoolStore.js";

export const ECON_BUTTON_MENU = "econ:menu";
export const ECON_BUTTON_PROFILE = "econ:profile";
export const ECON_BUTTON_PLAYERS = "econ:players";
export const ECON_BUTTON_WORK = "econ:work";
export const ECON_BUTTON_SKILLS = "econ:skills";
export const ECON_BUTTON_SHOP = "econ:shop";
const ECON_SHOP_HUB = "econ:shop:hub";
const ECON_SHOP_PHONE = "econ:shop:phone";
const ECON_SHOP_SIM = "econ:shop:sim";
const ECON_SHOP_SIM_NEW = "econ:shop:sim:new";
const ECON_SHOP_SIM_TOPUP_OPEN = "econ:shop:sim:topupOpen";

const ECON_COURIER_BIKE_1D = "econ:work:courierbike:1d";
const ECON_COURIER_BIKE_3D = "econ:work:courierbike:3d";
const ECON_COURIER_BIKE_7D = "econ:work:courierbike:7d";

const ECON_PROFILE_BUTTON_INFO = "econ:profile:info";
const ECON_PROFILE_BUTTON_FOCUS = "econ:profile:focus";
const ECON_PROFILE_BUTTON_LADDER = "econ:profile:ladder";
const ECON_PROFILE_BUTTON_BETS_HISTORY = "econ:profile:betsHistory";

const ECON_BUTTON_FOCUS_ROLE = "econ:focus:role";
const ECON_BUTTON_FOCUS_BALANCE = "econ:focus:balance";
const ECON_BUTTON_FOCUS_MONEY = "econ:focus:money";
const ECON_WORK_BUTTON_STARTERS = "econ:work:starters";
const ECON_WORK_BUTTON_JOB_PREFIX = "econ:work:job:";
const ECON_WORK_BUTTON_TAKE_PREFIX = "econ:work:take:";
const ECON_WORK_BUTTON_SHIFT = "econ:work:shift";
const ECON_WORK_BUTTON_MY_JOB = "econ:work:myJob";
const ECON_WORK_BUTTON_QUIT = "econ:work:quit";
const ECON_WORK_BUTTON_QUIT_CONFIRM = "econ:work:quit:confirm";
/** Подтверждение: уволиться с текущей и взять `jobId` */
const ECON_WORK_BUTTON_SWITCH_CONFIRM_PREFIX = "econ:work:switchOk:";

const ECON_WORK_BUTTON_TIER2 = "econ:work:tier2";
const ECON_PLAYERS_BUTTON_TOP_PS = "econ:players:topPs";
const ECON_PLAYERS_BUTTON_TOP_RUB = "econ:players:topRub";

const ECON_MODAL_SIM_TOPUP = "modal:econ:simTopup";

export const ECON_FEED_BUTTON_ARCHIVE = "econFeed:archive";
const ECON_FEED_BUTTON_PAGE_PREFIX = "econFeed:page:";

const PANEL_COLOR = 0x263238;
const PROFILE_COLOR = 0x1b5e20;
const FEED_COLOR = 0x0d47a1;

/** Магазин: телефон и симка */
const SHOP_PHONE_PRICE_RUB = 1000;
const SHOP_SIM_NEW_PRICE_RUB = 100;
const SHOP_SIM_START_BALANCE_RUB = 50;
/** Тариф «онлайн» курьера (24 ч) после оплаты с баланса сим. */
const COURIER_ONLINE_24H_MS = 24 * 60 * 60 * 1000;
/** Один раз с баланса сим при первой смене после истечения тарифа; внутри 24 ч доп. списаний с сим нет. */
const COURIER_SIM_24H_FEE_RUB = 20;
const BIKE_1D_MS = 1 * 86400000;
const BIKE_3D_MS = 3 * 86400000;
const BIKE_7D_MS = 7 * 86400000;
const COURIER_BIKE_1D_RUB = 95;
const COURIER_BIKE_3D_RUB = 250;
const COURIER_BIKE_7D_RUB = 520;

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return Math.floor(n).toLocaleString("ru-RU");
}

function focusLabel(f: FocusPreset): string {
  if (f === "role") return "Роль (СР)";
  if (f === "money") return "Деньги (₽)";
  return "Баланс";
}

function progressName(): string {
  return "Социальный рейтинг";
}

function progressShort(): string {
  return "СР";
}

function buildTerminalPanelEmbed(guildName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Терминал страны")
    .setDescription(
      [
        "Управление экономикой и прогрессом — через кнопки ниже.",
        "Большинство экранов **личные** (ephemeral), спама в канале не будет.",
      ].join("\n"),
    )
    .setFooter({ text: `Сервер: ${guildName}` });
}

function buildTerminalPanelRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_PROFILE).setLabel("Профиль").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_WORK).setLabel("Работа").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_SHOP).setLabel("Магазин").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_SKILLS).setLabel("Навыки").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_PLAYERS).setLabel("Игроки").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildTerminalPublicEmbed(guildName: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Терминал страны")
    .setDescription(["Нажми кнопку ниже — откроется **твоё личное меню** управления."].join("\n"))
    .setFooter({ text: `Сервер: ${guildName}` });
}

function buildTerminalPublicRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Мой профиль").setStyle(ButtonStyle.Primary),
    ),
  ];
}

function buildMenuRow(): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
  );
}

function buildProfileHubPropertyLine(u: ReturnType<typeof getEconomyUser>): string {
  if (!u.hasPhone) {
    return `Телефон (**нет**)`;
  }
  if (!u.courierSimNumber) {
    return `Телефон (**есть**, сим **нет**)`;
  }
  return `Телефон (**есть**, сим **${u.courierSimNumber}**) — баланс сим **${fmt(u.simBalanceRub ?? 0)}** ₽`;
}

function buildProfileHubEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle("Профиль")
    .setDescription(
      [
        `${progressName()}: **${fmt(u.psTotal)}**`,
        `Баланс: **${fmt(u.rubles)}** ₽`,
        "",
        buildProfileHubPropertyLine(u),
        "",
        "Выбери вкладку ниже.",
      ].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildProfileHubRows(active: "info" | "focus" | "ladder" | "bets"): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_PROFILE_BUTTON_INFO)
        .setLabel("Инфо")
        .setStyle(active === "info" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ECON_PROFILE_BUTTON_FOCUS)
        .setLabel("Фокус")
        .setStyle(active === "focus" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ECON_PROFILE_BUTTON_LADDER)
        .setLabel("Лестница")
        .setStyle(active === "ladder" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ECON_PROFILE_BUTTON_BETS_HISTORY)
        .setLabel("История ставок")
        .setStyle(active === "bets" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
    buildMenuRow(),
  ];
}

/** Чистый результат по ₽ относительно баланса до ставки: выигрыш = выплата − тело, проиграли = −тело, отмена = 0. */
function betNetRublesForUser(ev: BetEvent, userId: string): number | "pending" | "cancelled" {
  const b = ev.bets[userId];
  if (!b) return "pending";
  if (ev.status === "cancelled") return "cancelled";
  if (ev.status !== "resolved" || !ev.winningOptionId) return "pending";
  const winOpt = ev.options.find((o) => o.id === ev.winningOptionId);
  if (!winOpt) return "pending";
  if (b.optionId === ev.winningOptionId) {
    const payout = Math.floor(b.amount * winOpt.odds);
    return payout - b.amount;
  }
  return -b.amount;
}

function buildProfileBetHistoryEmbed(member: GuildMember): EmbedBuilder {
  const guildId = member.guild.id;
  const userId = member.id;
  const all = listBetEvents(guildId).sort((a, b) => b.createdAt - a.createdAt);
  const mine = all.filter((e) => Boolean(e.bets[userId])).slice(0, 15);

  if (mine.length === 0) {
    return new EmbedBuilder()
      .setColor(PROFILE_COLOR)
      .setTitle("История ставок")
      .setDescription("Пока нет ни одной ставки.")
      .setFooter({ text: `Запросил: ${member.user.tag}` });
  }

  const blocks: string[] = [];
  for (const e of mine) {
    const b = e.bets[userId]!;
    const opt = e.options.find((o) => o.id === b.optionId);
    const label = opt?.label ?? b.optionId;
    const net = betNetRublesForUser(e, userId);
    let resultLine: string;
    if (net === "pending") {
      resultLine = "_Итог: ждёт решения админа._";
    } else if (net === "cancelled") {
      resultLine = "Итог: **возврат** ставки (событие отменено).";
    } else if (net > 0) {
      resultLine = `Итог: **+${fmt(net)} ₽** чистыми (сверх суммы ставки).`;
    } else if (net < 0) {
      resultLine = `Итог: **${formatDelta(net)}**`;
    } else {
      resultLine = "**0 ₽** (без изменения баланса по итогу).";
    }
    blocks.push(
      [`**${e.title}**`, `Ставка: **${fmt(b.amount)} ₽** на «${label}»`, resultLine].join("\n"),
    );
  }

  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle("История ставок")
    .setDescription(blocks.join("\n\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildFocusRows(cur: FocusPreset): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_BUTTON_FOCUS_ROLE)
        .setLabel("Роль")
        .setEmoji("🎖️")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(cur === "role"),
      new ButtonBuilder()
        .setCustomId(ECON_BUTTON_FOCUS_BALANCE)
        .setLabel("Баланс")
        .setEmoji("⚖️")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(cur === "balance"),
      new ButtonBuilder()
        .setCustomId(ECON_BUTTON_FOCUS_MONEY)
        .setLabel("Деньги")
        .setEmoji("💰")
        .setStyle(ButtonStyle.Success)
        .setDisabled(cur === "money"),
    ),
    ...buildProfileHubRows("focus"),
  ];
}

function buildProfilePurchasesLine(u: ReturnType<typeof getEconomyUser>): string {
  if (!u.hasPhone) {
    return "Телефон: **нет**";
  }
  if (!u.courierSimNumber) {
    return "Телефон: **есть** (**нет сим**)";
  }
  return `Телефон: **есть** (**сим ${u.courierSimNumber}**, баланс **${fmt(u.simBalanceRub ?? 0)}** ₽)`;
}

function buildProfileEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const jobName = u.jobId ? jobTitle(u.jobId) : "не выбрана";

  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle("Профиль")
    .setDescription(
      [
        `${progressName()} (прогресс роли): **${fmt(u.psTotal)}**`,
        "",
        "**Покупки:**",
        `- ${buildProfilePurchasesLine(u)}`,
        "",
        `Баланс ₽: **${fmt(u.rubles)}**`,
        `Фокус: **${focusLabel(u.focus)}**`,
        `Работа: **${jobName}**`,
      ].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildFocusEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle("Фокус добычи")
    .setDescription(
      [
        "Фокус определяет, **как распределяется ценность твоей активности**.",
        "",
        `- **Роль (${progressShort()})**: максимум прогресса роли. Деньги за голос почти не идут.`,
        `- **Баланс**: компромисс — и ${progressShort()}, и ₽.`,
        `- **Деньги (₽)**: больше ₽ за голос, но ${progressShort()} растёт медленнее.`,
        "",
        `${progressShort()} начисляются за голос с дневным diminishing returns: 0–180 мин (1.0), 180–360 (0.5), 360+ (0.2).`,
        "",
        `Текущий фокус: **${focusLabel(u.focus)}**`,
      ].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildLadderEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  let ladder: ReturnType<typeof loadVoiceLadder>["ladder"] | undefined;
  try {
    ladder = loadVoiceLadder().ladder;
  } catch {
    ladder = undefined;
  }
  if (!ladder || ladder.length === 0) {
    return new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Голосовая лестница")
      .setDescription("Лестница недоступна (ошибка `config/voice-ladder.json`).")
      .setFooter({ text: `Запросил: ${member.user.tag}` });
  }

  let current = ladder[0]!;
  for (const t of ladder) {
    if (u.psTotal >= t.voiceMinutesTotal) current = t;
  }
  const idx = ladder.findIndex((t) => t.roleName === current.roleName && t.voiceMinutesTotal === current.voiceMinutesTotal);
  const next = idx >= 0 ? ladder[idx + 1] : undefined;

  const lines: string[] = [];
  lines.push(`${progressName()}: **${fmt(u.psTotal)}**`);
  lines.push(`Текущая ступень: **${current.roleName}**`);
  if (next) lines.push(`До следующей: **${fmt(Math.max(0, next.voiceMinutesTotal - u.psTotal))}** СР → **${next.roleName}**`);
  else lines.push("Ты уже на **последней ступени**.");
  lines.push("");
  lines.push("Пороги:");
  for (const t of ladder) {
    // "Стажёр" (порог 0) есть у всех — не показываем.
    if (t.voiceMinutesTotal <= 0) continue;
    lines.push(`- **${t.roleName}**: ${fmt(t.voiceMinutesTotal)} СР`);
  }

  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Голосовая лестница")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildPlayersMenuEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Игроки")
    .setDescription("Топы по социальному рейтингу и по балансу ₽.");
}

function buildPlayersMenuRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_PLAYERS_BUTTON_TOP_PS).setLabel("Топ СР").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_PLAYERS_BUTTON_TOP_RUB).setLabel("Топ ₽").setStyle(ButtonStyle.Primary),
    ),
    buildMenuRow(),
  ];
}

async function buildTopEmbed(viewer: GuildMember, kind: "ps" | "rub"): Promise<EmbedBuilder> {
  const list = listEconomyUsers(viewer.guild.id);
  const sorted = [...list].sort((a, b) => {
    const av = kind === "ps" ? a.user.psTotal : a.user.rubles;
    const bv = kind === "ps" ? b.user.psTotal : b.user.rubles;
    return bv - av;
  });
  const top = sorted.slice(0, 10);

  const lines: string[] = [];
  for (let i = 0; i < top.length; i++) {
    const { userId, user } = top[i]!;
    const val = kind === "ps" ? user.psTotal : user.rubles;
    lines.push(`${i + 1}. <@${userId}> — **${fmt(val)}**`);
  }
  if (!lines.length) lines.push("Пока нет данных.");

  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle(kind === "ps" ? `Топ игроков по ${progressShort()}` : "Топ игроков по ₽")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Запросил: ${viewer.user.tag}` });
}

const WORK_JOB_IDS = [
  "courier",
  "waiter",
  "watchman",
  "dispatcher",
  "assembler",
  "expediter",
] as const satisfies readonly JobId[];

function isWorkJobId(s: string): s is JobId {
  return (WORK_JOB_IDS as readonly string[]).includes(s);
}

function formatCooldown(msLeft: number): string {
  const sec = Math.max(0, Math.floor(msLeft / 1000));
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (d > 0) return `${d}д ${h}ч`;
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

type JobDef = {
  id: JobId;
  title: string;
  baseCooldownMs: number;
  basePayoutRub: number;
  description: string;
  reqSkills?: Partial<Record<SkillId, number>>;
};

// Чем выше потолок при активной игре — тем короче КД. Стабильный фикс — реже смены.
const JOBS_STARTER: JobDef[] = [
  {
    id: "courier",
    title: "Курьер",
    baseCooldownMs: 3 * 60 * 60 * 1000,
    basePayoutRub: 88,
    description:
      [
        "**Самый короткий КД** тира (3 ч, с арендой вела — 2 ч).",
        `Нужны **телефон** и **симка**. Раз в **24 ч** (при первой смене после перерыва) с **баланса сим** — **${COURIER_SIM_24H_FEE_RUB}** ₽ за **тариф** онлайн; внутри суток смены **без** доп. списаний с сим. **Основной счёт не трогается.**`,
        "**Электровел** — посуточная аренда (кнопки в этой карточке).",
      ].join("\n"),
  },
  {
    id: "waiter",
    title: "Официант",
    baseCooldownMs: 5 * 60 * 60 * 1000,
    basePayoutRub: 0,
    description: [
      "**Средний КД** (5 ч). **Без фиксированного оклада**: широкий разброс выплаты — возможен убыток, зато и редкие очень удачные смены.",
    ].join("\n"),
  },
  {
    id: "watchman",
    title: "Ночной сторож",
    baseCooldownMs: 16 * 60 * 60 * 1000,
    basePayoutRub: 128,
    description:
      [
        "**Самый длинный КД** (16 ч): редко нажимать, низкий стабильный фикс, без сюрпризов.",
      ].join("\n"),
  },
];

type StarterJobId = (typeof JOBS_STARTER)[number]["id"];

function getJobDef(id: StarterJobId): JobDef {
  const d = JOBS_STARTER.find((j) => j.id === id);
  if (!d) throw new Error(`unknown job: ${id}`);
  return d;
}

// Тир-2: та же логика КД; тир-3 — комбо из трёх навыков.
const JOBS_TIER2: JobDef[] = [
  {
    id: "dispatcher",
    title: "Диспетчер",
    baseCooldownMs: 12 * 60 * 60 * 1000,
    basePayoutRub: 132,
    description: ["**Длинный КД** (12 ч), стабильный фикс, мало кликов.", "Ниже потолок ₽/ч, чем у активных профессий тира."].join("\n"),
    reqSkills: { communication: 28, discipline: 20 },
  },
  {
    id: "assembler",
    title: "Сборщик",
    baseCooldownMs: 7 * 60 * 60 * 1000,
    basePayoutRub: 248,
    description: ["**Средний КД** (7 ч): высокий оклад, премии за серию, редкие штрафы."].join("\n"),
    reqSkills: { discipline: 28, logistics: 20 },
  },
  {
    id: "expediter",
    title: "Экспедитор",
    baseCooldownMs: 2.5 * 60 * 60 * 1000,
    basePayoutRub: 0,
    description: ["**Самый короткий КД** тира (2,5 ч): без фикса, сильный разброс, возможен убыток."].join("\n"),
    reqSkills: { logistics: 28, communication: 20 },
  },
];

function getAnyJobDef(id: JobId): JobDef {
  const s = JOBS_STARTER.find((j) => j.id === id);
  if (s) return s;
  const t2 = JOBS_TIER2.find((j) => j.id === id);
  if (t2) return t2;
  throw new Error(`unknown job: ${id}`);
}

function jobTitle(id: JobId): string {
  return getAnyJobDef(id).title;
}

function getSkillLevel(u: ReturnType<typeof getEconomyUser>, skill: SkillId): number {
  return Math.max(0, Math.floor(u.skills?.[skill] ?? 0));
}

function meetsJobReq(u: ReturnType<typeof getEconomyUser>, def: JobDef): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const [k, v] of Object.entries(def.reqSkills ?? {})) {
    const skill = k as SkillId;
    const need = v ?? 0;
    if (need <= 0) continue;
    const have = getSkillLevel(u, skill);
    if (have < need) missing.push(`${skillName(skill)} ${need}+ (у вас ${have})`);
  }
  return { ok: missing.length === 0, missing };
}

function randInt(min: number, max: number): number {
  const a = Math.ceil(min);
  const b = Math.floor(max);
  if (b <= a) return a;
  return Math.floor(a + Math.random() * (b - a + 1));
}

function chance(p: number): boolean {
  return Math.random() < Math.min(1, Math.max(0, p));
}

function formatDelta(n: number): string {
  if (n === 0) return "0 ₽";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${Math.abs(n).toLocaleString("ru-RU")} ₽`;
}

function rollNewSimDigits(): string {
  if (Math.random() < 0.28) {
    const fromPool = drawSimNumberFromPool();
    if (fromPool) return fromPool;
  }
  return String(randInt(10000, 99999));
}

function hasActiveBikeRental(u: ReturnType<typeof getEconomyUser>, now: number): boolean {
  return Number.isFinite(u.courierBikeUntilMs) && (u.courierBikeUntilMs ?? 0) > now;
}

/** Строки для курьера: электровелосипед, тариф онлайн 24 ч, баланс сим — только при текущей работе «курьер». */
function courierWorkExtrasLines(u: ReturnType<typeof getEconomyUser>, now: number): string[] {
  if (u.jobId !== "courier") return [];
  const fee = COURIER_SIM_24H_FEE_RUB;
  const lines: string[] = [];
  if (hasActiveBikeRental(u, now)) {
    const t = Math.floor((u.courierBikeUntilMs ?? 0) / 1000);
    lines.push(`**Электровелосипед:** оплачен до <t:${t}:F> (<t:${t}:R>).`);
  } else {
    lines.push("**Электровелосипед:** аренда **не активна**.");
  }
  if (u.courierPhonePaidUntilMs && now < u.courierPhonePaidUntilMs) {
    const lt = Math.floor(u.courierPhonePaidUntilMs / 1000);
    lines.push(`**Сим-карта:** **тариф 24 ч** оплачен до <t:${lt}:F> — смены в этот период **без** доп. списаний с баланса сим.`);
  } else {
    lines.push(
      `**Сим-карта:** **тариф 24 ч** **не оплачен** — при следующем выходе на смену с баланса сим спишется **${fee}** ₽ и активируется тариф на сутки онлайн.`,
    );
  }
  const bals = u.simBalanceRub ?? 0;
  lines.push(
    `**Баланс сим:** **${fmt(bals)}** ₽ — пополнение в магазине; **${fee}** ₽ с сим за **тариф 24 ч** (основной счёт **не** используется).`,
  );
  return lines;
}

function jobUsesVariablePayout(jobId: JobId): boolean {
  return jobId === "waiter" || jobId === "expediter";
}

function jobPayoutEmbedLine(jobId: JobId, baseRub: number): string {
  if (jobId === "waiter") {
    return "Оплата за смену: **без фикса** — разброс **примерно −95…+380 ₽** (типичный зал **+55…+175 ₽**; редко — крупный куш или тяжёлый минус).";
  }
  if (jobId === "expediter") {
    return "Оплата за смену: **без фикса** — разброс **примерно −58…+185 ₽** (частый коридор **+50…+110 ₽**).";
  }
  return `Оплата за смену: **${baseRub} ₽**`;
}

function jobPayoutShortForMenu(jobId: JobId, baseRub: number): string {
  if (jobUsesVariablePayout(jobId)) return "без фикса (рандом)";
  return `${baseRub} ₽`;
}

function buildShopHubEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const simLine = u.hasPhone
    ? `• Симка${u.courierSimNumber ? " **(куплено)**" : ""} — первая **${SHOP_SIM_NEW_PRICE_RUB}** ₽ (+**${SHOP_SIM_START_BALANCE_RUB}** ₽ на баланс), замена **${SHOP_SIM_NEW_PRICE_RUB}** ₽`
    : `• Симка — сначала **телефон**`;
  const lines = [
    `Баланс: **${fmt(u.rubles)}** ₽`,
    "",
    "**Список товаров:**",
    `• Телефон — **${SHOP_PHONE_PRICE_RUB}** ₽${u.hasPhone ? " **(куплено)**" : ""}`,
    simLine,
  ];
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Магазин").setDescription(lines.join("\n")).setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildShopHubRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_PHONE)
        .setLabel(u.hasPhone ? "Телефон (куплено)" : "Телефон")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(u.hasPhone),
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_SIM)
        .setLabel("Симка")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!u.hasPhone),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildShopSimEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const hasSim = Boolean(u.courierSimNumber);
  const lines: string[] = [
    hasSim
      ? "**Замена номера** — новый случайный 5-значный номер (**" +
        SHOP_SIM_NEW_PRICE_RUB +
        " ₽**). Текущий баланс симки **не меняется**. Старый номер может снова попасть в продажу."
      : "**Первая симка** — случайный 5-значный номер (**" +
        SHOP_SIM_NEW_PRICE_RUB +
        " ₽**), на баланс симки **+" +
        SHOP_SIM_START_BALANCE_RUB +
        " ₽**.",
    "",
    u.hasPhone ? "" : "**Сначала купите телефон** — без него симку оформить нельзя.",
    "",
    "Пополнить сим: введите сумму в ₽ — **столько же** зачислится на баланс симки (списание с основного счёта).",
    "",
    hasSim ? `Текущий номер: **${u.courierSimNumber}** · баланс: **${fmt(u.simBalanceRub ?? 0)} ₽**` : "Симки ещё **нет**.",
  ].filter(Boolean);
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Магазин · Симка").setDescription(lines.join("\n")).setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildShopSimRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const canNew = u.hasPhone && u.rubles >= SHOP_SIM_NEW_PRICE_RUB;
  const canTop = u.hasPhone && Boolean(u.courierSimNumber);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_SIM_NEW)
        .setLabel(u.courierSimNumber ? "Заменить сим" : "Купить симку")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!canNew),
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_SIM_TOPUP_OPEN)
        .setLabel("Пополнить сим…")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!canTop),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_HUB).setLabel("Назад в магазин").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildCourierBikeRow(member: GuildMember): ActionRowBuilder<ButtonBuilder> {
  const u = getEconomyUser(member.guild.id, member.id);
  const r = u.rubles;
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ECON_COURIER_BIKE_1D)
      .setLabel(`Вел 1д (${COURIER_BIKE_1D_RUB} ₽)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(r < COURIER_BIKE_1D_RUB),
    new ButtonBuilder()
      .setCustomId(ECON_COURIER_BIKE_3D)
      .setLabel(`Вел 3д (${COURIER_BIKE_3D_RUB} ₽)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(r < COURIER_BIKE_3D_RUB),
    new ButtonBuilder()
      .setCustomId(ECON_COURIER_BIKE_7D)
      .setLabel(`Вел 7д (${COURIER_BIKE_7D_RUB} ₽)`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(r < COURIER_BIKE_7D_RUB),
  );
}

function extendBikeRentalMs(curUntil: number | undefined, now: number, addMs: number): number {
  const base = curUntil && curUntil > now ? curUntil : now;
  return base + addMs;
}

function getJobExp(u: ReturnType<typeof getEconomyUser>, jobId: JobId): number {
  return Math.max(0, Math.floor((u.jobExp as any)?.[jobId] ?? 0));
}

function effectiveCourierCooldownMs(u: ReturnType<typeof getEconomyUser>, now: number = Date.now()): number {
  const def = getJobDef("courier");
  if (hasActiveBikeRental(u, now)) return 2 * 60 * 60 * 1000;
  return def.baseCooldownMs;
}

function canWorkNow(u: ReturnType<typeof getEconomyUser>, jobId: JobId, now: number): { ok: boolean; msLeft: number } {
  const def = getAnyJobDef(jobId);
  const cd = jobId === "courier" ? effectiveCourierCooldownMs(u, now) : def.baseCooldownMs;
  const last = u.lastWorkAt ?? 0;
  const next = last + cd;
  if (now >= next) return { ok: true, msLeft: 0 };
  return { ok: false, msLeft: next - now };
}

function buildWorkMenuEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.jobId) {
    return new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Работа")
      .setDescription(["Текущая работа: **не выбрана**", "", "Выберите раздел ниже."].join("\n"))
      .setFooter({ text: `Запросил: ${member.user.tag}` });
  }
  const def = getAnyJobDef(u.jobId);
  const now = Date.now();
  const state = canWorkNow(u, u.jobId, now);
  const cd = u.jobId === "courier" ? effectiveCourierCooldownMs(u, now) : def.baseCooldownMs;
  const lines = [
    `Текущая работа: **${def.title}**`,
    `Оплата за смену: **${jobPayoutShortForMenu(u.jobId, def.basePayoutRub)}** · КД: **${cdHoursLabel(cd)} ч**`,
    state.ok ? "Смена: **доступна сейчас**." : `Смена: через **${formatCooldown(state.msLeft)}**.`,
  ];
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Работа")
    .setDescription([...lines, "", "Сверху — смена и «моя работа», ниже — каталог профессий."].join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildWorkMenuRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.jobId) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_STARTERS).setLabel("Без навыка (начальные)").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_TIER2).setLabel("С навыком (тир 2)").setStyle(ButtonStyle.Secondary),
      ),
      buildMenuRow(),
    ];
  }
  const now = Date.now();
  const state = canWorkNow(u, u.jobId, now);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const shiftRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(ECON_WORK_BUTTON_SHIFT)
      .setLabel("Выйти на смену")
      .setStyle(ButtonStyle.Success)
      .setDisabled(!state.ok),
    new ButtonBuilder()
      .setCustomId(ECON_WORK_BUTTON_MY_JOB)
      .setLabel("Моя работа")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!u.jobId),
  );
  rows.push(shiftRow);
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_STARTERS).setLabel("Без навыка (начальные)").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_TIER2).setLabel("С навыком (тир 2)").setStyle(ButtonStyle.Secondary),
    ),
  );
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function cdHoursLabel(ms: number): string {
  const h = ms / (60 * 60 * 1000);
  if (Math.abs(h - Math.round(h)) < 1e-9) return String(Math.round(h));
  return h.toLocaleString("ru-RU", { maximumFractionDigits: 1 });
}

function formatJobTierReqLine(def: JobDef): string {
  const r = def.reqSkills;
  if (!r || Object.keys(r).length === 0) return "Навыки не требуются.";
  const parts: string[] = [];
  for (const k of ["communication", "logistics", "discipline"] as const) {
    const need = r[k];
    if (need && need > 0) {
      const nm = k === "communication" ? "Коммуникация" : k === "logistics" ? "Логистика" : "Дисциплина";
      parts.push(`${nm} **${need}+**`);
    }
  }
  return parts.join(", ");
}

function buildStarterJobsEmbed(member: GuildMember): EmbedBuilder {
  const lines: string[] = [];
  for (const d of JOBS_STARTER) {
    const cdh = cdHoursLabel(d.baseCooldownMs);
    const pay = jobPayoutShortForMenu(d.id, d.basePayoutRub);
    let s = `**${d.title}** — ${pay}, КД **${cdh} ч**.`;
    if (d.id === "courier") {
      s += ` С баланса сим: **${COURIER_SIM_24H_FEE_RUB}** ₽ на **тариф 24 ч** онлайн при необходимости; внутри тарифа без доп. списаний с сим.`;
    } else if (d.id === "waiter") {
      s += " Оклад **без фикса** (рандом прибыли/убытка).";
    } else {
      s += " Стабильный **фикс**.";
    }
    lines.push(s);
  }
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Начальные профессии (тир 1)")
    .setDescription(["Сводка по всем работам тира; **подробно** — в карточке профессии.", "", ...lines].join("\n\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildTier2JobsOverviewEmbed(member: GuildMember): EmbedBuilder {
  const lines: string[] = [];
  for (const d of JOBS_TIER2) {
    const cdh = cdHoursLabel(d.baseCooldownMs);
    const pay = jobPayoutShortForMenu(d.id, d.basePayoutRub);
    lines.push(`**${d.title}** — ${pay}, КД **${cdh} ч**. Требования: ${formatJobTierReqLine(d)}`);
  }
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Профессии (тир 2)")
    .setDescription(["Сводка по всем работам тира; **подробно** — в карточке профессии.", "", ...lines].join("\n\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildStarterJobsRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}courier`).setLabel("Курьер").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}waiter`).setLabel("Официант").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}watchman`).setLabel("Ночной сторож").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_WORK).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildJobInfoEmbed(member: GuildMember, jobId: JobId): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const def = getAnyJobDef(jobId);
  const now = Date.now();
  const cd = jobId === "courier" ? effectiveCourierCooldownMs(u, now) : def.baseCooldownMs;
  const extra: string[] = [];
  const exp = getJobExp(u, jobId);
  extra.push(`Опыт смен на **этой** профессии: **${exp}**`);
  if (jobId === "courier" && u.jobId === "courier") {
    extra.push("");
    extra.push(...courierWorkExtrasLines(u, now));
  }
  const req = meetsJobReq(u, def);
  if ((def.reqSkills ?? {}) && Object.keys(def.reqSkills ?? {}).length > 0) {
    extra.push("");
    extra.push(req.ok ? "Требования: **выполнены**." : `Требования: **не выполнены**.\n- ${req.missing.join("\n- ")}`);
  }

  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle(`${def.title}`)
    .setDescription(
      [
        def.description,
        "",
        jobPayoutEmbedLine(jobId, def.basePayoutRub),
        `КД смены: **${cdHoursLabel(cd)} ч**`,
        ...(extra.length ? ["", ...extra] : []),
        "",
        u.jobId === jobId ? "Статус: **это ваша текущая работа**." : "Статус: **не выбрана**.",
      ].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function isTier2JobId(jobId: JobId): boolean {
  return JOBS_TIER2.some((j) => j.id === jobId);
}

function buildSwitchJobConfirmEmbed(member: GuildMember, newJobId: JobId): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const oldTitle = u.jobId ? jobTitle(u.jobId) : "—";
  const nextTitle = getAnyJobDef(newJobId).title;
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Смена работы")
    .setDescription(`Уволиться с **${oldTitle}** и устроиться **${nextTitle}**?`)
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildSwitchJobConfirmRows(newJobId: JobId): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_WORK_BUTTON_SWITCH_CONFIRM_PREFIX}${newJobId}`)
        .setLabel("Да, устроиться сюда")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}${newJobId}`)
        .setLabel("Назад")
        .setStyle(ButtonStyle.Secondary),
    ),
    buildMenuRow(),
  ];
}

function buildJobInfoRows(member: GuildMember, jobId: JobId, canTakeSkills: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const backId = isTier2JobId(jobId) ? ECON_WORK_BUTTON_TIER2 : ECON_WORK_BUTTON_STARTERS;
  const now = Date.now();
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  if (u.jobId === jobId) {
    const state = canWorkNow(u, jobId, now);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_WORK_BUTTON_SHIFT)
          .setLabel("Выйти на смену")
          .setStyle(ButtonStyle.Success)
          .setDisabled(!state.ok),
        new ButtonBuilder()
          .setCustomId(ECON_WORK_BUTTON_QUIT)
          .setLabel("Уволиться")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!state.ok),
      ),
    );
    if (jobId === "courier" && !hasActiveBikeRental(u, now)) {
      rows.push(buildCourierBikeRow(member));
    }
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(backId).setLabel("Назад").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
      ),
    );
    return rows;
  }

  const takeId = `${ECON_WORK_BUTTON_TAKE_PREFIX}${jobId}`;
  const switchOk = !u.jobId || canWorkNow(u, u.jobId, now).ok;
  const selectDisabled = !canTakeSkills || !switchOk;

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(takeId)
        .setLabel("Выбрать")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(selectDisabled),
      new ButtonBuilder().setCustomId(backId).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  );
  rows.push(buildMenuRow());
  return rows;
}

function buildCurrentJobEmbed(
  member: GuildMember,
  opts?: { lastShiftDeltaRub?: number; lastShiftNotes?: string[] },
): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.jobId) {
    return new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Работа")
      .setDescription("Работа не выбрана. Перейдите в «Без навыка (начальные)» и выберите профессию.")
      .setFooter({ text: `Запросил: ${member.user.tag}` });
  }
  const def = getAnyJobDef(u.jobId);
  const now = Date.now();
  const cd = u.jobId === "courier" ? effectiveCourierCooldownMs(u, now) : def.baseCooldownMs;
  const state = canWorkNow(u, u.jobId, now);
  const exp = getJobExp(u, u.jobId);
  const lines = [
    `Текущая работа: **${def.title}**`,
    `Опыт смен на этой работе: **${exp}**`,
    jobPayoutEmbedLine(u.jobId, def.basePayoutRub),
    `КД смены: **${cdHoursLabel(cd)} ч**`,
    state.ok ? "Смена: **доступна сейчас**." : `Смена: через **${formatCooldown(state.msLeft)}**.`,
  ];
  if (u.jobId === "courier") {
    lines.push("");
    lines.push(...courierWorkExtrasLines(u, now));
  }

  if (opts?.lastShiftDeltaRub != null) {
    lines.push("");
    lines.push(`Последняя смена: **${formatDelta(opts.lastShiftDeltaRub)}**`);
    if (opts.lastShiftNotes?.length) {
      lines.push(`Детали: ${opts.lastShiftNotes.join(", ")}`);
    }
  }

  return new EmbedBuilder().setColor(PROFILE_COLOR).setTitle("Моя работа").setDescription(lines.join("\n")).setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildCurrentJobRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  if (!u.jobId) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_STARTERS).setLabel("Выбрать работу").setStyle(ButtonStyle.Primary),
      ),
    );
    rows.push(buildMenuRow());
    return rows;
  }

  const state = canWorkNow(u, u.jobId, now);
  const backId = isTier2JobId(u.jobId) ? ECON_WORK_BUTTON_TIER2 : ECON_WORK_BUTTON_STARTERS;
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_SHIFT).setLabel("Выйти на смену").setStyle(ButtonStyle.Success).setDisabled(!state.ok),
      new ButtonBuilder()
        .setCustomId(ECON_WORK_BUTTON_QUIT)
        .setLabel("Уволиться")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!state.ok),
    ),
  );
  if (u.jobId === "courier" && !hasActiveBikeRental(u, now)) {
    rows.push(buildCourierBikeRow(member));
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(backId).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function skillName(id: SkillId): string {
  if (id === "communication") return "Коммуникация";
  if (id === "logistics") return "Логистика";
  return "Дисциплина";
}

const SKILLS: Array<{ id: SkillId; title: string }> = [
  { id: "communication", title: "Коммуникация" },
  { id: "logistics", title: "Логистика" },
  { id: "discipline", title: "Дисциплина" },
];

const ECON_SKILL_BUTTON_PREFIX = "econ:skill:";
// Общий КД на любую тренировку: ~2–3 раза в сутки при активной игре.
const TRAIN_COOLDOWN_MS = 8 * 60 * 60 * 1000;

function buildSkillsEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const left = u.lastTrainAt ? Math.max(0, u.lastTrainAt + TRAIN_COOLDOWN_MS - now) : 0;
  const cdLine = left > 0 ? `Следующая тренировка (любой навык) через **${formatCooldown(left)}**.` : "Тренировка **доступна сейчас**.";
  const lines = SKILLS.map((s) => `- **${s.title}**: ${getSkillLevel(u, s.id)} / ${ECONOMY_SKILL_MAX}`);
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Навыки")
    .setDescription([cdLine, "", ...lines, "", "Выбери навык, чтобы тренироваться."].join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildSkillsRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const cooldownReady = !u.lastTrainAt || now >= u.lastTrainAt + TRAIN_COOLDOWN_MS;
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const s of SKILLS) {
    const atMax = getSkillLevel(u, s.id) >= ECONOMY_SKILL_MAX;
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SKILL_BUTTON_PREFIX}${s.id}`)
        .setLabel(`Тренировать: ${s.title}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!cooldownReady || atMax),
    );
  }
  return [row, buildMenuRow()];
}

function buildFeedEmbed(guildId: string, guildName: string): EmbedBuilder {
  const events = listFeedEvents(guildId);
  const last = [...events].slice(-10).reverse();
  const lines =
    last.length === 0
      ? ["Пока пусто. События появятся после первых действий участников."]
      : last.map((e) => `• <t:${Math.floor(e.ts / 1000)}:t> — ${e.text}`);

  return new EmbedBuilder()
    .setColor(FEED_COLOR)
    .setTitle("Лента активности")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Сервер: ${guildName} · хранится 50 событий` });
}

function buildFeedRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_FEED_BUTTON_ARCHIVE).setLabel("Архив").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildFeedArchiveRows(page: number, totalPages: number): ActionRowBuilder<ButtonBuilder>[] {
  const prevPage = Math.max(1, page - 1);
  const nextPage = Math.min(totalPages, page + 1);

  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${ECON_FEED_BUTTON_PAGE_PREFIX}${prevPage}`)
      .setLabel("◀")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`${ECON_FEED_BUTTON_PAGE_PREFIX}${nextPage}`)
      .setLabel("▶")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
    new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
  );

  return [nav];
}

function buildFeedArchiveEmbed(guildId: string, page: number): { embed: EmbedBuilder; totalPages: number } {
  const events = listFeedEvents(guildId);
  const totalPages = Math.max(1, Math.ceil(events.length / 10));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const slice = [...events].reverse().slice((safePage - 1) * 10, safePage * 10);
  const lines =
    slice.length === 0 ? ["Пока пусто."] : slice.map((e) => `• <t:${Math.floor(e.ts / 1000)}:t> — ${e.text}`);
  const embed = new EmbedBuilder()
    .setColor(FEED_COLOR)
    .setTitle(`Лента: архив (${safePage}/${totalPages})`)
    .setDescription(lines.join("\n"));
  return { embed, totalPages };
}

export async function ensureEconomyTerminalPanel(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    const chId = economyTerminalChannelId(guild.id);
    if (!chId) continue;

    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased() || ch.isDMBased()) continue;
    if (!ch.isSendable()) continue;

    const payload = { embeds: [buildTerminalPublicEmbed(ch.guild.name)], components: buildTerminalPublicRows() };

    const storedId = getEconomyTerminalPanelMessageId(chId);
    if (storedId) {
      const msg = await ch.messages.fetch(storedId).catch(() => null);
      const botId = client.user?.id;
      if (msg && botId && msg.author.id === botId) {
        try {
          await msg.edit(payload);
          continue;
        } catch {
          /* создадим новую */
        }
      }
    }

    const sent = await ch.send(payload);
    setEconomyTerminalPanelMessageId(chId, sent.id);
  }
}

export async function ensureEconomyFeedPanel(client: Client) {
  for (const guild of client.guilds.cache.values()) {
    const chId = economyFeedChannelId(guild.id);
    if (!chId) continue;

    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch?.isTextBased() || ch.isDMBased()) continue;
    if (!ch.isSendable()) continue;

    const payload = { embeds: [buildFeedEmbed(guild.id, guild.name)], components: buildFeedRows() };

    const storedId = getEconomyFeedPanelMessageId(chId);
    if (storedId) {
      const msg = await ch.messages.fetch(storedId).catch(() => null);
      const botId = client.user?.id;
      if (msg && botId && msg.author.id === botId) {
        try {
          await msg.edit(payload);
          continue;
        } catch {
          /* создадим новую */
        }
      }
    }

    const sent = await ch.send(payload);
    setEconomyFeedPanelMessageId(chId, sent.id);
  }
}

async function replyOrUpdate(interaction: ButtonInteraction, payload: { embeds: EmbedBuilder[]; components: any[] }) {
  const isEphemeralMessage = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
  if (interaction.message && isEphemeralMessage) {
    await interaction.update(payload);
    return;
  }
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

/** Обновить то же сообщение с кнопкой (эпhemeral или канал) — для согласованности нескольких панелей. */
async function updateButtonParentMessage(
  interaction: ButtonInteraction,
  payload: { embeds: EmbedBuilder[]; components: any[]; content?: string },
) {
  if (interaction.message) {
    await interaction.update({
      embeds: payload.embeds,
      components: payload.components,
      ...(payload.content !== undefined ? { content: payload.content } : {}),
    });
    return;
  }
  await interaction.reply({
    embeds: payload.embeds,
    components: payload.components,
    flags: MessageFlags.Ephemeral,
    ...(payload.content !== undefined ? { content: payload.content } : {}),
  });
}

function courierWorkRefreshPayload(member: GuildMember, interaction: ButtonInteraction): { embeds: EmbedBuilder[]; components: ActionRowBuilder<ButtonBuilder>[] } {
  const t = interaction.message?.embeds[0]?.title;
  if (t === "Моя работа") {
    return { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) };
  }
  const defC = getAnyJobDef("courier");
  const reqC = meetsJobReq(getEconomyUser(member.guild.id, member.id), defC);
  return { embeds: [buildJobInfoEmbed(member, "courier")], components: buildJobInfoRows(member, "courier", reqC.ok) };
}

function isEconomyButton(id: string): boolean {
  return (
    [
      ECON_BUTTON_MENU,
      ECON_BUTTON_PROFILE,
      ECON_PROFILE_BUTTON_INFO,
      ECON_PROFILE_BUTTON_FOCUS,
      ECON_PROFILE_BUTTON_LADDER,
      ECON_PROFILE_BUTTON_BETS_HISTORY,
      ECON_BUTTON_FOCUS_ROLE,
      ECON_BUTTON_FOCUS_BALANCE,
      ECON_BUTTON_FOCUS_MONEY,
      ECON_BUTTON_WORK,
      ECON_BUTTON_SHOP,
      ECON_SHOP_HUB,
      ECON_SHOP_PHONE,
      ECON_SHOP_SIM,
      ECON_SHOP_SIM_NEW,
      ECON_SHOP_SIM_TOPUP_OPEN,
      ECON_COURIER_BIKE_1D,
      ECON_COURIER_BIKE_3D,
      ECON_COURIER_BIKE_7D,
      ECON_WORK_BUTTON_STARTERS,
      ECON_WORK_BUTTON_TIER2,
      ECON_WORK_BUTTON_SHIFT,
      ECON_WORK_BUTTON_MY_JOB,
      ECON_WORK_BUTTON_QUIT,
      ECON_WORK_BUTTON_QUIT_CONFIRM,
      ECON_BUTTON_SKILLS,
      ECON_BUTTON_PLAYERS,
      ECON_PLAYERS_BUTTON_TOP_PS,
      ECON_PLAYERS_BUTTON_TOP_RUB,
      ECON_FEED_BUTTON_ARCHIVE,
    ].includes(id) || false
  );
}

function buildCooldownBlockedEmbed(member: GuildMember, msLeft: number): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Недоступно")
    .setDescription(`Нельзя выполнить действие, пока идёт КД текущей смены.\nОсталось: **${formatCooldown(msLeft)}**.`)
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

export async function handleEconomyButton(interaction: ButtonInteraction): Promise<boolean> {
  const cid = interaction.customId;
  const isKnown =
    isEconomyButton(cid) ||
    cid.startsWith(ECON_FEED_BUTTON_PAGE_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_JOB_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_TAKE_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_SWITCH_CONFIRM_PREFIX) ||
    cid.startsWith("econ:shop") ||
    cid.startsWith(ECON_SKILL_BUTTON_PREFIX);
  if (!isKnown) return false;
  if (!interaction.inGuild() || !interaction.guildId || !interaction.member) {
    await interaction.reply({ content: "Эта кнопка работает только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const member = interaction.member as GuildMember;
  if (member.user.bot) {
    await interaction.reply({ content: "Ботам экономика не положена.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const id = interaction.customId;

  if (id === ECON_BUTTON_MENU) {
    await replyOrUpdate(interaction, {
      embeds: [buildTerminalPanelEmbed(member.guild.name)],
      components: buildTerminalPanelRows(),
    });
    return true;
  }

  if (id === ECON_BUTTON_PROFILE) {
    await replyOrUpdate(interaction, { embeds: [buildProfileHubEmbed(member)], components: buildProfileHubRows("info") });
    return true;
  }

  if (id === ECON_PROFILE_BUTTON_INFO) {
    await replyOrUpdate(interaction, { embeds: [buildProfileEmbed(member)], components: buildProfileHubRows("info") });
    return true;
  }

  if (id === ECON_PROFILE_BUTTON_FOCUS) {
    const u = getEconomyUser(member.guild.id, member.id);
    await replyOrUpdate(interaction, { embeds: [buildFocusEmbed(member)], components: buildFocusRows(u.focus) });
    return true;
  }

  if (id === ECON_PROFILE_BUTTON_LADDER) {
    await replyOrUpdate(interaction, { embeds: [buildLadderEmbed(member)], components: buildProfileHubRows("ladder") });
    return true;
  }

  if (id === ECON_PROFILE_BUTTON_BETS_HISTORY) {
    await replyOrUpdate(interaction, { embeds: [buildProfileBetHistoryEmbed(member)], components: buildProfileHubRows("bets") });
    return true;
  }

  if (id === ECON_BUTTON_WORK) {
    await replyOrUpdate(interaction, { embeds: [buildWorkMenuEmbed(member)], components: buildWorkMenuRows(member) });
    return true;
  }

  if (id === ECON_WORK_BUTTON_MY_JOB) {
    const uj = getEconomyUser(member.guild.id, member.id);
    if (!uj.jobId) {
      await interaction.reply({ content: "Сначала выберите работу в каталоге.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
    return true;
  }

  if (id === ECON_BUTTON_SHOP) {
    await replyOrUpdate(interaction, { embeds: [buildShopHubEmbed(member)], components: buildShopHubRows(member) });
    return true;
  }

  if (id === ECON_SHOP_HUB) {
    await replyOrUpdate(interaction, { embeds: [buildShopHubEmbed(member)], components: buildShopHubRows(member) });
    return true;
  }

  if (id === ECON_SHOP_PHONE) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (u.hasPhone) {
      await interaction.reply({ content: "У вас уже есть телефон.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (u.rubles < SHOP_PHONE_PRICE_RUB) {
      await interaction.reply({ content: `Нужно **${SHOP_PHONE_PRICE_RUB} ₽** для телефона.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    patchEconomyUser(member.guild.id, member.id, { rubles: u.rubles - SHOP_PHONE_PRICE_RUB, hasPhone: true });
    await replyOrUpdate(interaction, { embeds: [buildShopHubEmbed(member)], components: buildShopHubRows(member) });
    return true;
  }

  if (id === ECON_SHOP_SIM) {
    const su = getEconomyUser(member.guild.id, member.id);
    if (!su.hasPhone) {
      await interaction.reply({ content: "Без **телефона** симку оформить нельзя — сначала купите телефон в магазине.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildShopSimEmbed(member)], components: buildShopSimRows(member) });
    return true;
  }

  if (id === ECON_SHOP_SIM_NEW) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (!u.hasPhone) {
      await interaction.reply({ content: "Без **телефона** симку купить нельзя.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (u.rubles < SHOP_SIM_NEW_PRICE_RUB) {
      await interaction.reply({ content: `Нужно **${SHOP_SIM_NEW_PRICE_RUB} ₽**.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    const old = u.courierSimNumber;
    if (old) releaseSimNumberToPool(old);
    const next = rollNewSimDigits();
    const replacing = Boolean(old);
    patchEconomyUser(member.guild.id, member.id, {
      rubles: u.rubles - SHOP_SIM_NEW_PRICE_RUB,
      courierSimNumber: next,
      simBalanceRub: replacing ? (u.simBalanceRub ?? 0) : SHOP_SIM_START_BALANCE_RUB,
    });
    await replyOrUpdate(interaction, { embeds: [buildShopSimEmbed(member)], components: buildShopSimRows(member) });
    return true;
  }

  if (id === ECON_SHOP_SIM_TOPUP_OPEN) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (!u.hasPhone) {
      await interaction.reply({ content: "Нужен **телефон**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!u.courierSimNumber) {
      await interaction.reply({ content: "Сначала купите симку.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const modal = new ModalBuilder().setCustomId(ECON_MODAL_SIM_TOPUP).setTitle("Пополнить симку");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel("Сумма в ₽ (со счёта → на баланс сим)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(1)
          .setMaxLength(12),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (id === ECON_COURIER_BIKE_1D || id === ECON_COURIER_BIKE_3D || id === ECON_COURIER_BIKE_7D) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (u.jobId !== "courier") {
      await interaction.reply({ content: "Аренда вела доступна только на **работе курьера**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const now = Date.now();
    if (hasActiveBikeRental(u, now)) {
      const fresh = courierWorkRefreshPayload(member, interaction);
      await updateButtonParentMessage(interaction, {
        content: "Электровел **уже в аренде** — сообщение обновлено, кнопки аренды скрыты.",
        ...fresh,
      });
      return true;
    }
    const ms = id === ECON_COURIER_BIKE_1D ? BIKE_1D_MS : id === ECON_COURIER_BIKE_3D ? BIKE_3D_MS : BIKE_7D_MS;
    const price = id === ECON_COURIER_BIKE_1D ? COURIER_BIKE_1D_RUB : id === ECON_COURIER_BIKE_3D ? COURIER_BIKE_3D_RUB : COURIER_BIKE_7D_RUB;
    if (u.rubles < price) {
      await interaction.reply({ content: `Нужно **${price} ₽**.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    const nextUntil = extendBikeRentalMs(u.courierBikeUntilMs, now, ms);
    patchEconomyUser(member.guild.id, member.id, { rubles: u.rubles - price, courierBikeUntilMs: nextUntil });
    const refreshed = courierWorkRefreshPayload(member, interaction);
    await updateButtonParentMessage(interaction, refreshed);
    return true;
  }

  if (id === ECON_WORK_BUTTON_STARTERS) {
    // Пока откат после смены не прошёл — запрещаем смену работы.
    const u = getEconomyUser(member.guild.id, member.id);
    if (u.jobId) {
      const st = canWorkNow(u, u.jobId, Date.now());
      if (!st.ok) {
        await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildWorkMenuRows(member) });
        return true;
      }
    }
    await replyOrUpdate(interaction, { embeds: [buildStarterJobsEmbed(member)], components: buildStarterJobsRows() });
    return true;
  }

  if (id === ECON_WORK_BUTTON_TIER2) {
    // Пока откат после смены не прошёл — запрещаем смену работы.
    const u = getEconomyUser(member.guild.id, member.id);
    if (u.jobId) {
      const st = canWorkNow(u, u.jobId, Date.now());
      if (!st.ok) {
        await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildWorkMenuRows(member) });
        return true;
      }
    }
    const embed = buildTier2JobsOverviewEmbed(member);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}dispatcher`).setLabel("Диспетчер").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}assembler`).setLabel("Сборщик").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}expediter`).setLabel("Экспедитор").setStyle(ButtonStyle.Secondary),
    );
    const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_WORK).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    );
    await replyOrUpdate(interaction, { embeds: [embed], components: [row, nav] });
    return true;
  }

  if (id.startsWith(ECON_WORK_BUTTON_JOB_PREFIX)) {
    const raw = id.slice(ECON_WORK_BUTTON_JOB_PREFIX.length);
    if (!isWorkJobId(raw)) {
      await interaction.reply({ content: "Неизвестная профессия.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const jobId = raw;
    const u = getEconomyUser(member.guild.id, member.id);
    const def = getAnyJobDef(jobId);
    const req = meetsJobReq(u, def);
    await replyOrUpdate(interaction, { embeds: [buildJobInfoEmbed(member, jobId)], components: buildJobInfoRows(member, jobId, req.ok) });
    return true;
  }

  if (id.startsWith(ECON_WORK_BUTTON_TAKE_PREFIX)) {
    const raw = id.slice(ECON_WORK_BUTTON_TAKE_PREFIX.length);
    if (!isWorkJobId(raw)) {
      await interaction.reply({ content: "Неизвестная профессия.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const jobId = raw;
    const cur = getEconomyUser(member.guild.id, member.id);
    const def = getAnyJobDef(jobId);
    const req = meetsJobReq(cur, def);
    if (!req.ok) {
      await interaction.reply({ content: `Не хватает навыков:\n- ${req.missing.join("\n- ")}`, flags: MessageFlags.Ephemeral });
      return true;
    }

    if (cur.jobId) {
      const st = canWorkNow(cur, cur.jobId, Date.now());
      if (!st.ok) {
        await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildWorkMenuRows(member) });
        return true;
      }
      if (cur.jobId !== jobId) {
        await replyOrUpdate(interaction, {
          embeds: [buildSwitchJobConfirmEmbed(member, jobId)],
          components: buildSwitchJobConfirmRows(jobId),
        });
        return true;
      }
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }

    patchEconomyUser(member.guild.id, member.id, { jobId, jobChosenAt: Date.now() });
    await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
    return true;
  }

  if (id.startsWith(ECON_WORK_BUTTON_SWITCH_CONFIRM_PREFIX)) {
    const raw = id.slice(ECON_WORK_BUTTON_SWITCH_CONFIRM_PREFIX.length);
    if (!isWorkJobId(raw)) {
      await interaction.reply({ content: "Неизвестная профессия.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const jobId = raw;
    const cur = getEconomyUser(member.guild.id, member.id);
    const def = getAnyJobDef(jobId);
    const req = meetsJobReq(cur, def);
    if (!req.ok) {
      await interaction.reply({ content: `Не хватает навыков:\n- ${req.missing.join("\n- ")}`, flags: MessageFlags.Ephemeral });
      return true;
    }

    if (!cur.jobId) {
      patchEconomyUser(member.guild.id, member.id, { jobId, jobChosenAt: Date.now() });
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }

    const st = canWorkNow(cur, cur.jobId, Date.now());
    if (!st.ok) {
      await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildWorkMenuRows(member) });
      return true;
    }
    if (cur.jobId === jobId) {
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }

    patchEconomyUser(member.guild.id, member.id, { jobId, jobChosenAt: Date.now() });
    await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
    return true;
  }

  if (id === ECON_WORK_BUTTON_QUIT) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (!u.jobId) {
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }
    const st = canWorkNow(u, u.jobId, Date.now());
    if (!st.ok) {
      await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildWorkMenuRows(member) });
      return true;
    }
    const embed = new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Увольнение")
      .setDescription(`Вы уверены, что хотите уволиться с работы **${jobTitle(u.jobId)}**?`);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_QUIT_CONFIRM).setLabel("Да, уволиться").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(ECON_BUTTON_WORK).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    );
    await replyOrUpdate(interaction, { embeds: [embed], components: [row] });
    return true;
  }

  if (id === ECON_WORK_BUTTON_QUIT_CONFIRM) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (u.jobId) {
      const st = canWorkNow(u, u.jobId, Date.now());
      if (!st.ok) {
        await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildWorkMenuRows(member) });
        return true;
      }
    }
    patchEconomyUser(member.guild.id, member.id, { jobId: undefined, jobChosenAt: undefined, lastWorkAt: undefined });
    await replyOrUpdate(interaction, { embeds: [buildWorkMenuEmbed(member)], components: buildWorkMenuRows(member) });
    return true;
  }

  if (id === ECON_WORK_BUTTON_SHIFT) {
    const guildId = member.guild.id;
    const u = getEconomyUser(guildId, member.id);
    const jobId = u.jobId;
    if (!jobId) {
      await interaction.reply({ content: "Сначала выбери работу.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const now = Date.now();
    const st = canWorkNow(u, jobId, now);
    if (!st.ok) {
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }

    if (jobId === "courier") {
      if (!u.hasPhone) {
        await interaction.reply({ content: "Купите **телефон** в магазине терминала.", flags: MessageFlags.Ephemeral });
        return true;
      }
      if (!u.courierSimNumber) {
        await interaction.reply({ content: "Оформите **симку** в магазине.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const onlineDue = !u.courierPhonePaidUntilMs || now >= u.courierPhonePaidUntilMs;
      if (onlineDue && (u.simBalanceRub ?? 0) < COURIER_SIM_24H_FEE_RUB) {
        await interaction.reply({
          content: `На балансе сим нужно **${COURIER_SIM_24H_FEE_RUB}** ₽ за **тариф 24 ч** онлайн (пополните в магазине).`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
    }

    const def = getAnyJobDef(jobId);
    const expBefore = getJobExp(u, jobId);
    const expAfter = expBefore + 1;

    let base = def.basePayoutRub;
    let extra = 0;
    const notes: string[] = [];

    if (jobId === "waiter") {
      base = 0;
      // Широкий разброс: редкий тяжёлый минус и редкий «крупный куш», основная масса — плюс с разумным EV vs фикс курьера за тот же «тип» смены.
      const r = Math.random();
      if (r < 0.06) {
        extra = -randInt(45, 95);
        notes.push(`Убыток **${formatDelta(extra)}** — серьёзный инцидент (порча, жалоба, компенсация, штраф).`);
      } else if (r < 0.2) {
        extra = randInt(-12, 38);
        notes.push(`Сдвиг **${formatDelta(extra)}** — слабый зал или мелкие минусы на чаевых.`);
      } else if (r < 0.52) {
        extra = randInt(52, 118);
        notes.push(`Доп. **${formatDelta(extra)}** — нормальный вечер, чаевые и допродажи в плюс.`);
      } else if (r < 0.8) {
        extra = randInt(98, 178);
        notes.push(`Доп. **${formatDelta(extra)}** — оживлённый зал, хороший оборот столов.`);
      } else if (r < 0.94) {
        extra = randInt(155, 268);
        notes.push(`Доп. **${formatDelta(extra)}** — отличная смена (крупные чаевые, премия, VIP-стол).`);
      } else {
        extra = randInt(235, 380);
        notes.push(`Доп. **${formatDelta(extra)}** — «золотой» вечер: корпоратив, крупные чаевые, бонус заведения.`);
      }
    } else if (jobId === "watchman") {
      // только фикс
    } else if (jobId === "dispatcher") {
      // только фикс
    } else if (jobId === "assembler") {
      if (chance(0.025)) {
        const fine = randInt(35, 95);
        extra -= fine;
        notes.push(`штраф ${formatDelta(-fine)}`);
      }
      if (expAfter % 6 === 0) {
        const bonus = 200;
        extra += bonus;
        notes.push(`премия ${formatDelta(bonus)} (6 смен)`);
      }
    } else if (jobId === "expediter") {
      base = 0;
      const r = Math.random();
      if (r < 0.11) {
        extra = -randInt(22, 58);
        notes.push(`Штраф / убыток **${formatDelta(extra)}** — поломка груза, штраф заказчика или срыв срока.`);
      } else if (r < 0.33) {
        extra = randInt(18, 42);
        notes.push(`Доп. к смене **${formatDelta(extra)}** — ровный маршрут без сюрпризов.`);
      } else if (r < 0.68) {
        extra = randInt(48, 82);
        notes.push(`Доп. к смене **${formatDelta(extra)}** — плотный график, много точек.`);
      } else if (r < 0.9) {
        extra = randInt(72, 118);
        notes.push(`Доп. к смене **${formatDelta(extra)}** — удачные рейсы, премия за скорость.`);
      } else {
        extra = randInt(108, 185);
        notes.push(`Доп. к смене **${formatDelta(extra)}** — «жирный» день: крупные заказы и бонусы.`);
      }
    } else if (jobId === "courier") {
      // фикс в base
    }

    let jobTotal = base + extra;
    const variablePayout = jobUsesVariablePayout(jobId);
    if (!variablePayout) jobTotal = Math.max(0, jobTotal);

    let rublesNext = u.rubles;
    let simBalNext = u.simBalanceRub ?? 0;
    let phoneUntilNext = u.courierPhonePaidUntilMs;

    if (jobId === "courier") {
      const onlineDue = !u.courierPhonePaidUntilMs || now >= u.courierPhonePaidUntilMs;
      if (onlineDue) {
        simBalNext -= COURIER_SIM_24H_FEE_RUB;
        phoneUntilNext = now + COURIER_ONLINE_24H_MS;
        notes.push(`тариф 24ч ${formatDelta(-COURIER_SIM_24H_FEE_RUB)} (баланс сим)`);
      }
    }

    rublesNext += jobTotal;
    rublesNext = Math.max(0, rublesNext);

    const patch: any = {
      rubles: rublesNext,
      simBalanceRub: simBalNext,
      courierPhonePaidUntilMs: phoneUntilNext,
      lastWorkAt: now,
      jobExp: { ...(u.jobExp ?? {}), [jobId]: expAfter },
    };
    patchEconomyUser(guildId, member.id, patch);
    const walletDeltaRub = rublesNext - u.rubles;
    appendFeedEvent({
      ts: now,
      guildId,
      type: "job:shift",
      actorUserId: member.id,
      text: `${member.toString()} вышел на смену: **${def.title}** (${formatDelta(walletDeltaRub)}).${notes.length ? ` (${notes.join(", ")})` : ""}`,
    });
    await ensureEconomyFeedPanel(interaction.client);
    // Показать игроку в его же окне: сколько получил и текущий баланс.
    const after = getEconomyUser(guildId, member.id);
    const embed = buildCurrentJobEmbed(member, { lastShiftDeltaRub: walletDeltaRub, lastShiftNotes: notes });
    // В embed баланс/эксп считаются через store; убедимся, что берем уже обновлённый rubles.
    // (buildCurrentJobEmbed сам читает store, который уже обновили)
    void after;
    await replyOrUpdate(interaction, { embeds: [embed], components: buildCurrentJobRows(member) });
    return true;
  }

  if (id === ECON_BUTTON_SKILLS) {
    await replyOrUpdate(interaction, { embeds: [buildSkillsEmbed(member)], components: buildSkillsRows(member) });
    return true;
  }

  if (id.startsWith(ECON_SKILL_BUTTON_PREFIX)) {
    const skillId = id.slice(ECON_SKILL_BUTTON_PREFIX.length) as SkillId;
    if (!["communication", "logistics", "discipline"].includes(skillId)) {
      await interaction.reply({ content: "Неизвестный навык.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const u = getEconomyUser(member.guild.id, member.id);
    const now = Date.now();
    if (u.lastTrainAt && now < u.lastTrainAt + TRAIN_COOLDOWN_MS) {
      await replyOrUpdate(interaction, { embeds: [buildSkillsEmbed(member)], components: buildSkillsRows(member) });
      return true;
    }
    const curLvl = getSkillLevel(u, skillId);
    if (curLvl >= ECONOMY_SKILL_MAX) {
      await replyOrUpdate(interaction, { embeds: [buildSkillsEmbed(member)], components: buildSkillsRows(member) });
      return true;
    }
    const nextLvl = Math.min(ECONOMY_SKILL_MAX, curLvl + 1);
    patchEconomyUser(member.guild.id, member.id, {
      skills: { ...(u.skills ?? {}), [skillId]: nextLvl },
      lastTrainAt: now,
    });
    await replyOrUpdate(interaction, { embeds: [buildSkillsEmbed(member)], components: buildSkillsRows(member) });
    return true;
  }

  if ([ECON_BUTTON_FOCUS_ROLE, ECON_BUTTON_FOCUS_BALANCE, ECON_BUTTON_FOCUS_MONEY].includes(id)) {
    const next: FocusPreset = id === ECON_BUTTON_FOCUS_ROLE ? "role" : id === ECON_BUTTON_FOCUS_MONEY ? "money" : "balance";
    patchEconomyUser(member.guild.id, member.id, { focus: next });
    await replyOrUpdate(interaction, { embeds: [buildFocusEmbed(member)], components: buildFocusRows(next) });
    return true;
  }

  if (id === ECON_FEED_BUTTON_ARCHIVE) {
    const page = 1;
    const { embed, totalPages } = buildFeedArchiveEmbed(member.guild.id, page);
    await interaction.reply({
      embeds: [embed],
      components: buildFeedArchiveRows(page, totalPages),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (id.startsWith(ECON_FEED_BUTTON_PAGE_PREFIX)) {
    const raw = id.slice(ECON_FEED_BUTTON_PAGE_PREFIX.length);
    const page = Number.parseInt(raw, 10);
    const safePage = Number.isFinite(page) && page > 0 ? page : 1;
    const { embed, totalPages } = buildFeedArchiveEmbed(member.guild.id, safePage);
    await interaction.update({
      embeds: [embed],
      components: buildFeedArchiveRows(Math.min(Math.max(1, safePage), totalPages), totalPages),
    });
    return true;
  }

  if (id === ECON_BUTTON_PLAYERS) {
    await replyOrUpdate(interaction, { embeds: [buildPlayersMenuEmbed()], components: buildPlayersMenuRows() });
    return true;
  }

  if (id === ECON_PLAYERS_BUTTON_TOP_PS) {
    const e = await buildTopEmbed(member, "ps");
    await replyOrUpdate(interaction, {
      embeds: [e],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(ECON_BUTTON_PLAYERS).setLabel("Назад к игрокам").setStyle(ButtonStyle.Secondary),
        ),
        buildMenuRow(),
      ],
    });
    return true;
  }

  if (id === ECON_PLAYERS_BUTTON_TOP_RUB) {
    const e = await buildTopEmbed(member, "rub");
    await replyOrUpdate(interaction, {
      embeds: [e],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(ECON_BUTTON_PLAYERS).setLabel("Назад к игрокам").setStyle(ButtonStyle.Secondary),
        ),
        buildMenuRow(),
      ],
    });
    return true;
  }

  return false;
}

export async function handleEconomyModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const modalId = interaction.customId;

  if (modalId === ECON_MODAL_SIM_TOPUP) {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.member) {
      await interaction.reply({ content: "Эта форма работает только на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const mem = interaction.member as GuildMember;
    if (mem.user.bot) {
      await interaction.reply({ content: "Ботам экономика не положена.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const rawIn = interaction.fields.getTextInputValue("amount").trim().replace(/\s/g, "").replace(",", ".");
    const amount = Math.floor(Number(rawIn));
    if (!Number.isFinite(amount) || amount < 1) {
      await interaction.reply({ content: "Введите целое число **от 1 ₽**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const u = getEconomyUser(mem.guild.id, mem.id);
    if (!u.hasPhone || !u.courierSimNumber) {
      await interaction.reply({ content: "Нужны телефон и активная симка.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (u.rubles < amount) {
      await interaction.reply({ content: `На счёте только **${fmt(u.rubles)} ₽**.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    patchEconomyUser(mem.guild.id, mem.id, {
      rubles: u.rubles - amount,
      simBalanceRub: (u.simBalanceRub ?? 0) + amount,
    });
    await interaction.reply({
      embeds: [buildShopSimEmbed(mem)],
      components: buildShopSimRows(mem),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  return false;
}


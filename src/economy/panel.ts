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
import { getEconomyUser, listEconomyUsers, patchEconomyUser, type FocusPreset, type JobId, type SkillId } from "./userStore.js";
import { loadVoiceLadder } from "../voice/loadLadder.js";

export const ECON_BUTTON_MENU = "econ:menu";
export const ECON_BUTTON_PROFILE = "econ:profile";
export const ECON_BUTTON_FOCUS = "econ:focus";
export const ECON_BUTTON_FOCUS_ROLE = "econ:focus:role";
export const ECON_BUTTON_FOCUS_BALANCE = "econ:focus:balance";
export const ECON_BUTTON_FOCUS_MONEY = "econ:focus:money";
export const ECON_BUTTON_PLAYERS = "econ:players";
export const ECON_BUTTON_WORK = "econ:work";
export const ECON_BUTTON_SKILLS = "econ:skills";
export const ECON_BUTTON_LADDER = "econ:ladder";
const ECON_WORK_BUTTON_STARTERS = "econ:work:starters";
const ECON_WORK_BUTTON_JOB_PREFIX = "econ:work:job:";
const ECON_WORK_BUTTON_TAKE_PREFIX = "econ:work:take:";
const ECON_WORK_BUTTON_SHIFT = "econ:work:shift";
const ECON_WORK_BUTTON_PAY_SIM = "econ:work:courier:paySim";
const ECON_WORK_BUTTON_RENT_BIKE = "econ:work:courier:rentBike";
const ECON_WORK_BUTTON_QUIT = "econ:work:quit";
const ECON_WORK_BUTTON_QUIT_CONFIRM = "econ:work:quit:confirm";

const ECON_WORK_BUTTON_TIER2 = "econ:work:tier2";
const ECON_PLAYERS_BUTTON_SEARCH = "econ:players:search";
const ECON_PLAYERS_BUTTON_TOP_PS = "econ:players:topPs";
const ECON_PLAYERS_BUTTON_TOP_RUB = "econ:players:topRub";

const ECON_MODAL_PLAYER_SEARCH = "modal:econ:playerSearch";

export const ECON_FEED_BUTTON_ARCHIVE = "econFeed:archive";
const ECON_FEED_BUTTON_PAGE_PREFIX = "econFeed:page:";

const PANEL_COLOR = 0x263238;
const PROFILE_COLOR = 0x1b5e20;
const FEED_COLOR = 0x0d47a1;

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
      new ButtonBuilder().setCustomId(ECON_BUTTON_FOCUS).setLabel("Фокус").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_WORK).setLabel("Работа").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_SKILLS).setLabel("Навыки").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_LADDER).setLabel("Лестница").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
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

function buildFocusRows(cur: FocusPreset): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_BUTTON_FOCUS_ROLE)
        .setLabel(cur === "role" ? "Роль ✓" : "Роль")
        .setStyle(cur === "role" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ECON_BUTTON_FOCUS_BALANCE)
        .setLabel(cur === "balance" ? "Баланс ✓" : "Баланс")
        .setStyle(cur === "balance" ? ButtonStyle.Primary : ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(ECON_BUTTON_FOCUS_MONEY)
        .setLabel(cur === "money" ? "Деньги ✓" : "Деньги")
        .setStyle(cur === "money" ? ButtonStyle.Primary : ButtonStyle.Secondary),
    ),
    buildMenuRow(),
  ];
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

function parseUserId(raw: string): string | undefined {
  const m = raw.trim().match(/^<@!?(\d+)>$/);
  if (m) return m[1];
  if (/^\d{5,25}$/.test(raw.trim())) return raw.trim();
  return undefined;
}

function computeTierNameByPS(psTotal: number): string | undefined {
  try {
    const ladder = loadVoiceLadder().ladder;
    let cur = ladder[0]?.roleName;
    for (const t of ladder) {
      if (psTotal >= t.voiceMinutesTotal) cur = t.roleName;
    }
    return cur;
  } catch {
    return undefined;
  }
}

async function buildPlayerCardEmbed(viewer: GuildMember, targetUserId: string): Promise<EmbedBuilder> {
  const guildId = viewer.guild.id;
  const u = getEconomyUser(guildId, targetUserId);
  const tier = computeTierNameByPS(u.psTotal);

  const member = await viewer.guild.members.fetch(targetUserId).catch(() => null);
  const name = member ? (member.user.globalName ?? member.user.username) : `ID ${targetUserId}`;

  const lines = [
    `Игрок: ${member ? member.toString() : `\`${targetUserId}\``}`,
    `Имя: **${name}**`,
    "",
    `${progressName()} (прогресс роли): **${fmt(u.psTotal)}**${tier ? ` · ступень: **${tier}**` : ""}`,
    `Баланс ₽: **${fmt(u.rubles)}**`,
    `Фокус: **${focusLabel(u.focus)}**`,
  ];

  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle("Карточка игрока")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Запросил: ${viewer.user.tag}` });
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
    .setDescription(["Посмотри карточку игрока или топы по СР/₽."].join("\n"));
}

function buildPlayersMenuRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_PLAYERS_BUTTON_SEARCH).setLabel("Поиск").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_PLAYERS_BUTTON_TOP_PS).setLabel("Топ СР").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_PLAYERS_BUTTON_TOP_RUB).setLabel("Топ ₽").setStyle(ButtonStyle.Secondary),
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

function jobTitle(id: JobId): string {
  if (id === "courier") return "Курьер";
  if (id === "waiter") return "Официант";
  return "Ночной сторож";
}

function formatCooldown(msLeft: number): string {
  const sec = Math.max(0, Math.floor(msLeft / 1000));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h}ч ${m}м`;
  return `${m}м`;
}

type AnyJobId = JobId | "dispatcher" | "assembler" | "expediter";

type JobDef = {
  id: AnyJobId;
  title: string;
  baseCooldownMs: number;
  basePayoutRub: number;
  description: string;
  reqSkills?: Partial<Record<SkillId, number>>;
};

const JOBS_STARTER: JobDef[] = [
  {
    id: "courier",
    title: "Курьер",
    baseCooldownMs: 3 * 60 * 60 * 1000,
    // Тир-1: кликабельная прибыль, но с обязательными расходами.
    basePayoutRub: 80,
    description:
      [
        "Активная работа: чем чаще выходишь на смену — тем больше заработок.",
        "",
        "Особенности:",
        "- нужен **телефон**",
        "- **симка** покупается пакетом на несколько смен",
        "- можно арендовать **электровел** пакетом смен, чтобы сократить КД",
      ].join("\n"),
  },
  {
    id: "waiter",
    title: "Официант",
    baseCooldownMs: 6 * 60 * 60 * 1000,
    basePayoutRub: 60,
    description:
      [
        "Работа со случайными чаевыми и редкими штрафами.",
        "",
        "Особенности:",
        "- шанс **чаевых**",
        "- небольшой шанс **штрафа**",
        "- чаевые очень медленно улучшаются от опыта смен",
      ].join("\n"),
  },
  {
    id: "watchman",
    title: "Ночной сторож",
    baseCooldownMs: 12 * 60 * 60 * 1000,
    basePayoutRub: 140,
    description:
      [
        "Самая редкая смена: удобно тем, кто заходит нечасто.",
        "",
        "Особенности:",
        "- без требований",
        "- максимальная стабильность (без штрафов/чаевых)",
      ].join("\n"),
  },
];

function getJobDef(id: JobId): JobDef {
  const d = JOBS_STARTER.find((j) => j.id === id);
  if (!d) throw new Error(`unknown job: ${id}`);
  return d;
}

const JOBS_TIER2: JobDef[] = [
  {
    id: "dispatcher",
    title: "Диспетчер",
    baseCooldownMs: 6 * 60 * 60 * 1000,
    // Тир-2: меньше кликов, стабильнее, чуть выгоднее за день без “разрыва”.
    basePayoutRub: 140,
    description: ["Самая стабильная работа тира 2. Без штрафов и без рандома."].join("\n"),
    reqSkills: { communication: 2 },
  },
  {
    id: "assembler",
    title: "Сборщик",
    baseCooldownMs: 12 * 60 * 60 * 1000,
    basePayoutRub: 260,
    description: ["Редкие штрафы. Премия за каждые 6 смен."].join("\n"),
    reqSkills: { discipline: 2 },
  },
  {
    id: "expediter",
    title: "Экспедитор",
    baseCooldownMs: 3 * 60 * 60 * 1000,
    basePayoutRub: 0,
    description: ["Нет фиксированной оплаты: доход зависит от потока заказов (рандом с уклоном к среднему)."].join("\n"),
    reqSkills: { logistics: 3 },
  },
];

function getAnyJobDef(id: AnyJobId): JobDef {
  const s = JOBS_STARTER.find((j) => j.id === id);
  if (s) return s;
  const t2 = JOBS_TIER2.find((j) => j.id === id);
  if (t2) return t2;
  throw new Error(`unknown job: ${id}`);
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

function courierSimFeeRub(): number {
  return 60;
}

function courierBikeRentRub(): number {
  return 70;
}

function courierSimPackShifts(): number {
  return 6;
}

function courierBikePackShifts(): number {
  return 6;
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

function getJobExp(u: ReturnType<typeof getEconomyUser>, jobId: AnyJobId): number {
  return Math.max(0, Math.floor((u.jobExp as any)?.[jobId] ?? 0));
}

function effectiveCooldownMs(u: ReturnType<typeof getEconomyUser>, jobId: JobId, now: number): number {
  const def = getJobDef(jobId);
  if (jobId === "courier") {
    const hasBike = (u.courierBikeShiftsLeft ?? 0) > 0;
    if (hasBike) return 2 * 60 * 60 * 1000; // 2 часа вместо 3
  }
  return def.baseCooldownMs;
}

function canWorkNow(u: ReturnType<typeof getEconomyUser>, jobId: AnyJobId, now: number): { ok: boolean; msLeft: number } {
  const def = getAnyJobDef(jobId);
  const cd = jobId === "courier" ? effectiveCooldownMs(u, "courier", now) : def.baseCooldownMs;
  const last = u.lastWorkAt ?? 0;
  const next = last + cd;
  if (now >= next) return { ok: true, msLeft: 0 };
  return { ok: false, msLeft: next - now };
}

function buildWorkMenuEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = u.jobId ? `Текущая работа: **${jobTitle(u.jobId)}**` : "Текущая работа: **не выбрана**";
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Работа")
    .setDescription([cur, "", "Выберите раздел ниже."].join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildWorkMenuRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_STARTERS).setLabel("Без навыка (начальные)").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_TIER2).setLabel("С навыком (тир 2)").setStyle(ButtonStyle.Secondary),
    ),
    buildMenuRow(),
  ];
}

function buildStarterJobsEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Начальные профессии (без навыка)")
    .setDescription(["Выбери профессию, чтобы посмотреть условия и взять работу."].join("\n"));
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

function buildJobInfoEmbed(member: GuildMember, jobId: AnyJobId): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const def = getAnyJobDef(jobId);
  const now = Date.now();
  const cd = jobId === "courier" ? effectiveCooldownMs(u, "courier", now) : def.baseCooldownMs;
  const cdH = Math.round(cd / 360000) / 10;
  const payout = def.basePayoutRub;
  const extra: string[] = [];
  const exp = Math.max(0, Math.floor((u.jobExp as any)?.[jobId] ?? 0));
  extra.push(`Опыт смен: **${exp}**`);
  if (jobId === "courier") {
    const simLeft = u.courierSimShiftsLeft ?? 0;
    const bikeLeft = u.courierBikeShiftsLeft ?? 0;
    extra.push(`Симка: осталось смен **${simLeft}** (пакет: ${courierSimPackShifts()} смен за ${courierSimFeeRub()} ₽).`);
    extra.push(`Электровел: осталось смен **${bikeLeft}** (пакет: ${courierBikePackShifts()} смен за ${courierBikeRentRub()} ₽).`);
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
        `Оплата за смену: **${payout} ₽**`,
        `КД смены: **~${cdH} ч**`,
        ...(extra.length ? ["", ...extra] : []),
        "",
        u.jobId === (jobId as any) ? "Статус: **это ваша текущая работа**." : "Статус: **не выбрана**.",
      ].join("\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildJobInfoRows(u: ReturnType<typeof getEconomyUser>, jobId: AnyJobId, canTake: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const takeId = `${ECON_WORK_BUTTON_TAKE_PREFIX}${jobId}`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(takeId)
      .setLabel(u.jobId === (jobId as any) ? "Уже выбрано" : "Взяться за работу")
      .setStyle(ButtonStyle.Primary)
      .setDisabled(u.jobId === (jobId as any) || !canTake),
    new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_STARTERS).setLabel("Назад").setStyle(ButtonStyle.Secondary),
  );
  return [row, buildMenuRow()];
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
  const def = getAnyJobDef(u.jobId as any);
  const now = Date.now();
  const cd = u.jobId === "courier" ? effectiveCooldownMs(u, "courier", now) : def.baseCooldownMs;
  const state = canWorkNow(u, u.jobId as any, now);
  const exp = Math.max(0, Math.floor((u.jobExp as any)?.[u.jobId] ?? 0));
  const lines = [
    `Текущая работа: **${def.title}**`,
    `Опыт смен: **${exp}**`,
    `Баланс: **${fmt(u.rubles)} ₽**`,
    `Оплата за смену: **${def.basePayoutRub} ₽**`,
    `КД смены: **${Math.round(cd / 60000)} мин**`,
    state.ok ? "Смена: **доступна сейчас**." : `Смена: через **${formatCooldown(state.msLeft)}**.`,
  ];

  if (opts?.lastShiftDeltaRub != null) {
    lines.push("");
    lines.push(`Последняя смена: **${formatDelta(opts.lastShiftDeltaRub)}**`);
    if (opts.lastShiftNotes?.length) {
      lines.push(`Детали: ${opts.lastShiftNotes.join(", ")}`);
    }
  }
  if (u.jobId === "courier") {
    const simLeft = u.courierSimShiftsLeft ?? 0;
    const bikeLeft = u.courierBikeShiftsLeft ?? 0;
    lines.push("");
    lines.push(`Симка: смен осталось **${simLeft}** (пакет: ${courierSimPackShifts()} за ${courierSimFeeRub()} ₽).`);
    lines.push(`Электровел: смен осталось **${bikeLeft}** (пакет: ${courierBikePackShifts()} за ${courierBikeRentRub()} ₽).`);
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

  const state = canWorkNow(u, u.jobId as any, now);
  const shiftRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_SHIFT).setLabel("Выйти на смену").setStyle(ButtonStyle.Primary).setDisabled(!state.ok),
  );

  if (u.jobId === "courier") {
    const simOk = (u.courierSimShiftsLeft ?? 0) > 0;
    shiftRow.addComponents(
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_PAY_SIM).setLabel("Купить симку").setStyle(ButtonStyle.Secondary).setDisabled(simOk),
      new ButtonBuilder()
        .setCustomId(ECON_WORK_BUTTON_RENT_BIKE)
        .setLabel("Аренда электровела")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled((u.courierBikeShiftsLeft ?? 0) > 0),
    );
  }

  rows.push(shiftRow);
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(ECON_WORK_BUTTON_QUIT)
        .setLabel("Уволиться")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!state.ok),
      new ButtonBuilder()
        .setCustomId(ECON_WORK_BUTTON_STARTERS)
        .setLabel("Сменить")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!state.ok),
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
const TRAIN_COOLDOWN_MS = 8 * 60 * 60 * 1000;

function buildSkillsEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const left = u.lastTrainAt ? Math.max(0, u.lastTrainAt + TRAIN_COOLDOWN_MS - now) : 0;
  const cdLine = left > 0 ? `Тренировка доступна через **${formatCooldown(left)}**.` : "Тренировка **доступна сейчас**.";
  const lines = SKILLS.map((s) => `- **${s.title}**: ${getSkillLevel(u, s.id)}`);
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Навыки")
    .setDescription([cdLine, "", ...lines, "", "Выбери навык, чтобы тренироваться."].join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildSkillsRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const canTrain = !u.lastTrainAt || now >= u.lastTrainAt + TRAIN_COOLDOWN_MS;
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const s of SKILLS) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_SKILL_BUTTON_PREFIX}${s.id}`)
        .setLabel(`Тренировать: ${s.title}`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!canTrain),
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

function isEconomyButton(id: string): boolean {
  return (
    [
      ECON_BUTTON_MENU,
      ECON_BUTTON_PROFILE,
      ECON_BUTTON_FOCUS,
      ECON_BUTTON_FOCUS_ROLE,
      ECON_BUTTON_FOCUS_BALANCE,
      ECON_BUTTON_FOCUS_MONEY,
      ECON_BUTTON_WORK,
      ECON_BUTTON_LADDER,
      ECON_WORK_BUTTON_STARTERS,
      ECON_WORK_BUTTON_TIER2,
      ECON_WORK_BUTTON_SHIFT,
      ECON_WORK_BUTTON_PAY_SIM,
      ECON_WORK_BUTTON_RENT_BIKE,
      ECON_WORK_BUTTON_QUIT,
      ECON_WORK_BUTTON_QUIT_CONFIRM,
      ECON_BUTTON_SKILLS,
      ECON_BUTTON_PLAYERS,
      ECON_PLAYERS_BUTTON_SEARCH,
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
    await replyOrUpdate(interaction, { embeds: [buildProfileEmbed(member)], components: [buildMenuRow()] });
    return true;
  }

  if (id === ECON_BUTTON_LADDER) {
    await replyOrUpdate(interaction, { embeds: [buildLadderEmbed(member)], components: [buildMenuRow()] });
    return true;
  }

  if (id === ECON_BUTTON_WORK) {
    await replyOrUpdate(interaction, { embeds: [buildWorkMenuEmbed(member)], components: buildWorkMenuRows() });
    return true;
  }

  if (id === ECON_WORK_BUTTON_STARTERS) {
    // Пока откат после смены не прошёл — запрещаем смену работы.
    const u = getEconomyUser(member.guild.id, member.id);
    if (u.jobId) {
      const st = canWorkNow(u, u.jobId as any, Date.now());
      if (!st.ok) {
        await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildCurrentJobRows(member) });
        return true;
      }
    }
    await replyOrUpdate(interaction, { embeds: [buildStarterJobsEmbed()], components: buildStarterJobsRows() });
    return true;
  }

  if (id === ECON_WORK_BUTTON_TIER2) {
    // Пока откат после смены не прошёл — запрещаем смену работы.
    const u = getEconomyUser(member.guild.id, member.id);
    if (u.jobId) {
      const st = canWorkNow(u, u.jobId as any, Date.now());
      if (!st.ok) {
        await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildCurrentJobRows(member) });
        return true;
      }
    }
    const embed = new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Профессии (тир 2)")
      .setDescription("Требуют навыки. Пассивного дохода пока нет — только смены.");
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
    const jobId = id.slice(ECON_WORK_BUTTON_JOB_PREFIX.length) as AnyJobId;
    if (!["courier", "waiter", "watchman", "dispatcher", "assembler", "expediter"].includes(jobId)) {
      await interaction.reply({ content: "Неизвестная профессия.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const u = getEconomyUser(member.guild.id, member.id);
    const def = getAnyJobDef(jobId);
    const req = meetsJobReq(u, def);
    await replyOrUpdate(interaction, { embeds: [buildJobInfoEmbed(member, jobId)], components: buildJobInfoRows(u, jobId, req.ok) });
    return true;
  }

  if (id.startsWith(ECON_WORK_BUTTON_TAKE_PREFIX)) {
    const jobId = id.slice(ECON_WORK_BUTTON_TAKE_PREFIX.length) as AnyJobId;
    if (!["courier", "waiter", "watchman", "dispatcher", "assembler", "expediter"].includes(jobId)) {
      await interaction.reply({ content: "Неизвестная профессия.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const cur = getEconomyUser(member.guild.id, member.id);
    // Пока откат после смены не прошёл — запрещаем смену/взятие другой работы.
    if (cur.jobId) {
      const st = canWorkNow(cur, cur.jobId as any, Date.now());
      if (!st.ok && cur.jobId !== (jobId as any)) {
        await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildCurrentJobRows(member) });
        return true;
      }
    }
    const def = getAnyJobDef(jobId);
    const req = meetsJobReq(cur, def);
    if (!req.ok) {
      await interaction.reply({ content: `Не хватает навыков:\n- ${req.missing.join("\n- ")}`, flags: MessageFlags.Ephemeral });
      return true;
    }
    patchEconomyUser(member.guild.id, member.id, { jobId: jobId as any, jobChosenAt: Date.now() });
    await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
    return true;
  }

  if (id === ECON_WORK_BUTTON_QUIT) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (!u.jobId) {
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }
    const st = canWorkNow(u, u.jobId as any, Date.now());
    if (!st.ok) {
      await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildCurrentJobRows(member) });
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
      const st = canWorkNow(u, u.jobId as any, Date.now());
      if (!st.ok) {
        await replyOrUpdate(interaction, { embeds: [buildCooldownBlockedEmbed(member, st.msLeft)], components: buildCurrentJobRows(member) });
        return true;
      }
    }
    patchEconomyUser(member.guild.id, member.id, { jobId: undefined, jobChosenAt: undefined, lastWorkAt: undefined });
    await replyOrUpdate(interaction, { embeds: [buildWorkMenuEmbed(member)], components: buildWorkMenuRows() });
    return true;
  }

  if (id === ECON_WORK_BUTTON_PAY_SIM) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (u.jobId !== "courier") {
      await interaction.reply({ content: "Эта кнопка доступна только курьеру.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if ((u.courierSimShiftsLeft ?? 0) > 0) {
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }
    const fee = courierSimFeeRub();
    if (u.rubles < fee) {
      await interaction.reply({ content: `Недостаточно ₽ для симки (нужно ${fee} ₽).`, flags: MessageFlags.Ephemeral });
      return true;
    }
    patchEconomyUser(member.guild.id, member.id, { rubles: u.rubles - fee, courierSimShiftsLeft: courierSimPackShifts() });
    await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
    return true;
  }

  if (id === ECON_WORK_BUTTON_RENT_BIKE) {
    const u = getEconomyUser(member.guild.id, member.id);
    if (u.jobId !== "courier") {
      await interaction.reply({ content: "Эта кнопка доступна только курьеру.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if ((u.courierBikeShiftsLeft ?? 0) > 0) {
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }
    const fee = courierBikeRentRub();
    if (u.rubles < fee) {
      await interaction.reply({ content: `Недостаточно ₽ для аренды (нужно ${fee} ₽).`, flags: MessageFlags.Ephemeral });
      return true;
    }
    patchEconomyUser(member.guild.id, member.id, { rubles: u.rubles - fee, courierBikeShiftsLeft: courierBikePackShifts() });
    await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
    return true;
  }

  if (id === ECON_WORK_BUTTON_SHIFT) {
    const guildId = member.guild.id;
    const u = getEconomyUser(guildId, member.id);
    if (!u.jobId) {
      await interaction.reply({ content: "Сначала выбери работу.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const now = Date.now();
    const st = canWorkNow(u, u.jobId as any, now);
    if (!st.ok) {
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
      return true;
    }

    // требования курьера: симка оплачена сегодня
    if (u.jobId === "courier") {
      if ((u.courierSimShiftsLeft ?? 0) <= 0) {
        await interaction.reply({ content: `Перед сменой купите симку (пакет ${courierSimPackShifts()} смен за ${courierSimFeeRub()} ₽).`, flags: MessageFlags.Ephemeral });
        return true;
      }
    }

    const def = getAnyJobDef(u.jobId as any);
    const jobId = u.jobId as AnyJobId;
    const expBefore = getJobExp(u, jobId);
    const expAfter = expBefore + 1;

    let base = def.basePayoutRub;
    let extra = 0;
    const notes: string[] = [];

    if (jobId === "waiter") {
      // чаевые и штрафы. Очень медленный рост от опыта.
      const tipChance = Math.min(0.55, 0.35 + expBefore / 4000); // +0.01 за ~40 смен
      const fineChance = Math.max(0.015, 0.04 - expBefore / 6000); // медленно падает

      if (chance(fineChance)) {
        const fine = randInt(10, 30);
        extra -= fine;
        notes.push(`штраф ${formatDelta(-fine)}`);
      }

      if (chance(tipChance)) {
        // распределение: часто мелкие, редко крупные. С опытом чуть повышаем шанс среднего сегмента.
        const roll = Math.random();
        const boost = Math.min(0.08, expBefore / 8000); // очень медленно
        let tip = 0;
        if (roll < 0.72 - boost) tip = randInt(5, 18);
        else if (roll < 0.97) tip = randInt(19, 45);
        else tip = randInt(46, 110);
        extra += tip;
        notes.push(`чаевые ${formatDelta(tip)}`);
      }
    } else if (jobId === "watchman") {
      // максимально стабильно: только фикс
    } else if (jobId === "dispatcher") {
      // самая стабильная работа: только фикс
    } else if (jobId === "assembler") {
      // редкий штраф + премия каждые 6 смен
      if (chance(0.008)) {
        const fine = randInt(25, 75);
        extra -= fine;
        notes.push(`штраф ${formatDelta(-fine)}`);
      }
      if (expAfter % 6 === 0) {
        const bonus = 180;
        extra += bonus;
        notes.push(`премия ${formatDelta(bonus)} (6 смен)`);
      }
    } else if (jobId === "expediter") {
      // нет фикса: зависит от “сколько людей пришло”, чаще около среднего
      base = 0;
      // треугольное распределение 0..10 (пик около 5) — чаще средняк, редко крайности
      const people = Math.round((Math.random() + Math.random()) * 5);
      // Выплата: чаще 55–95, редко ниже/выше
      const payout =
        people <= 1
          ? randInt(20, 45)
          : people <= 3
            ? randInt(46, 70)
            : people <= 7
              ? randInt(71, 110)
              : randInt(111, 150);
      extra += payout;
      notes.push(`поток: ${people} → ${formatDelta(payout)}`);
    } else if (jobId === "courier") {
      // курьер: фикс, плюс пакеты сим/вел списываем ниже
    }

    const total = Math.max(0, base + extra);
    const patch: any = {
      rubles: u.rubles + total,
      lastWorkAt: now,
      jobExp: { ...(u.jobExp ?? {}), [jobId]: expAfter },
    };
    if (u.jobId === "courier") {
      patch.courierSimShiftsLeft = Math.max(0, (u.courierSimShiftsLeft ?? 0) - 1);
      if ((u.courierBikeShiftsLeft ?? 0) > 0) {
        patch.courierBikeShiftsLeft = Math.max(0, (u.courierBikeShiftsLeft ?? 0) - 1);
      }
    }
    patchEconomyUser(guildId, member.id, patch);
    appendFeedEvent({
      ts: now,
      guildId,
      type: "job:shift",
      actorUserId: member.id,
      text: `${member.toString()} вышел на смену: **${def.title}** (${formatDelta(total)}).${notes.length ? ` (${notes.join(", ")})` : ""}`,
    });
    await ensureEconomyFeedPanel(interaction.client);
    // Показать игроку в его же окне: сколько получил и текущий баланс.
    const after = getEconomyUser(guildId, member.id);
    const embed = buildCurrentJobEmbed(member, { lastShiftDeltaRub: total, lastShiftNotes: notes });
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
    const nextLvl = Math.min(10, curLvl + 1);
    patchEconomyUser(member.guild.id, member.id, {
      skills: { ...(u.skills ?? {}), [skillId]: nextLvl },
      lastTrainAt: now,
    });
    await replyOrUpdate(interaction, { embeds: [buildSkillsEmbed(member)], components: buildSkillsRows(member) });
    return true;
  }

  if (id === ECON_BUTTON_FOCUS) {
    const u = getEconomyUser(member.guild.id, member.id);
    await replyOrUpdate(interaction, { embeds: [buildFocusEmbed(member)], components: buildFocusRows(u.focus) });
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

  if (id === ECON_PLAYERS_BUTTON_SEARCH) {
    const modal = new ModalBuilder().setCustomId(ECON_MODAL_PLAYER_SEARCH).setTitle("Найти игрока");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("user")
          .setLabel("Пользователь (mention или ID)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (id === ECON_PLAYERS_BUTTON_TOP_PS) {
    const e = await buildTopEmbed(member, "ps");
    await replyOrUpdate(interaction, { embeds: [e], components: [buildMenuRow()] });
    return true;
  }

  if (id === ECON_PLAYERS_BUTTON_TOP_RUB) {
    const e = await buildTopEmbed(member, "rub");
    await replyOrUpdate(interaction, { embeds: [e], components: [buildMenuRow()] });
    return true;
  }

  return false;
}

export async function handleEconomyModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== ECON_MODAL_PLAYER_SEARCH) return false;
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Эта форма работает только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const raw = interaction.fields.getTextInputValue("user");
  const userId = parseUserId(raw);
  if (!userId) {
    await interaction.reply({ content: "Не понял пользователя. Введите mention или ID.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const viewer = (await interaction.guild!.members.fetch(interaction.user.id).catch(() => null)) as GuildMember | null;
  if (!viewer) {
    await interaction.reply({ content: "Не удалось получить ваш профиль участника.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const embed = await buildPlayerCardEmbed(viewer, userId);
  await interaction.reply({ embeds: [embed], components: [buildMenuRow()], flags: MessageFlags.Ephemeral });
  return true;
}


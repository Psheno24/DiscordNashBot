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
  type EconomyUser,
  type JobId,
  type SkillId,
} from "./userStore.js";
import {
  computeTier3PassiveRub,
  getTier3JobDef,
  isTier3JobId,
  JOBS_TIER3,
  SOLE_PROP_AD_CD_MS,
  SOLE_PROP_CAP_MAX,
  SOLE_PROP_CONTROL_CD_MS,
  SOLE_PROP_STAFF_CD_MS,
  TIER3_BOSS_CD_MS,
  TIER3_SIDE_GIG_CD_MS,
  tier3PatchWhenJobChanges,
  tier3PromotionRank,
  TIER3_PROMOTION_EVERY_DAYS,
  type Tier3JobDef,
  type Tier3JobId,
} from "./tier3Jobs.js";
import {
  APARTMENT_MODELS,
  CAR_MODELS,
  COURIER_SIM_MONTHLY_FEE_RUB,
  COURIER_SIM_MONTHLY_PERIOD_MS,
  getApartmentDef,
  getCarDef,
  getPhoneDef,
  APARTMENT_SELL_REFUND_RATE,
  HOUSING_CALENDAR_MONTH_MS,
  HOUSING_RENT_DAY_PKG_RUB,
  HOUSING_RENT_DAILY_MONTH_EQUIV_RUB,
  HOUSING_RENT_MONTH_PKG_RUB,
  HOUSING_RENT_PRESTIGE_ONE_TIME,
  HOUSING_RENT_WEEK_PKG_RUB,
  housingRentPlanPeriodMs,
  housingRentPlanPriceRub,
  PHONE_MODELS,
  type HousingRentPlan,
} from "./economyCatalog.js";
import { economyUserClearTier2PlusJobPatch, housingRentUnusedRefundRub } from "./economyHousing.js";
import { tier3RankTitle } from "./tier3RankTitles.js";
import { loadVoiceLadder } from "../voice/loadLadder.js";
import { listBetEvents, type BetEvent, type PlacedBet } from "../bets/store.js";
import { mskTodayYmd } from "./mskCalendar.js";
import {
  isTier12JobId,
  tier12CareerEmbedLines,
  tier12RankFlatBonusRub,
  tier12RankFromShifts,
  tier12RankTitle,
} from "./tier12Career.js";

export const ECON_BUTTON_MENU = "econ:menu";
export const ECON_BUTTON_PROFILE = "econ:profile";
export const ECON_BUTTON_HOUSING = "econ:housing";
export const ECON_BUTTON_PLAYERS = "econ:players";
export const ECON_BUTTON_WORK = "econ:work";
export const ECON_BUTTON_SKILLS = "econ:skills";
export const ECON_BUTTON_SHOP = "econ:shop";
const ECON_SHOP_HUB = "econ:shop:hub";
const ECON_SHOP_PHONE = "econ:shop:phone";
const ECON_SHOP_PHONE_BUY_PREFIX = "econ:shop:phoneBuy:";
const ECON_SHOP_CAR = "econ:shop:car";
const ECON_SHOP_CAR_BUY_PREFIX = "econ:shop:carBuy:";
const ECON_SHOP_HOUSE = "econ:shop:house";
const ECON_SHOP_HOUSE_RENT_1D = "econ:shop:house:rent:1d";
const ECON_SHOP_HOUSE_RENT_7D = "econ:shop:house:rent:7d";
const ECON_SHOP_HOUSE_RENT_30D = "econ:shop:house:rent:30d";
const ECON_SHOP_HOUSE_LEAVE = "econ:shop:house:leave";
/** Экран «Жильё» в главном меню (не магазин): только арендатор. */
const ECON_HOUSING_EDIT = "econ:housing:edit";
const ECON_HOUSING_BACK = "econ:housing:back";
const ECON_HOUSING_LEAVE = "econ:housing:leave";
const ECON_HOUSING_EXT_PREFIX = "econ:housing:ext:";
const ECON_SHOP_HOUSE_RENEW_AFTER_REQ_PREFIX = "econ:shop:house:renewReq:";
const ECON_SHOP_HOUSE_RENEW_AFTER_CNF_PREFIX = "econ:shop:house:renewCnf:";
const ECON_SHOP_HOUSE_RENEW_AFTER_CAN = "econ:shop:house:renewCan";
const ECON_SHOP_APT_BUY_PREFIX = "econ:shop:aptBuy:";
const ECON_SHOP_APT_SELL = "econ:shop:apt:sell";
const ECON_SHOP_SIM = "econ:shop:sim";
const ECON_SHOP_SIM_NEW = "econ:shop:sim:new";
const ECON_SHOP_SIM_TOPUP_OPEN = "econ:shop:sim:topupOpen";

const ECON_COURIER_BIKE_1D = "econ:work:courierbike:1d";
const ECON_COURIER_BIKE_3D = "econ:work:courierbike:3d";
const ECON_COURIER_BIKE_7D = "econ:work:courierbike:7d";

/** Развлекательный центр: база перед случайной надбавкой; плохие ветки могут увести итог в минус (MVP баланс со складом). */
const EXPEDITER_PAYOUT_FLOOR_RUB = 1_800;

/**
 * Кафе: **15** стыкующихся полос по **1000** ₽ (**−5 000…+10 000**), без дыр.
 * Веса симметрично падают к краям (пик у **1–3k**). Сумма весов = **77**.
 */
const CAFE_LADDER_WEIGHTS = [1, 2, 3, 5, 7, 9, 11, 11, 9, 7, 5, 3, 2, 1, 1] as const;
const CAFE_LADDER_SUM = CAFE_LADDER_WEIGHTS.reduce((s, w) => s + w, 0);

const CAFE_BAND_HINT: readonly string[] = [
  "Полоса **−5…−4k** — крайний минус.",
  "Полоса **−4…−3k** — тяжёлый минус.",
  "Полоса **−3…−2k** — сильный минус.",
  "Полоса **−2…−1k** — минус.",
  "Полоса **−1…0k** — около нуля или лёгкий минус.",
  "Полоса **0…1k** — скромно.",
  "Полоса **1…2k** — около доставки.",
  "Полоса **2…3k** — чуть выше среднего.",
  "Полоса **3…4k** — хорошо.",
  "Полоса **4…5k** — очень хорошо.",
  "Полоса **5…6k** — отличный вечер.",
  "Полоса **6…7k** — редкий плюс.",
  "Полоса **7…8k** — очень редкий плюс.",
  "Полоса **8…9k** — почти джекпот.",
  "Полоса **9…10k** — верхняя полоса.",
];

function rollWaiterCafePayoutRub(): { rub: number; band: number } {
  let u = Math.random() * CAFE_LADDER_SUM;
  let band = 0;
  for (; band < CAFE_LADDER_WEIGHTS.length; band++) {
    u -= CAFE_LADDER_WEIGHTS[band]!;
    if (u < 0) break;
  }
  if (band >= CAFE_LADDER_WEIGHTS.length) band = CAFE_LADDER_WEIGHTS.length - 1;
  const lo = -5_000 + band * 1_000;
  const hi = band === 14 ? 10_000 : lo + 999;
  return { rub: randInt(lo, hi), band };
}

const ECON_PROFILE_BUTTON_INFO = "econ:profile:info";
const ECON_PROFILE_BUTTON_FOCUS = "econ:profile:focus";
const ECON_PROFILE_BUTTON_LADDER = "econ:profile:ladder";
const ECON_PROFILE_BUTTON_BETS_HISTORY = "econ:profile:betsHistory";
const ECON_PROFILE_BETS_PAGE_PREFIX = "econ:profile:betsPage:";
/** Записей на страницу (лимит описания эмбеда ~4096 символов). */
const PROFILE_BETS_PAGE_SIZE = 7;

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
const ECON_WORK_BUTTON_TIER3 = "econ:work:tier3";
const ECON_WORK_BUTTON_JOB_DETAIL_PREFIX = "econ:work:jobDetail:";
const ECON_WORK_BUTTON_JOB_DETAIL_CLOSE_PREFIX = "econ:work:jobDetailClose:";
const ECON_TIER3_SIDE = "econ:work:t3:side";
const ECON_TIER3_BOSS = "econ:work:t3:boss";
const ECON_IP_AD_OPEN = "econ:work:ip:adOpen";
const ECON_IP_STAFF = "econ:work:ip:staff";
const ECON_IP_CONTROL = "econ:work:ip:control";
const ECON_IP_DEP_OPEN = "econ:work:ip:depOpen";
const ECON_IP_WD_OPEN = "econ:work:ip:wdOpen";
const ECON_PLAYERS_BUTTON_TOP_PS = "econ:players:topPs";
const ECON_PLAYERS_BUTTON_TOP_RUB = "econ:players:topRub";

const ECON_MODAL_SIM_TOPUP = "modal:econ:simTopup";
const ECON_MODAL_IP_AD = "modal:econ:ipAd";
const ECON_MODAL_IP_DEP = "modal:econ:ipDep";
const ECON_MODAL_IP_WD = "modal:econ:ipWd";

export const ECON_FEED_BUTTON_ARCHIVE = "econFeed:archive";
const ECON_FEED_BUTTON_PAGE_PREFIX = "econFeed:page:";

const PANEL_COLOR = 0x263238;
const PROFILE_COLOR = 0x1b5e20;
const FEED_COLOR = 0x0d47a1;

const SHOP_SIM_NEW_PRICE_RUB = 100;
const SHOP_SIM_START_BALANCE_RUB = 50;
const BIKE_1D_MS = 1 * 86400000;
const BIKE_3D_MS = 3 * 86400000;
const BIKE_7D_MS = 7 * 86400000;
const COURIER_BIKE_1D_RUB = 95;
const COURIER_BIKE_3D_RUB = 250;
const COURIER_BIKE_7D_RUB = 520;

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  const isWhole = Math.abs(rounded - Math.round(rounded)) < 1e-9;
  const x = isWhole ? Math.round(rounded) : rounded;
  return x.toLocaleString("ru-RU", isWhole ? { maximumFractionDigits: 0 } : { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function rentPlanLabelRu(p: HousingRentPlan | undefined): string {
  if (p === "day") return "1 сутки";
  if (p === "week") return "7 суток";
  return "30 суток";
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

function buildTerminalPanelRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const showHousing = (u.housingKind ?? "none") === "rent";
  if (showHousing) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_BUTTON_PROFILE).setLabel("Профиль").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(ECON_BUTTON_HOUSING).setLabel("Жильё").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(ECON_BUTTON_WORK).setLabel("Работа").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(ECON_BUTTON_SHOP).setLabel("Магазин").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(ECON_BUTTON_SKILLS).setLabel("Навыки").setStyle(ButtonStyle.Secondary),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_BUTTON_PLAYERS).setLabel("Игроки").setStyle(ButtonStyle.Secondary),
      ),
    ];
  }
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
  const phoneLabel = u.hasPhone ? getPhoneDef(u.phoneModelId)?.label ?? "есть" : "нет";
  if (!u.hasPhone) {
    return `Телефон (**нет**)`;
  }
  if (!u.courierSimNumber) {
    return `Телефон (**${phoneLabel}**, сим **нет**) · престиж **${fmt(u.prestigePoints ?? 0)}**`;
  }
  return `Телефон (**${phoneLabel}**, сим **${u.courierSimNumber}**) — баланс сим **${fmt(u.simBalanceRub ?? 0)}** ₽ · престиж **${fmt(u.prestigePoints ?? 0)}**`;
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

/** Чистый результат одной принятой ставки (кэф зафиксирован при приёме). */
function betStakeNetRubles(ev: BetEvent, bet: PlacedBet): number | "pending" | "cancelled" {
  if (ev.status === "cancelled") return "cancelled";
  if (ev.status !== "resolved" || !ev.winningOptionId) return "pending";
  if (bet.optionId === ev.winningOptionId) {
    const payout = Math.floor(bet.amount * bet.oddsAtPlacement);
    return payout - bet.amount;
  }
  return -bet.amount;
}

function listMemberBetStakes(member: GuildMember): { ev: BetEvent; bet: PlacedBet }[] {
  const guildId = member.guild.id;
  const userId = member.id;
  const out: { ev: BetEvent; bet: PlacedBet }[] = [];
  for (const ev of listBetEvents(guildId)) {
    const stakes = ev.bets[userId];
    if (!stakes?.length) continue;
    for (const bet of stakes) out.push({ ev, bet });
  }
  out.sort((a, b) => b.bet.ts - a.bet.ts);
  return out;
}

function buildProfileBetHistoryEmbed(member: GuildMember, page: number): EmbedBuilder {
  const mine = listMemberBetStakes(member);
  const total = mine.length;

  if (total === 0) {
    return new EmbedBuilder()
      .setColor(PROFILE_COLOR)
      .setTitle("История ставок")
      .setDescription("Пока нет ни одной ставки.")
      .setFooter({ text: `Запросил: ${member.user.tag}` });
  }

  const totalPages = Math.max(1, Math.ceil(total / PROFILE_BETS_PAGE_SIZE));
  const p = Math.max(0, Math.min(Math.floor(page), totalPages - 1));
  const slice = mine.slice(p * PROFILE_BETS_PAGE_SIZE, p * PROFILE_BETS_PAGE_SIZE + PROFILE_BETS_PAGE_SIZE);

  const blocks: string[] = [];
  for (const { ev: e, bet: b } of slice) {
    const opt = e.options.find((o) => o.id === b.optionId);
    const label = opt?.label ?? b.optionId;
    const oddStr = b.oddsAtPlacement.toLocaleString("ru-RU");
    const net = betStakeNetRubles(e, b);
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
      [
        `**${e.title}**`,
        `Ставка: **${fmt(b.amount)} ₽** на «${label}» · кэф при приёме **x${oddStr}**`,
        resultLine,
      ].join("\n"),
    );
  }

  const intro =
    totalPages > 1
      ? `_Всего ставок: **${total}** · страница **${p + 1}** из **${totalPages}**_\n\n`
      : `_Всего ставок: **${total}**_\n\n`;

  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle("История ставок")
    .setDescription(intro + blocks.join("\n\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildProfileBetsTabComponents(member: GuildMember, page: number): ActionRowBuilder<ButtonBuilder>[] {
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const mine = listMemberBetStakes(member);
  const totalPages = Math.max(1, Math.ceil(mine.length / PROFILE_BETS_PAGE_SIZE));
  const p = Math.max(0, Math.min(Math.floor(page), totalPages - 1));

  if (totalPages > 1) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${ECON_PROFILE_BETS_PAGE_PREFIX}${p - 1}`)
          .setLabel("← Ранее")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p === 0),
        new ButtonBuilder()
          .setCustomId(`${ECON_PROFILE_BETS_PAGE_PREFIX}${p + 1}`)
          .setLabel("Далее →")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p >= totalPages - 1),
      ),
    );
  }
  rows.push(...buildProfileHubRows("bets"));
  return rows;
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
  const pl = u.hasPhone ? getPhoneDef(u.phoneModelId)?.label ?? "есть" : "нет";
  const car = getCarDef(u.ownedCarId);
  const hk = u.housingKind ?? "none";
  const home =
    hk === "rent" ? "аренда" : hk === "owned" ? (getApartmentDef(u.ownedApartmentId)?.label ?? "своё") : "нет";
  if (!u.hasPhone) {
    return `Телефон: **нет** · авто: **${car?.label ?? "нет"}** · жильё: **${home}** · престиж **${fmt(u.prestigePoints ?? 0)}**`;
  }
  if (!u.courierSimNumber) {
    return `Телефон: **${pl}** (**нет сим**) · авто: **${car?.label ?? "нет"}** · жильё: **${home}** · престиж **${fmt(u.prestigePoints ?? 0)}**`;
  }
  return `Телефон: **${pl}** (**сим ${u.courierSimNumber}**, баланс **${fmt(u.simBalanceRub ?? 0)}** ₽) · авто: **${car?.label ?? "нет"}** · жильё: **${home}** · престиж **${fmt(u.prestigePoints ?? 0)}**`;
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
  const ps = progressShort();
  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle("Фокус добычи")
    .setDescription(
      [
        "Когда ты сидишь в голосовых каналах сервера, бот начисляет тебе **две вещи**: прогресс по **роли** (в баллах **" + ps + "**) и **рубли** на баланс.",
        "",
        "**Фокус** — это не отдельная награда, а то, **во что «переводится» основная доля** времени в голосе: либо ты упираешься в рост по лестнице ролей, либо чаще получаешь ₽, либо держишься посередине.",
        "",
        "**Три режима:**",
        "",
        `• **Роль (${ps})** — режим «качать ступень». Большая часть усилий уходит в **${progressName()}** и продвижение по голосовой лестнице. **Рубли за голос** в этом режиме почти не копятся — если цель только деньги, этот вариант неудобен.`,
        "",
        `• **Баланс** — «и то, и другое». И **${ps}**, и **₽** начисляются в **умеренном** соотношении: ни резко не теряешь прогресс роли, ни совсем без денег не остаёшься. Удобный вариант по умолчанию.`,
        "",
        `• **Деньги (₽)** — режим «заработать». За то же время в голосе ты получаешь **больше рублей**, зато **${ps}** идут **заметно медленнее**, чем на фокусе «Роль». Подходит, когда лестница ролей не в приоритете.`,
        "",
        "**Про время в голосе:**",
        "Чтобы награда не росла бесконечно при суточном «живании» в голосе, за **один календарный день** действует **ступенчатое ослабление** эффективности минуты (одинаково для **" +
          ps +
          "** и для базовой части **₽**, на неё потом ещё накладывается выбранный фокус):",
        "— первые **до 3 часов** в голосе за день (0–180 мин) считаются **полностью**;",
        "— следующие **до 6 часов** суммарно за день (180–360 мин) — **вдвое слабее**;",
        "— всё **свыше 6 часов** за день (360+ мин) — **ещё слабее** (примерно **в пять раз** слабее, чем первые три часа).",
        "_Сутки для этих порогов — **календарный день по московскому времени (МСК, UTC+3)**._",
        `От этого зависит и скорость роста **${ps}**, и то, сколько **₽** ты получишь за голос — в зависимости от выбранного фокуса.`,
        "",
        `**Твой текущий фокус:** **${focusLabel(u.focus)}**`,
        "",
        "Нажми кнопку ниже, чтобы сменить режим.",
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
  "officeAnalyst",
  "shadowFixer",
  "soleProp",
] as const satisfies readonly JobId[];

function isWorkJobId(s: string): s is JobId {
  return (WORK_JOB_IDS as readonly string[]).includes(s);
}

/** Строка в списке вакансий тира (краткая особенность). */
function jobOpeningLine(jobId: JobId): string {
  switch (jobId) {
    case "courier":
      return "**Доставка** — фиксированная ставка за смену";
    case "waiter":
      return "**Кафе** — выплата за смену **случайная**";
    case "watchman":
      return "**Кладбище** — **фикс** за смену при **самом длинном КД** (24 ч)";
    case "dispatcher":
      return "**Колл-центр** — **фикс** + редкая премия, **очень длинный** КД (**спокойный** график, ниже ₽/ч)";
    case "assembler":
      return "**Склад** — **фикс**, редкий штраф, **премия каждые 7 смен**";
    case "expediter":
      return "**Развлекательный центр** — **случайная** выплата, **короткий** КД, иногда **убыток** по смене";
    case "officeAnalyst":
      return "**Офис · аналитик** — **ежедневный оклад** (МСК) + смены, **Связь** и **Совещание**";
    case "shadowFixer":
      return "**Схемы · посредник** — **случайная** выплата за смену, **ежедневного оклада нет**";
    case "soleProp":
      return "**ИП · услуги** — **ежедневный оклад** от баланса бизнеса, **реклама** / **персонал** / **контроль**";
    default:
      return `**${jobId}**`;
  }
}

/** Одна строка «суть» в карточке работы (без длинного описания). */
function jobCardSummaryLine(jobId: JobId): string {
  const def = getAnyJobDef(jobId);
  switch (jobId) {
    case "courier":
      return `**Фикс** **${fmt(def.basePayoutRub)}** ₽ за смену · КД **3** ч (вел **2** ч, авто **2**–**1** ч по классу) · **карьера** т1 (**5** ступеней)`;
    case "waiter":
      return "**15** полос **−5…+10k** ₽ (без дыр), пик у **1–3k** · КД **5** ч · **карьера** т1";
    case "watchman":
      return `**Фикс** **${fmt(def.basePayoutRub)}** ₽ · КД **24** ч · **карьера** т1`;
    case "dispatcher":
      return `**Фикс** **${fmt(def.basePayoutRub)}** ₽ · **2%** шанс премии **345–656** ₽ · КД **16** ч · **карьера** т2`;
    case "assembler":
      return `**Фикс** **${fmt(def.basePayoutRub)}** ₽ · **3%** штраф **138–414** ₽ · премия **${fmt(1_794)}** ₽ каждые **7** смен · КД **8** ч · **карьера** т2`;
    case "expediter":
      return `**Случайная** выплата · КД **4** ч · риск **в минус** · **карьера** т2`;
    case "officeAnalyst": {
      const o = getTier3JobDef("officeAnalyst");
      return `**Ежедневный оклад** МСК (**${fmt(o.passiveBaseRub)}** ₽ × усиление ранга) + смена **${fmt(o.basePayoutRub)}** ₽ + надбавки · КД смены **12** ч`;
    }
    case "shadowFixer":
      return "**Случайная** выплата за смену · КД **3,5** ч · **Связь** даёт **10–30%** ориентира офиса";
    case "soleProp":
      return "**Ежедневный оклад** МСК от капитала на бизнесе + множители; **реклама** / **персонал** / **контроль**";
    default:
      return def.title;
  }
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
  tier3Archetype?: "legal" | "illegal" | "ip";
  passiveBaseRub?: number;
};

// Чем выше потолок при активной игре — тем короче КД. Стабильный фикс — реже смены.
const JOBS_STARTER: JobDef[] = [
  {
    id: "courier",
    title: "Доставка",
    baseCooldownMs: 3 * 60 * 60 * 1000,
    basePayoutRub: 1_700,
    description:
      [
        "**КД смены:** 3 ч без вела; с **арендой электровела** — 2 ч; с **авто** — по классу авто (**от 2 ч до 1 ч**).",
        `Нужны **телефон** и **симка**. С **баланса сим** — **${COURIER_SIM_MONTHLY_FEE_RUB.toLocaleString("ru-RU")}** ₽ за **тариф** на **30** суток (при первой смене после перерыва); внутри оплаченного периода смены **без** доп. списаний с сим. **Основной счёт не трогается.**`,
        "**Электровел** — посуточная аренда (если **нет** своего авто).",
      ].join("\n"),
  },
  {
    id: "waiter",
    title: "Кафе",
    baseCooldownMs: 5 * 60 * 60 * 1000,
    basePayoutRub: 0,
    description: [
      "**Средний КД** (5 ч). **Случайная выплата:** **15** стыкующихся полос по **1000** ₽ от **−5 000** до **+10 000** (без разрывов); к **краям** шанс **ниже**, пик у **1–3k** ₽. Плюс карьерная надбавка т1.",
    ].join("\n"),
  },
  {
    id: "watchman",
    title: "Кладбище",
    baseCooldownMs: 24 * 60 * 60 * 1000,
    basePayoutRub: 1_904,
    description:
      [
        "**Длинный КД** (24 ч): **высокий фикс** за смену — ориентир «~1 нажатие в день» ≈ **~57k/мес** без идеального КД.",
      ].join("\n"),
  },
];

type StarterJobId = (typeof JOBS_STARTER)[number]["id"];

function getJobDef(id: StarterJobId): JobDef {
  const d = JOBS_STARTER.find((j) => j.id === id);
  if (!d) throw new Error(`unknown job: ${id}`);
  return d;
}

function jobDefFromTier3(d: Tier3JobDef): JobDef {
  return {
    id: d.id,
    title: d.title,
    baseCooldownMs: d.baseCooldownMs,
    basePayoutRub: d.basePayoutRub,
    description: d.description,
    reqSkills: { ...d.reqSkills },
    tier3Archetype: d.archetype,
    passiveBaseRub: d.passiveBaseRub,
  };
}

// Тир-2: та же логика КД; тир-3 — комбо из трёх навыков.
const JOBS_TIER2: JobDef[] = [
  {
    id: "dispatcher",
    title: "Колл-центр",
    baseCooldownMs: 16 * 60 * 60 * 1000,
    basePayoutRub: 8_200,
    description: [
      "**Очень длинный КД** (16 ч): спокойный фикс, мало кликов — **ниже** часовая ставка, зато без сюрпризов.",
      "Иногда (**2%**) — мелкая премия за слаженную смену.",
    ].join("\n"),
    reqSkills: { communication: 28, discipline: 20 },
  },
  {
    id: "assembler",
    title: "Склад",
    baseCooldownMs: 8 * 60 * 60 * 1000,
    basePayoutRub: 6_400,
    description: [
      "**Средний КД** (8 ч): **стабильный** высокий фикс, премия каждые **7** смен, редкие штрафы — **опорная** работа тир-2.",
    ].join("\n"),
    reqSkills: { discipline: 28, logistics: 20 },
  },
  {
    id: "expediter",
    title: "Развлекательный центр",
    baseCooldownMs: 4 * 60 * 60 * 1000,
    basePayoutRub: 0,
    description: [
      "**Короткий КД** (4 ч): **рандом** с шансом **убытка** по смене; в среднем ближе к **складу** по ₽/ч, но сильнее гуляет.",
    ].join("\n"),
    reqSkills: { logistics: 28, communication: 20 },
  },
];

function getAnyJobDef(id: JobId): JobDef {
  const s = JOBS_STARTER.find((j) => j.id === id);
  if (s) return s;
  const t2 = JOBS_TIER2.find((j) => j.id === id);
  if (t2) return t2;
  const t3 = JOBS_TIER3.find((j) => j.id === id);
  if (t3) return jobDefFromTier3(t3);
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

/** Ориентир ежедневного оклада офиса того же ранга — для бонусов 10–30% у тир-3. */
function tier3ReferencePassiveRubFromStreak(streakDays: number): number {
  const office = getTier3JobDef("officeAnalyst");
  const rank = tier3PromotionRank(streakDays);
  return Math.floor(office.passiveBaseRub * (1 + 0.08 * rank));
}

function solePropAdMaxRub(streakDays: number): number {
  const rank = tier3PromotionRank(streakDays);
  return Math.min(SOLE_PROP_CAP_MAX, 125_000 + rank * 40_000);
}

function rubFromTier3MetaPercent(streakDays: number): number {
  const ref = tier3ReferencePassiveRubFromStreak(streakDays);
  const p = 0.1 + Math.random() * 0.2;
  return Math.max(0, Math.floor(ref * p));
}

function solePropAdvertOutcome(
  bizBal: number,
  amount: number,
  maxAd: number,
): { ok: boolean; delta: number; detail: string } {
  if (amount < 10_000 || amount > maxAd || amount > bizBal) {
    return { ok: false, delta: 0, detail: "Сумма вне диапазона или больше баланса бизнеса." };
  }
  const frac = maxAd > 0 ? amount / maxAd : 1;
  const failP = Math.min(0.92, 0.22 + 0.58 * Math.pow(frac, 1.15));
  if (Math.random() < failP) {
    const lossMult = 0.7 + Math.random() * 0.3;
    const loss = Math.min(bizBal, Math.floor(amount * lossMult));
    return { ok: false, delta: -loss, detail: `Реклама не зашла: **${formatDelta(-loss)}** с баланса бизнеса.` };
  }
  const gainPct = 0.07 + 0.38 * (1 - frac);
  const jitter = 0.88 + Math.random() * 0.28;
  const gain = Math.floor(amount * gainPct * jitter);
  return { ok: true, delta: gain, detail: `Реклама сработала: **+${fmt(gain)}** ₽ на баланс бизнеса.` };
}

function rollSolePropStaffOutcome(u: EconomyUser, now: number): { patch: Partial<EconomyUser>; detail: string } {
  const eff0 = u.solePropPassiveEffMult ?? 1;
  const patch: Partial<EconomyUser> = { solePropStaffReadyAt: now + SOLE_PROP_STAFF_CD_MS };
  const r = Math.random();
  if (r < 0.32) {
    const mult = Math.round((1.1 + Math.random() * 0.2) * 100) / 100;
    const w = [0.35, 0.28, 0.2, 0.12, 0.05];
    let acc = 0;
    const roll = Math.random();
    let days = 5;
    for (let i = 0; i < w.length; i++) {
      acc += w[i];
      if (roll < acc) {
        days = i + 1;
        break;
      }
    }
    patch.solePropPassiveTempMult = mult;
    patch.solePropPassiveTempUntilMs = now + days * 86400000;
    return { patch, detail: `Слаженнее: временный множ. **×${mult.toFixed(2)}** на **${days}** дн.` };
  }
  if (r < 0.47) {
    patch.solePropPassiveEffMult = 1;
    return { patch, detail: "Новый набор: эффективность выровнена к **×1.0**." };
  }
  if (r < 0.62) {
    const ne = Math.round(Math.min(1, Math.max(0.3, eff0 - 0.1)) * 10) / 10;
    patch.solePropPassiveEffMult = ne;
    return { patch, detail: `Текучка: эффективность **×${ne.toFixed(1)}**.` };
  }
  if (r < 0.72) {
    patch.solePropPassiveTempMult = 1;
    patch.solePropPassiveTempUntilMs = undefined;
    return { patch, detail: "Разлад: временный буст снят." };
  }
  return { patch, detail: "Персонал без заметных изменений." };
}

/** Равномерно среди **10 000…99 999**, исключая номера, уже выданные кому-либо на сервере. */
function rollNewSimDigits(guildId: string): string {
  const taken = new Set<string>();
  for (const { user } of listEconomyUsers(guildId)) {
    const n = user.courierSimNumber;
    if (n && /^\d{5}$/.test(n)) taken.add(n);
  }
  const freeCount = 90_000 - taken.size;
  if (freeCount <= 0) return String(randInt(10_000, 99_999));
  let k = Math.floor(Math.random() * freeCount);
  for (let v = 10_000; v <= 99_999; v++) {
    const s = String(v);
    if (taken.has(s)) continue;
    if (k === 0) return s;
    k--;
  }
  return String(randInt(10_000, 99_999));
}

function hasActiveBikeRental(u: ReturnType<typeof getEconomyUser>, now: number): boolean {
  return Number.isFinite(u.courierBikeUntilMs) && (u.courierBikeUntilMs ?? 0) > now;
}

function hasOwnedCourierCar(u: ReturnType<typeof getEconomyUser>): boolean {
  return Boolean(u.ownedCarId && getCarDef(u.ownedCarId));
}

/** Строки для доставки: авто / вел, месячный тариф сим, баланс сим — только при текущей работе «доставка». */
function courierWorkExtrasLines(u: ReturnType<typeof getEconomyUser>, now: number): string[] {
  if (u.jobId !== "courier") return [];
  const fee = COURIER_SIM_MONTHLY_FEE_RUB;
  const lines: string[] = [];
  const car = getCarDef(u.ownedCarId);
  if (car) {
    lines.push(`**Авто:** **${car.label}** (${car.speedKmh} км/ч) — КД смены **${(car.courierShiftCdMs / 3600000).toFixed(2).replace(/\.?0+$/, "")}** ч.`);
  } else if (hasActiveBikeRental(u, now)) {
    const t = Math.floor((u.courierBikeUntilMs ?? 0) / 1000);
    lines.push(`**Электровелосипед:** оплачен до <t:${t}:F> (<t:${t}:R>).`);
  } else {
    lines.push("**Электровелосипед:** аренда **не активна** (или купите **авто** в магазине).");
  }
  if (u.courierPhonePaidUntilMs && now < u.courierPhonePaidUntilMs) {
    const lt = Math.floor(u.courierPhonePaidUntilMs / 1000);
    lines.push(`**Сим-карта:** **тариф 30 суток** оплачен до <t:${lt}:F> — смены в этот период **без** доп. списаний с баланса сим.`);
  } else {
    lines.push(
      `**Сим-карта:** тариф **не оплачен** — при следующем выходе на смену с баланса сим спишется **${fee.toLocaleString("ru-RU")}** ₽ и продлится **тариф** на **30** суток.`,
    );
  }
  const bals = u.simBalanceRub ?? 0;
  lines.push(
    `**Баланс сим:** **${fmt(bals)}** ₽ — пополнение в магазине; **${fee.toLocaleString("ru-RU")}** ₽ с сим за **30 суток** (основной счёт **не** используется).`,
  );
  return lines;
}

function jobUsesVariablePayout(jobId: JobId): boolean {
  return jobId === "waiter" || jobId === "expediter" || jobId === "shadowFixer";
}

function jobPayoutEmbedLine(jobId: JobId, baseRub: number): string {
  if (jobId === "waiter") {
    return "Оплата за смену: **−5…+10k** ₽ одной суммой (**15** полос по **1k**); чаще **середина**, к краям реже.";
  }
  if (jobId === "expediter") {
    return "Оплата за смену: **без фикса** — в среднем **~3–3,5k ₽** за смену при активной игре; **~12%** веток могут дать **убыток**, иначе **~2,6–7k ₽**.";
  }
  if (jobId === "shadowFixer") {
    return "Оплата за смену: **без фикса** — сильный разброс (до **~−1k…+4k ₽** и выше при ранге; ранг и стрик усиливают **плюсовые** ветки).";
  }
  if (jobId === "soleProp") {
    return "Доход: **ежедневный оклад** (полночь МСК) от баланса бизнеса (**реклама** / **персонал** / **контроль** — отдельно).";
  }
  return `Оплата за смену: **${baseRub} ₽**`;
}

function jobPayoutShortForMenu(jobId: JobId, baseRub: number): string {
  if (jobUsesVariablePayout(jobId)) return "без фикса (рандом)";
  if (jobId === "soleProp") return "ежедневный оклад";
  return `${baseRub} ₽`;
}

function hasTier2PlusHousing(u: EconomyUser, now: number): boolean {
  if ((u.housingKind ?? "none") === "owned" && u.ownedApartmentId) return true;
  if (u.housingKind === "rent" && u.housingRentNextDueMs != null && now < u.housingRentNextDueMs) return true;
  return false;
}

function buildShopHubEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const simLine = u.hasPhone
    ? `• Симка${u.courierSimNumber ? " **(куплено)**" : ""} — первая **${SHOP_SIM_NEW_PRICE_RUB}** ₽ (+**${SHOP_SIM_START_BALANCE_RUB}** ₽ на баланс), замена **${SHOP_SIM_NEW_PRICE_RUB}** ₽`
    : `• Симка — сначала **телефон**`;
  const phoneHint = u.hasPhone
    ? `• Телефон — **${getPhoneDef(u.phoneModelId)?.label ?? "есть"}** (апгрейд в подменю)`
    : "• Телефон — модели **от 5 000** ₽";
  const carLine = u.ownedCarId ? `• Авто — **${getCarDef(u.ownedCarId)?.label ?? "есть"}**` : "• Авто — **нет**";
  const hk = u.housingKind ?? "none";
  const houseLine =
    hk === "rent"
      ? `• Жильё — **аренда** (от **${fmt(HOUSING_RENT_DAY_PKG_RUB)}** ₽/сут. до **${fmt(HOUSING_RENT_MONTH_PKG_RUB)}** ₽/30 сут.)`
      : hk === "owned"
        ? `• Жильё — **своя квартира** (${getApartmentDef(u.ownedApartmentId)?.label ?? "—"})`
        : "• Жильё — **нет**";
  const lines = [
    `Баланс: **${fmt(u.rubles)}** ₽ · престиж **${fmt(u.prestigePoints ?? 0)}**`,
    "",
    "**Список товаров:**",
    phoneHint,
    simLine,
    carLine,
    houseLine,
  ];
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Магазин").setDescription(lines.join("\n")).setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildShopHubRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_PHONE).setLabel("Телефон").setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(ECON_SHOP_SIM)
        .setLabel("Симка")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!u.hasPhone),
      new ButtonBuilder().setCustomId(ECON_SHOP_CAR).setLabel("Авто").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_SHOP_HOUSE).setLabel("Жильё").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildShopPhoneEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getPhoneDef(u.phoneModelId);
  const lines = [
    `Баланс: **${fmt(u.rubles)}** ₽ · престиж **${fmt(u.prestigePoints ?? 0)}**`,
    cur ? `Сейчас: **${cur.label}**` : "Сейчас: **нет телефона**",
    "",
    "Выберите модель. При **апгрейде** доплачивается разница в цене, престиж меняется на дельту моделей.",
    "",
    ...PHONE_MODELS.map((p) => `• **${p.label}** — **${fmt(p.priceRub)}** ₽ (+**${p.prestigeDelta}** престижа)`),
  ];
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Магазин · Телефон").setDescription(lines.join("\n")).setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildShopPhoneRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getPhoneDef(u.phoneModelId);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  const chunk = 5;
  for (let i = 0; i < PHONE_MODELS.length; i += chunk) {
    const slice = PHONE_MODELS.slice(i, i + chunk);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((p) => {
          const cost = cur ? Math.max(0, p.priceRub - cur.priceRub) : p.priceRub;
          const downgrade = Boolean(cur && p.priceRub < cur.priceRub);
          const disabled = downgrade || u.rubles < cost || (cur?.id === p.id && Boolean(u.hasPhone));
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_PHONE_BUY_PREFIX}${p.id}`)
            .setLabel(`${p.label} (${cost ? fmt(cost) : "0"} ₽)`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled);
        }),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_HUB).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function buildShopCarEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getCarDef(u.ownedCarId);
  const lines = [
    `Баланс: **${fmt(u.rubles)}** ₽ · престиж **${fmt(u.prestigePoints ?? 0)}**`,
    cur ? `Сейчас: **${cur.label}**` : "Сейчас: **нет авто**",
    "",
    "Покупка **заменяет** текущее авто: платите разницу в цене, престиж меняется на **дельту** моделей. С **авто** аренда вела не нужна.",
    "",
    ...CAR_MODELS.map(
      (c) =>
        `• **${c.label}** — **${fmt(c.priceRub)}** ₽ (+**${fmt(c.prestigeDelta)}** пр.) · КД доставки **${(c.courierShiftCdMs / 3600000).toFixed(2).replace(/\.?0+$/, "")}** ч`,
    ),
  ];
  return new EmbedBuilder().setColor(PANEL_COLOR).setTitle("Магазин · Авто").setDescription(lines.join("\n")).setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildShopCarRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const cur = getCarDef(u.ownedCarId);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  for (let i = 0; i < CAR_MODELS.length; i += 3) {
    const slice = CAR_MODELS.slice(i, i + 3);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((c) => {
          const cost = cur ? Math.max(0, c.priceRub - cur.priceRub) : c.priceRub;
          const downgrade = Boolean(cur && c.priceRub < cur.priceRub);
          const disabled = downgrade || u.rubles < cost || (cur?.id === c.id && Boolean(u.ownedCarId));
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_CAR_BUY_PREFIX}${c.id}`)
            .setLabel(`${c.label.split(" ")[0] ?? c.label} (${fmt(cost)})`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled);
        }),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_HUB).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

type HousingRentRefreshMode = "shop" | "myRentEdit";

function applyRentPlanPurchase(member: GuildMember, plan: HousingRentPlan): { ok: true } | { ok: false; reply: string } {
  const u = getEconomyUser(member.guild.id, member.id);
  const hk = u.housingKind ?? "none";
  if (hk === "owned") return { ok: false, reply: "У вас **своя квартира** — аренда недоступна." };
  const price = housingRentPlanPriceRub(plan);
  const periodMs = housingRentPlanPeriodMs(plan);
  if (u.rubles < price) return { ok: false, reply: `Нужно **${fmt(price)}** ₽.` };
  const now = Date.now();
  const baseEnd = hk === "rent" && u.housingRentNextDueMs && u.housingRentNextDueMs > now ? u.housingRentNextDueMs : now;
  const nextDue = baseEnd + periodMs;
  const prestigeGain = u.housingRentPrestigeGranted ? 0 : HOUSING_RENT_PRESTIGE_ONE_TIME;
  const chainStart = hk === "rent" ? (u.housingRentChainStartedAtMs ?? now) : now;
  const totalPaid = (hk === "rent" ? (u.housingRentTotalPaidRub ?? 0) : 0) + price;
  patchEconomyUser(member.guild.id, member.id, {
    rubles: u.rubles - price,
    housingKind: "rent",
    housingRentNextDueMs: nextDue,
    housingRentPlan: plan,
    housingRentLastPaidRub: price,
    housingRentLastPeriodMs: periodMs,
    housingRentChainStartedAtMs: chainStart,
    housingRentTotalPaidRub: totalPaid,
    housingRentPrestigeGranted: true,
    prestigePoints: Math.max(0, (u.prestigePoints ?? 0) + prestigeGain),
  });
  return { ok: true };
}

async function replyAfterRentPlanPurchase(
  interaction: ButtonInteraction,
  member: GuildMember,
  mode: HousingRentRefreshMode,
): Promise<void> {
  if (mode === "shop") {
    await replyOrUpdate(interaction, { embeds: [buildShopHouseEmbed(member)], components: buildShopHouseRows(member) });
  } else {
    await replyOrUpdate(interaction, { embeds: [buildMyRentEditEmbed(member)], components: buildMyRentEditRows(member) });
  }
}

/** Главный экран «Жильё» в меню терминала — только для аренды. */
function buildMyRentHomeEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const due = u.housingRentNextDueMs;
  const dueLine =
    due != null && now < due
      ? `Оплачено **до** <t:${Math.floor(due / 1000)}:F> (ваше локальное время в Discord).`
      : due != null
        ? `Срок по данным: <t:${Math.floor(due / 1000)}:F> — **продлите** в магазине или здесь (**Изменить срок**).`
        : "Срок окончания **не задан** — оформите аренду в **Магазин** → жильё.";
  const curPlan = u.housingRentPlan ?? "month";
  const curRub = housingRentPlanPriceRub(curPlan);
  const renewLine =
    u.housingRentRenewalPlan != null
      ? `После окончания текущего срока первое автосписание в полночь МСК: **${rentPlanLabelRu(u.housingRentRenewalPlan)}** (**${fmt(housingRentPlanPriceRub(u.housingRentRenewalPlan))}** ₽).`
      : `Пакет на **следующий** цикл после текущего срока **не выбран** — в полночь спишется пакет **текущего** цикла: **${rentPlanLabelRu(curPlan)}** (**${fmt(curRub)}** ₽).`;
  const refundLine =
    due != null && now < due
      ? `Если купите квартиру в магазине, на счёт вернётся **≈ ${fmt(housingRentUnusedRefundRub(u, now))}** ₽ за неиспользованное время.`
      : "";
  const lines = [
    "**Статус:** снимаете жильё (**аренда**).",
    "",
    dueLine,
    "",
    `**Полночь МСК по текущему циклу:** при наступлении срока спишется **${rentPlanLabelRu(curPlan)}** (**${fmt(curRub)}** ₽), срок сдвинется на следующий период этого пакета.`,
    "",
    "**Следующий цикл (после оплаченного срока):**",
    renewLine,
    "",
    refundLine,
    "",
    "Чтобы **добавить оплаченные дни** сейчас или **задать пакет** на первое автосписание после срока — нажмите **Изменить срок**.",
    "Оформить **новую** аренду с нуля или **купить квартиру** — только **Магазин** → жильё.",
  ].filter(Boolean);
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Моя аренда")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildMyRentHomeRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_HOUSING_EDIT).setLabel("Изменить срок").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_HOUSING_LEAVE).setLabel("Съехать с аренды").setStyle(ButtonStyle.Danger),
    ),
  ];
}

function buildMyRentEditEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const due = u.housingRentNextDueMs;
  const prepaid =
    due != null && now < due
      ? `Сейчас оплачено **до** <t:${Math.floor(due / 1000)}:F>. Новый пакет **добавляет время от этой даты** (не от сегодня).`
      : "Срок **истёк или на исходе** — всё равно можно оплатить пакет: отсчёт пойдёт от **сейчас**.";
  const lines = [
    "**1. Продлить сейчас** — спишется выбранная сумма, конец оплаченного срока **сдвинется**.",
    prepaid,
    "",
    "**2. Пакет после срока** — что спишется в **первую** полночь МСК **после** окончания текущего оплаченного периода (текущий срок **не** сокращается и **не** продлевается этим действием).",
    "",
    "Нужны только **аренда** или **покупка квартиры** — раздел **Магазин** → жильё.",
  ];
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Жильё · срок и продление")
    .setDescription(lines.join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildMyRentEditRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const rows: ActionRowBuilder<ButtonBuilder>[] = [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_HOUSING_EXT_PREFIX}day`)
        .setLabel(`+1 сут. (${fmt(HOUSING_RENT_DAY_PKG_RUB)} ₽)`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(u.rubles < HOUSING_RENT_DAY_PKG_RUB),
      new ButtonBuilder()
        .setCustomId(`${ECON_HOUSING_EXT_PREFIX}week`)
        .setLabel(`+7 сут. (${fmt(HOUSING_RENT_WEEK_PKG_RUB)} ₽)`)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(u.rubles < HOUSING_RENT_WEEK_PKG_RUB),
      new ButtonBuilder()
        .setCustomId(`${ECON_HOUSING_EXT_PREFIX}month`)
        .setLabel(`+30 сут. (${fmt(HOUSING_RENT_MONTH_PKG_RUB)} ₽)`)
        .setStyle(ButtonStyle.Success)
        .setDisabled(u.rubles < HOUSING_RENT_MONTH_PKG_RUB),
    ),
  ];
  const nowR = Date.now();
  if (u.housingRentNextDueMs != null && nowR < u.housingRentNextDueMs) {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${ECON_SHOP_HOUSE_RENEW_AFTER_REQ_PREFIX}day`)
          .setLabel("После срока: 1 сут.")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${ECON_SHOP_HOUSE_RENEW_AFTER_REQ_PREFIX}week`)
          .setLabel("После срока: 7 сут.")
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId(`${ECON_SHOP_HOUSE_RENEW_AFTER_REQ_PREFIX}month`)
          .setLabel("После срока: 30 сут.")
          .setStyle(ButtonStyle.Success),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_HOUSING_BACK).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function buildShopHouseEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const hk = u.housingKind ?? "none";
  const lines: string[] = [
    "Баланс: **" + fmt(u.rubles) + "** \u20bd, престиж **" + fmt(u.prestigePoints ?? 0) + "**",
    "",
    "**Требование для работ тир 2+:** **аренда** с запасом срока или **своя квартира**.",
    "",
  ];
  if (hk === "owned") {
    lines.push(
      "**Своя квартира**",
      "- **" + (getApartmentDef(u.ownedApartmentId)?.label ?? "-") + "**",
      "- Коммуналка раз в **30 дней** (полночь МСК).",
      "- Продажа: **" + Math.round(APARTMENT_SELL_REFUND_RATE * 100) + "%** цены на руки; престиж от квартиры **снимается**.",
      "",
      "**Смена квартиры** - кнопки ниже (платите разницу). **Аренда** в этом разделе недоступна.",
    );
  } else if (hk === "rent") {
    lines.push(
      "**Аренда уже оформлена.**",
      "Здесь можно **продлить** оплаченный срок или **купить** квартиру (неиспользованное время с аренды вернётся на счёт **пропорционально**).",
      "",
      "Срок окончания, автопродление после него и **съезд** — кнопка **Жильё** в главном меню терминала.",
    );
  } else {
    lines.push(
      "**Снять жильё в аренду** - выберите пакет ниже:",
      "- **30 суток** - **" + fmt(HOUSING_RENT_MONTH_PKG_RUB) + "** \u20bd",
      "- **7 суток** - **" + fmt(HOUSING_RENT_WEEK_PKG_RUB) + "** \u20bd",
      "- **1 сутки** - **" + fmt(HOUSING_RENT_DAY_PKG_RUB) + "** \u20bd",
      "",
      "При **первом** заселении: **+" + String(HOUSING_RENT_PRESTIGE_ONE_TIME) + "** престижа (снимается при съезде).",
      "",
      "**Купить квартиру** - кнопки ниже (полная цена, пока нет своей).",
    );
  }
  lines.push("", "**Квартиры:**");
  for (const a of APARTMENT_MODELS) {
    lines.push(
      "- **" +
        a.label +
        "** - **" +
        fmt(a.priceRub) +
        "** \u20bd, коммуналка **" +
        fmt(a.monthlyUtilityRub) +
        "** / мес, +**" +
        fmt(a.prestigeDelta) +
        "** пр.",
    );
  }
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Магазин \u00b7 Жиль\u0451")
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Запросил: " + member.user.tag });
}

function buildShopHouseRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const hk = u.housingKind ?? "none";
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];
  if (hk === "rent") {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_HOUSE_RENT_1D)
          .setLabel(`+1 сут. (${fmt(HOUSING_RENT_DAY_PKG_RUB)} ₽)`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(u.rubles < HOUSING_RENT_DAY_PKG_RUB),
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_HOUSE_RENT_7D)
          .setLabel(`+7 сут. (${fmt(HOUSING_RENT_WEEK_PKG_RUB)} ₽)`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(u.rubles < HOUSING_RENT_WEEK_PKG_RUB),
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_HOUSE_RENT_30D)
          .setLabel(`+30 сут. (${fmt(HOUSING_RENT_MONTH_PKG_RUB)} ₽)`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(u.rubles < HOUSING_RENT_MONTH_PKG_RUB),
      ),
    );
  } else if (hk !== "owned") {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_HOUSE_RENT_1D)
          .setLabel(`Снять 1 сут. (${fmt(HOUSING_RENT_DAY_PKG_RUB)} ₽)`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(u.rubles < HOUSING_RENT_DAY_PKG_RUB),
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_HOUSE_RENT_7D)
          .setLabel(`Снять 7 сут. (${fmt(HOUSING_RENT_WEEK_PKG_RUB)} ₽)`)
          .setStyle(ButtonStyle.Primary)
          .setDisabled(u.rubles < HOUSING_RENT_WEEK_PKG_RUB),
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_HOUSE_RENT_30D)
          .setLabel(`Снять 30 сут. (${fmt(HOUSING_RENT_MONTH_PKG_RUB)} ₽)`)
          .setStyle(ButtonStyle.Success)
          .setDisabled(u.rubles < HOUSING_RENT_MONTH_PKG_RUB),
      ),
    );
  }
  const curApt = getApartmentDef(u.ownedApartmentId);
  const nowApt = Date.now();
  const rentRef = hk === "rent" ? housingRentUnusedRefundRub(u, nowApt) : 0;
  if (hk === "owned" && curApt) {
    const refund = Math.floor(curApt.priceRub * APARTMENT_SELL_REFUND_RATE);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_SHOP_APT_SELL)
          .setLabel(`Продать квартиру (+${fmt(refund)} ₽)`)
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }
  for (let i = 0; i < APARTMENT_MODELS.length; i += 3) {
    const slice = APARTMENT_MODELS.slice(i, i + 3);
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        ...slice.map((a) => {
          const cost = hk === "owned" && curApt ? Math.max(0, a.priceRub - curApt.priceRub) : a.priceRub;
          const downgrade = Boolean(hk === "owned" && curApt && a.priceRub < curApt.priceRub);
          const disabled = downgrade || u.rubles + rentRef < cost || (hk === "owned" && curApt?.id === a.id);
          return new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_APT_BUY_PREFIX}${a.id}`)
            .setLabel(`${a.label.slice(0, 12)}…`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(disabled);
        }),
      ),
    );
  }
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_SHOP_HUB).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function buildShopSimEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  const hasSim = Boolean(u.courierSimNumber);
  const lines: string[] = [
    hasSim
      ? "**Замена номера** — новый случайный 5-значный номер (**" +
        SHOP_SIM_NEW_PRICE_RUB +
        " ₽**), **равновероятно** среди свободных на сервере. Текущий баланс симки **не меняется**."
      : "**Первая симка** — номер **10 000…99 999**, **равновероятно** среди свободных на сервере (**" +
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
  const car = getCarDef(u.ownedCarId);
  if (car) return car.courierShiftCdMs;
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

const WORK_SECTION_INTRO = [
  "Выберите профессию и после перерыва (**КД**) нажимайте **«Смена»** — рубли идут на **основной счёт** (или сумма **случайная**, если так устроена роль).",
  "Навыки открывают **т2** и **т3**. Для них нужно **жильё**: аренда с запасом срока или своя квартира в магазине терминала.",
  "",
  "**Нужно:**",
  "• **Начальные (т1)** — без порога навыков.",
  "• **С навыком (т2)** — навыки по вакансии + жильё.",
  "• **Продвинутые (т3)** — высокий уровень **всех трёх** навыков + жильё.",
].join("\n");

function buildWorkMenuEmbed(member: GuildMember): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.jobId) {
    return new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Работа")
      .setDescription([WORK_SECTION_INTRO, "", "Текущая работа: **не выбрана**.", "", "Выберите уровень ниже."].join("\n"))
      .setFooter({ text: `Запросил: ${member.user.tag}` });
  }
  const def = getAnyJobDef(u.jobId);
  const now = Date.now();
  const state = canWorkNow(u, u.jobId, now);
  const cd = u.jobId === "courier" ? effectiveCourierCooldownMs(u, now) : def.baseCooldownMs;
  const lines =
    u.jobId === "soleProp"
      ? ([
          `Текущая работа: **${def.title}**`,
          `Доход: **${jobPayoutShortForMenu(u.jobId, def.basePayoutRub)}** — действия бизнеса и **ежедневный оклад** (МСК).`,
        ] as string[])
      : [
          `Текущая работа: **${def.title}**`,
          `Оплата за смену: **${jobPayoutShortForMenu(u.jobId, def.basePayoutRub)}** · КД: **${cdHoursLabel(cd)} ч**`,
          state.ok ? "Смена: **доступна сейчас**." : `Смена: через **${formatCooldown(state.msLeft)}**.`,
        ];
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Работа")
    .setDescription([WORK_SECTION_INTRO, "", ...lines, "", "Ниже — **Моя работа**, смена и каталог по уровням."].join("\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildWorkMenuRows(member: GuildMember): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.jobId) {
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_STARTERS).setLabel("Начальные (т1)").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_TIER2).setLabel("С навыком (т2)").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_TIER3).setLabel("Продвинутые (т3)").setStyle(ButtonStyle.Secondary),
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
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_STARTERS).setLabel("Начальные (т1)").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_TIER2).setLabel("С навыком (т2)").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_TIER3).setLabel("Продвинутые (т3)").setStyle(ButtonStyle.Secondary),
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
  const lines = JOBS_STARTER.map((d) => jobOpeningLine(d.id));
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Начальные (т1)")
    .setDescription(["Кратко по каждой роли; **Подробнее** — в карточке профессии.", "", ...lines].join("\n\n"))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildTier2JobsOverviewEmbed(member: GuildMember): EmbedBuilder {
  const lines = JOBS_TIER2.map((d) => `${jobOpeningLine(d.id)} · ${formatJobTierReqLine(d)}`);
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("С навыком (т2)")
    .setDescription(
      [
        "**Жильё обязательно:** аренда с запасом срока или своя квартира — **до** устройства на т2+.",
        "",
        "Кратко по каждой роли; **Подробнее** — в карточке профессии.",
        "",
        ...lines,
      ].join("\n\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildStarterJobsRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}courier`).setLabel("Доставка").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}waiter`).setLabel("Кафе").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}watchman`).setLabel("Кладбище").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_WORK).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildJobDetailBody(jobId: JobId): string {
  const def = getAnyJobDef(jobId);
  let main: string;
  switch (jobId) {
    case "courier":
      main = [
        "**КД:** **3** ч пешком · **2** ч с арендой электровела · с авто: **2** / **1,8** / **1,6** / **1,35** / **1,15** / **1** ч (от подержанного к топ-сегменту).",
        `**Смена:** **+${fmt(def.basePayoutRub)}** ₽ на основной счёт.`,
        `**Сим:** тариф **${fmt(COURIER_SIM_MONTHLY_FEE_RUB)}** ₽ с **баланса сим** на **30** суток — списывается при **первой** смене после окончания оплаченного периода; основной счёт **не** используется.`,
      ].join("\n\n");
      break;
    case "waiter":
      main = [
        "**КД:** **5** ч.",
        "**Смена:** одна случайная сумма **на счёт** (до карьерной надбавки). **15** полос по **1000** ₽, **стык в стык** от **−5 000** до **+10 000**; внутри полосы — равновероятные целые ₽.",
        "**Вес полосы** (шанс попасть в неё; сумма весов **77**):",
        "• **1,30%** · **−5 000…−4 001**",
        "• **2,60%** · **−4 000…−3 001**",
        "• **3,90%** · **−3 000…−2 001**",
        "• **6,49%** · **−2 000…−1 001**",
        "• **9,09%** · **−1 000…−1**",
        "• **11,69%** · **0…999**",
        "• **14,29%** · **1 000…1 999**",
        "• **14,29%** · **2 000…2 999**",
        "• **11,69%** · **3 000…3 999**",
        "• **9,09%** · **4 000…4 999**",
        "• **6,49%** · **5 000…5 999**",
        "• **3,90%** · **6 000…6 999**",
        "• **2,60%** · **7 000…7 999**",
        "• **1,30%** · **8 000…8 999**",
        "• **1,30%** · **9 000…10 000**",
        "Ориентир доставки **~1 700** ₽ попадает в полосу **1 000…1 999** (одна из двух самых частых с полосой **2 000…2 999**).",
      ].join("\n\n");
      break;
    case "watchman":
      main = ["**КД:** **24** ч.", `**Смена:** фикс **+${fmt(1_904)}** ₽, без модификаторов.`].join("\n\n");
      break;
    case "dispatcher":
      main = [
        "**КД:** **16** ч.",
        `**Смена:** фикс **+${fmt(def.basePayoutRub)}** ₽ · **2%** шанс премии **+345…+656** ₽.`,
        "**Роль:** мало нажатий, **ниже** ₽/час КД, чем у **склада** / **развлекательного центра** — обмен времени ожидания на предсказуемость.",
        "**Навыки:** коммуникация **28+**, дисциплина **20+** · нужно **жильё**.",
      ].join("\n\n");
      break;
    case "assembler":
      main = [
        "**КД:** **8** ч.",
        `**Смена:** фикс **+${fmt(def.basePayoutRub)}** ₽ · **3%** штраф **−138…−414** ₽ · каждая **7-я** смена на этой работе: премия **+${fmt(1_794)}** ₽.`,
        "**Роль:** **стабильная** опора тир-2 — без минусовых смен, дисперсия только от редкого штрафа и премии.",
        "**Навыки:** дисциплина **28+**, логистика **20+** · нужно **жильё**.",
      ].join("\n\n");
      break;
    case "expediter":
      main = [
        "**КД:** **4** ч.",
        `**Смена:** одна **случайная** сумма: база **${fmt(EXPEDITER_PAYOUT_FLOOR_RUB)}** ₽ + надбавка (или сильный минус). **Итог может быть отрицательным.**`,
        "**Сценарии** (шанс · ориентир **уже в ₽ на счёт**):",
        "• **12%** · **~−3 700…−1 200** ₽ · авария, штрафы, срыв",
        "• **23%** · **~2 600–3 300** ₽",
        "• **35%** · **~3 300–4 300** ₽",
        "• **20%** · **~4 300–5 600** ₽",
        "• **10%** · **~5 600–7 000** ₽",
        "**Навыки:** логистика **28+**, коммуникация **20+** · нужно **жильё**.",
      ].join("\n\n");
      break;
    case "officeAnalyst": {
      const basePass = getTier3JobDef("officeAnalyst").passiveBaseRub;
      main = [
        `**Ежедневный оклад (полночь МСК):** **${fmt(basePass)}** ₽ × (**1** + **8%** × **ранг**). Ранг растёт каждые **${TIER3_PROMOTION_EVERY_DAYS}** календарных дней стрика (макс. ранг **15**). Пример: ранг **0** → **${fmt(basePass)}** ₽/день; ранг **3** → **${fmt(Math.floor(basePass * (1 + 0.08 * 3)))}** ₽/день.`,
        "**КД смены:** **12** ч.",
        `**Смена:** **${fmt(def.basePayoutRub)}** ₽ + **150** ₽ × ранг + до **450** ₽ (**30** ₽ за каждые **5** дней стрика, не больше **450**) · **3%** штраф **−100…−280** ₽.`,
        "**Связь** и **Совещание** (КД **24** ч каждое): **floor(оклад_ориентир × p)**, где **p** случайно **10–30%**, ориентир = тот же **13 200**×(**1**+**8%**×ранг). Пример при ранге **0**: ориентир **13 200** → бонус **~1 320…3 960** ₽.",
        "**Навыки:** коммуникация **30+**, логистика **28+**, дисциплина **35+** · **жильё**.",
      ].join("\n\n");
      break;
    }
    case "shadowFixer":
      main = [
        "**Ежедневного оклада нет.**",
        "**КД смены:** **3,5** ч.",
        "**Смена:** случайная; «удача» усиливается от **ранга** и **стрика** (коэффициент **posBoost** в коде: **1** + **2,5%**×ранг + до **+15%** от дней стрика).",
        "**Шансы:** **10%** сильный минус (до порядка **−1 000** ₽ и ниже) · **28%** мелкий плюс · **34%** средний · **20%** крупный · **8%** очень крупный (после множителей **×3,45** и **×1,12** к ветке).",
        "**Связь:** как у офиса — **10–30%** ориентира ежедневного оклада **13 200**×(**1**+**8%**×ранг) на основной счёт, КД **24** ч.",
        "**Куратор:** **42%** **+5…10** дней к стрику · **36%** **+2…4** дня · **22%** без эффекта · КД **24** ч.",
        "**Навыки:** коммуникация **42+**, логистика **38+**, дисциплина **48+** · **жильё**.",
      ].join("\n\n");
      break;
    case "soleProp":
      main = [
        "**Ежедневный оклад (полночь МСК):** считается от **баланса бизнеса** (отдельно от личного счёта, потолок **500 000 000** ₽).",
        "**Идея формулы:** `floor((520 + капитал × 0,0175) × (1 + 8%×ранг) × …)`** — дальше множители **престижа** (до **~+55%** на высоком престиже), **риска** −2…+2 (**+6%** к множителю за шаг, плюс случайный разброс при риске **≥1**), **эффективности** (**0,3…1**) и **временного** множителя (**1…1,35**).",
        "**Пример (риск 0, без временного буста, эффективность 1):** при **0** ₽ на бизнесе и ранге **0** базовая часть **~520** ₽/день; при **500 000** ₽ на бизнесе **~520 + 8 750** — точное значение см. строку «ориентир» в панели ИП.",
        "**Реклама:** **10 000…лимит** ₽ с бизнеса; лимит **125 000** + **40 000** × ранг; шанс провала растёт с долей от лимита; КД **24** ч.",
        "**Персонал:** КД **7** дней — временный множитель, сдвиг эффективности или без эффекта (вероятности в коде: **32%** / **15%** / **15%** / **10%** / остальное нейтрально).",
        "**Контроль:** отметка раз в **24** ч; пропуски отметок снижают эффективность; серии отметок могут её восстанавливать.",
        "**Навыки:** коммуникация **55+**, логистика **52+**, дисциплина **60+** · **жильё**.",
      ].join("\n\n");
      break;
    default:
      main = def.title;
  }
  return main;
}

function buildJobDetailEmbed(member: GuildMember, jobId: JobId): EmbedBuilder {
  const def = getAnyJobDef(jobId);
  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle(`${def.title} — подробно`)
    .setDescription(buildJobDetailBody(jobId))
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildJobDetailRows(jobId: JobId): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_WORK_BUTTON_JOB_DETAIL_CLOSE_PREFIX}${jobId}`)
        .setLabel("Назад")
        .setStyle(ButtonStyle.Secondary),
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
  if (isTier12JobId(jobId)) {
    extra.push(...tier12CareerEmbedLines(jobId, exp, def.baseCooldownMs));
  }
  if (jobId === "courier" && u.jobId === "courier") {
    extra.push("");
    extra.push(...courierWorkExtrasLines(u, now));
  }
  const t3 = tier3StatusLines(u, jobId, now);
  if (t3.length) {
    extra.push("");
    extra.push(...t3);
  }
  const req = meetsJobReq(u, def);
  if ((def.reqSkills ?? {}) && Object.keys(def.reqSkills ?? {}).length > 0) {
    extra.push("");
    extra.push(req.ok ? "Требования: **выполнены**." : `Требования: **не выполнены**.\n- ${req.missing.join("\n- ")}`);
  }
  const needsHousing = isTier2JobId(jobId) || isTier3PanelJob(jobId);
  if (needsHousing) {
    extra.push("");
    extra.push(
      hasTier2PlusHousing(u, now)
        ? "Жильё: **есть** — требование для **тир 2+** выполнено."
        : "Жильё: **нет** — для устройства на **тир 2+** сначала **аренда** или **своя квартира** в магазине терминала.",
    );
  }

  const shiftLine =
    jobId === "soleProp"
      ? "Доход: **ежедневный оклад** (МСК) и действия бизнеса (кнопки в панели)."
      : `КД смены: **${cdHoursLabel(cd)} ч**`;
  return new EmbedBuilder()
    .setColor(PROFILE_COLOR)
    .setTitle(`${def.title}`)
    .setDescription(
      [
        jobCardSummaryLine(jobId),
        "",
        jobPayoutEmbedLine(jobId, def.basePayoutRub),
        shiftLine,
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

function isTier3PanelJob(jobId: JobId): boolean {
  return isTier3JobId(jobId);
}

function workCatalogBackButtonId(jobId: JobId): string {
  if (isTier3PanelJob(jobId)) return ECON_WORK_BUTTON_TIER3;
  if (isTier2JobId(jobId)) return ECON_WORK_BUTTON_TIER2;
  return ECON_WORK_BUTTON_STARTERS;
}

/** Ориентир ежедневного оклада ИП при разных вложениях (риск 0 — без рандом-джиттера). */
function solePropPassiveExampleLines(u: ReturnType<typeof getEconomyUser>): string[] {
  const sdef = getTier3JobDef("soleProp");
  const streak = u.jobMskDayStreak ?? 0;
  const caps = [0, 100_000, 250_000, 500_000, 1_000_000, 2_000_000, 5_000_000];
  const out: string[] = [
    "**Ориентир ежедневного оклада** при разном балансе бизнеса (полночь МСК, ползунок риска **0** — без случайного джиттера):",
  ];
  for (const cap of caps) {
    const night = computeTier3PassiveRub({
      jobId: "soleProp",
      def: sdef,
      streakDays: streak,
      solePropCapitalRub: cap,
      solePropRiskDial: 0,
      prestigePoints: u.prestigePoints ?? 0,
      solePropPassiveEffMult: u.solePropPassiveEffMult ?? 1,
      solePropPassiveTempMult: u.solePropPassiveTempMult ?? 1,
    });
    out.push(`• **${fmt(cap)}** ₽ → **~${fmt(night)}**/день · **~${fmt(night * 30)}**/30 сут`);
  }
  out.push(
    `Считано с вашими **престижем**, множителями и **рангом ${tier3PromotionRank(streak)}**; строка «оценка оклада» выше — с **вашим** текущим риском.`,
  );
  return out;
}

function tier3StatusLines(u: ReturnType<typeof getEconomyUser>, jobId: JobId, now: number): string[] {
  if (!isTier3PanelJob(jobId)) return [];
  const def = getTier3JobDef(jobId as Tier3JobId);
  const rank = tier3PromotionRank(u.jobMskDayStreak ?? 0);
  const lines: string[] = [];
  const rankTitle = tier3RankTitle(jobId as Tier3JobId, rank);
  lines.push(`**Должность:** **${rankTitle}** (ранг **${rank}**) · стрик МСК: **${u.jobMskDayStreak ?? 0}** дн.`);
  if (def.archetype === "legal") {
    lines.push(`Ежедневный оклад (полночь МСК) — **основной** доход; смены — дополнение.`);
    const ref = tier3ReferencePassiveRubFromStreak(u.jobMskDayStreak ?? 0);
    lines.push(`Ориентир ежедневного оклада для бонусов: **~${fmt(ref)}** ₽.`);
  } else if (def.archetype === "illegal") {
    lines.push(`Ежедневного оклада **нет**; смены + мелкие действия **24 ч** КД каждое.`);
  } else {
    const sdef = getTier3JobDef("soleProp");
    const passEst = computeTier3PassiveRub({
      jobId: "soleProp",
      def: sdef,
      streakDays: u.jobMskDayStreak ?? 0,
      solePropCapitalRub: u.solePropCapitalRub ?? 0,
      solePropRiskDial: u.solePropRiskDial ?? 0,
      prestigePoints: u.prestigePoints ?? 0,
      solePropPassiveEffMult: u.solePropPassiveEffMult ?? 1,
      solePropPassiveTempMult: u.solePropPassiveTempMult ?? 1,
    });
    lines.push(`Баланс бизнеса: **${fmt(u.solePropCapitalRub ?? 0)}** ₽ · оценка оклада (сутки): **~${fmt(passEst)}** ₽.`);
    lines.push(
      `Эффективность оклада: **×${(u.solePropPassiveEffMult ?? 1).toFixed(1)}** · временный множ.: **×${(u.solePropPassiveTempMult ?? 1).toFixed(2)}**${
        u.solePropPassiveTempUntilMs && now < u.solePropPassiveTempUntilMs
          ? ` до <t:${Math.floor(u.solePropPassiveTempUntilMs / 1000)}:R>`
          : ""
      }.`,
    );
    const adL = (u.solePropAdvertReadyAt ?? 0) - now;
    const stL = (u.solePropStaffReadyAt ?? 0) - now;
    const ctL = (u.solePropControlReadyAt ?? 0) - now;
    lines.push(adL > 0 ? `Реклама: через **${formatCooldown(adL)}**.` : `Реклама: **доступна**.`);
    lines.push(stL > 0 ? `Персонал: через **${formatCooldown(stL)}**.` : `Персонал: **доступен**.`);
    lines.push(ctL > 0 ? `Контроль: через **${formatCooldown(ctL)}**.` : `Контроль: **доступен**.`);
    lines.push("");
    lines.push(...solePropPassiveExampleLines(u));
    return lines;
  }
  const sideLeft = (u.tier3SideGigReadyAt ?? 0) - now;
  const bossLeft = (u.tier3BossReadyAt ?? 0) - now;
  lines.push(sideLeft > 0 ? `Связь: через **${formatCooldown(sideLeft)}**.` : `Связь: **доступна**.`);
  const bossLabel = def.archetype === "illegal" ? "Куратор" : "Совещание";
  lines.push(bossLeft > 0 ? `${bossLabel}: через **${formatCooldown(bossLeft)}**.` : `${bossLabel}: **доступно**.`);
  return lines;
}

function buildTier3JobsOverviewEmbed(member: GuildMember): EmbedBuilder {
  const lines = JOBS_TIER3.map((d) => {
    const jd = jobDefFromTier3(d);
    return `${jobOpeningLine(jd.id)} · ${formatJobTierReqLine(jd)}`;
  });
  return new EmbedBuilder()
    .setColor(PANEL_COLOR)
    .setTitle("Продвинутые (т3)")
    .setDescription(
      [
        "**Офис** — **ежедневный оклад** (МСК) + смены; **Связь** и **Совещание** (КД **24 ч**) дают **10–30%** ориентира оклада офиса.",
        "**Схемы** — короткий КД и **случайная** выплата за смену; **Связь** (те же **10–30%**) + **Куратор** (ускорение стрика).",
        "**ИП** — **ежедневный оклад** от баланса бизнеса; **реклама**, **персонал** (**7** дн.), **контроль** (**24** ч), переводы.",
        "**Жильё обязательно** (как для т2).",
        "",
        ...lines,
      ].join("\n\n"),
    )
    .setFooter({ text: `Запросил: ${member.user.tag}` });
}

function buildTier3JobRows(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}officeAnalyst`).setLabel("Офис").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}shadowFixer`).setLabel("Схемы").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}soleProp`).setLabel("ИП").setStyle(ButtonStyle.Secondary),
  );
  const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(ECON_BUTTON_WORK).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
  );
  return [row, nav];
}

function buildTier3ActionRows(member: GuildMember, jobId: JobId): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const now = Date.now();
  const def = getTier3JobDef(jobId as Tier3JobId);

  if (def.archetype === "ip") {
    const adR = !u.solePropAdvertReadyAt || now >= u.solePropAdvertReadyAt;
    const stR = !u.solePropStaffReadyAt || now >= u.solePropStaffReadyAt;
    const ctR = !u.solePropControlReadyAt || now >= u.solePropControlReadyAt;
    return [
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_IP_AD_OPEN).setLabel("Реклама").setStyle(ButtonStyle.Primary).setDisabled(!adR),
        new ButtonBuilder().setCustomId(ECON_IP_STAFF).setLabel("Персонал").setStyle(ButtonStyle.Secondary).setDisabled(!stR),
        new ButtonBuilder().setCustomId(ECON_IP_CONTROL).setLabel("Контроль").setStyle(ButtonStyle.Secondary).setDisabled(!ctR),
      ),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_IP_DEP_OPEN).setLabel("В бизнес…").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(ECON_IP_WD_OPEN).setLabel("На счёт…").setStyle(ButtonStyle.Secondary).setDisabled((u.solePropCapitalRub ?? 0) < 1),
      ),
    ];
  }

  const sideReady = !u.tier3SideGigReadyAt || now >= u.tier3SideGigReadyAt;
  const bossReady = !u.tier3BossReadyAt || now >= u.tier3BossReadyAt;
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
        .setCustomId(ECON_TIER3_SIDE)
        .setLabel("Связь")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!sideReady),
      new ButtonBuilder()
        .setCustomId(ECON_TIER3_BOSS)
        .setLabel(def.archetype === "illegal" ? "Куратор" : "Совещание")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!bossReady),
    ),
  ];
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
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}${newJobId}`)
        .setLabel("Назад")
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildJobInfoRows(member: GuildMember, jobId: JobId, canTakeSkills: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const u = getEconomyUser(member.guild.id, member.id);
  const backId = workCatalogBackButtonId(jobId);
  const now = Date.now();
  const rows: ActionRowBuilder<ButtonBuilder>[] = [];

  const jobDetailBtn = new ButtonBuilder()
    .setCustomId(`${ECON_WORK_BUTTON_JOB_DETAIL_PREFIX}${jobId}`)
    .setLabel("Подробнее")
    .setStyle(ButtonStyle.Secondary);

  if (u.jobId === jobId) {
    const state = canWorkNow(u, jobId, now);
    if (jobId === "soleProp") {
      rows.push(
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(ECON_WORK_BUTTON_QUIT)
            .setLabel("Уволиться")
            .setStyle(ButtonStyle.Danger)
            .setDisabled(!state.ok),
          jobDetailBtn,
        ),
      );
    } else {
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
          jobDetailBtn,
        ),
      );
    }
    if (jobId === "courier" && !hasOwnedCourierCar(u) && !hasActiveBikeRental(u, now)) {
      rows.push(buildCourierBikeRow(member));
    }
    if (isTier3PanelJob(jobId)) {
      rows.push(...buildTier3ActionRows(member, jobId));
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
  const needsHousing = isTier2JobId(jobId) || isTier3PanelJob(jobId);
  const housingOk = !needsHousing || hasTier2PlusHousing(u, now);
  const selectDisabled = !canTakeSkills || !switchOk || !housingOk;

  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(takeId)
        .setLabel("Выбрать")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(selectDisabled),
      new ButtonBuilder()
        .setCustomId(`${ECON_WORK_BUTTON_JOB_DETAIL_PREFIX}${jobId}`)
        .setLabel("Подробнее")
        .setStyle(ButtonStyle.Secondary),
    ),
  );
  rows.push(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(backId).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    ),
  );
  return rows;
}

function buildCurrentJobEmbed(
  member: GuildMember,
  opts?: { lastShiftDeltaRub?: number; lastShiftNotes?: string[]; tier3ActionNotes?: string[] },
): EmbedBuilder {
  const u = getEconomyUser(member.guild.id, member.id);
  if (!u.jobId) {
    return new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Работа")
      .setDescription("Работа не выбрана. Откройте **Начальные (т1)** или другой уровень и выберите профессию.")
      .setFooter({ text: `Запросил: ${member.user.tag}` });
  }
  const def = getAnyJobDef(u.jobId);
  const now = Date.now();
  const cd = u.jobId === "courier" ? effectiveCourierCooldownMs(u, now) : def.baseCooldownMs;
  const state = canWorkNow(u, u.jobId, now);
  const exp = getJobExp(u, u.jobId);
  const lines =
    u.jobId === "soleProp"
      ? [
          `Текущая работа: **${def.title}**`,
          `Опыт смен на этой работе: **${exp}**`,
          jobPayoutEmbedLine(u.jobId, def.basePayoutRub),
          "Доход: **ежедневный оклад** (МСК) и действия бизнеса.",
        ]
      : [
          `Текущая работа: **${def.title}**`,
          `Опыт смен на этой работе: **${exp}**`,
          ...(isTier12JobId(u.jobId) ? tier12CareerEmbedLines(u.jobId, exp, def.baseCooldownMs) : []),
          jobPayoutEmbedLine(u.jobId, def.basePayoutRub),
          `КД смены: **${cdHoursLabel(cd)} ч**`,
          state.ok ? "Смена: **доступна сейчас**." : `Смена: через **${formatCooldown(state.msLeft)}**.`,
        ];
  const t3 = tier3StatusLines(u, u.jobId, now);
  if (t3.length) {
    lines.push("");
    lines.push(...t3);
  }
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

  if (opts?.tier3ActionNotes?.length) {
    lines.push("");
    lines.push(...opts.tier3ActionNotes);
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
  const backId = workCatalogBackButtonId(u.jobId);
  const curJobId = u.jobId;
  const myJobDetailBtn = new ButtonBuilder()
    .setCustomId(`${ECON_WORK_BUTTON_JOB_DETAIL_PREFIX}${curJobId}`)
    .setLabel("Подробнее")
    .setStyle(ButtonStyle.Secondary);
  if (u.jobId === "soleProp") {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(ECON_WORK_BUTTON_QUIT)
          .setLabel("Уволиться")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!state.ok),
        myJobDetailBtn,
      ),
    );
  } else {
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(ECON_WORK_BUTTON_SHIFT).setLabel("Выйти на смену").setStyle(ButtonStyle.Success).setDisabled(!state.ok),
        new ButtonBuilder()
          .setCustomId(ECON_WORK_BUTTON_QUIT)
          .setLabel("Уволиться")
          .setStyle(ButtonStyle.Danger)
          .setDisabled(!state.ok),
        myJobDetailBtn,
      ),
    );
  }
  if (u.jobId === "courier" && !hasOwnedCourierCar(u) && !hasActiveBikeRental(u, now)) {
    rows.push(buildCourierBikeRow(member));
  }
  if (isTier3PanelJob(u.jobId)) {
    rows.push(...buildTier3ActionRows(member, u.jobId));
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
      ECON_BUTTON_HOUSING,
      ECON_HOUSING_EDIT,
      ECON_HOUSING_BACK,
      ECON_HOUSING_LEAVE,
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
      ECON_SHOP_APT_SELL,
      ECON_COURIER_BIKE_1D,
      ECON_COURIER_BIKE_3D,
      ECON_COURIER_BIKE_7D,
      ECON_WORK_BUTTON_STARTERS,
      ECON_WORK_BUTTON_TIER2,
      ECON_WORK_BUTTON_TIER3,
      ECON_TIER3_SIDE,
      ECON_TIER3_BOSS,
      ECON_IP_AD_OPEN,
      ECON_IP_STAFF,
      ECON_IP_CONTROL,
      ECON_IP_DEP_OPEN,
      ECON_IP_WD_OPEN,
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
    cid.startsWith(ECON_PROFILE_BETS_PAGE_PREFIX) ||
    cid.startsWith(ECON_FEED_BUTTON_PAGE_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_JOB_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_TAKE_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_SWITCH_CONFIRM_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_JOB_DETAIL_PREFIX) ||
    cid.startsWith(ECON_WORK_BUTTON_JOB_DETAIL_CLOSE_PREFIX) ||
    cid.startsWith("econ:shop") ||
    cid.startsWith("econ:housing:") ||
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
      components: buildTerminalPanelRows(member),
    });
    return true;
  }

  if (id === ECON_BUTTON_PROFILE) {
    await replyOrUpdate(interaction, { embeds: [buildProfileHubEmbed(member)], components: buildProfileHubRows("info") });
    return true;
  }

  if (id === ECON_BUTTON_HOUSING) {
    const uh = getEconomyUser(member.guild.id, member.id);
    if ((uh.housingKind ?? "none") !== "rent") {
      await interaction.reply({
        content: "Экран **Жильё** доступен при **аренде**. Оформить можно в **Магазин** → жильё.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildMyRentHomeEmbed(member)], components: buildMyRentHomeRows(member) });
    return true;
  }

  if (id === ECON_HOUSING_EDIT) {
    const ue = getEconomyUser(member.guild.id, member.id);
    if ((ue.housingKind ?? "none") !== "rent") {
      await interaction.reply({
        content: "Вы **не** на аренде. Жильё оформляется в **Магазин** → жильё.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildMyRentEditEmbed(member)], components: buildMyRentEditRows(member) });
    return true;
  }

  if (id === ECON_HOUSING_BACK) {
    const ub = getEconomyUser(member.guild.id, member.id);
    if ((ub.housingKind ?? "none") !== "rent") {
      await replyOrUpdate(interaction, {
        embeds: [buildTerminalPanelEmbed(member.guild.name)],
        components: buildTerminalPanelRows(member),
      });
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildMyRentHomeEmbed(member)], components: buildMyRentHomeRows(member) });
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
    await replyOrUpdate(interaction, {
      embeds: [buildProfileBetHistoryEmbed(member, 0)],
      components: buildProfileBetsTabComponents(member, 0),
    });
    return true;
  }

  if (id.startsWith(ECON_PROFILE_BETS_PAGE_PREFIX)) {
    const raw = id.slice(ECON_PROFILE_BETS_PAGE_PREFIX.length);
    const parsed = Number.parseInt(raw, 10);
    const page = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    await replyOrUpdate(interaction, {
      embeds: [buildProfileBetHistoryEmbed(member, page)],
      components: buildProfileBetsTabComponents(member, page),
    });
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
    await replyOrUpdate(interaction, { embeds: [buildShopPhoneEmbed(member)], components: buildShopPhoneRows(member) });
    return true;
  }

  if (id.startsWith(ECON_SHOP_PHONE_BUY_PREFIX)) {
    const pid = id.slice(ECON_SHOP_PHONE_BUY_PREFIX.length);
    const defP = getPhoneDef(pid);
    if (!defP) {
      await interaction.reply({ content: "Неизвестная модель телефона.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const u = getEconomyUser(member.guild.id, member.id);
    const cur = getPhoneDef(u.phoneModelId);
    const cost = cur ? Math.max(0, defP.priceRub - cur.priceRub) : defP.priceRub;
    const prestigeDelta = defP.prestigeDelta - (cur?.prestigeDelta ?? 0);
    if (cur && defP.priceRub < cur.priceRub) {
      await interaction.reply({ content: "Понижение модели **недоступно**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (u.rubles < cost) {
      await interaction.reply({ content: `Нужно ещё **${fmt(cost)}** ₽.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    if (cur?.id === defP.id && u.hasPhone) {
      await interaction.reply({ content: "У вас уже эта модель.", flags: MessageFlags.Ephemeral });
      return true;
    }
    patchEconomyUser(member.guild.id, member.id, {
      rubles: u.rubles - cost,
      hasPhone: true,
      phoneModelId: defP.id,
      prestigePoints: Math.max(0, (u.prestigePoints ?? 0) + prestigeDelta),
    });
    await replyOrUpdate(interaction, { embeds: [buildShopPhoneEmbed(member)], components: buildShopPhoneRows(member) });
    return true;
  }

  if (id === ECON_SHOP_CAR) {
    await replyOrUpdate(interaction, { embeds: [buildShopCarEmbed(member)], components: buildShopCarRows(member) });
    return true;
  }

  if (id.startsWith(ECON_SHOP_CAR_BUY_PREFIX)) {
    const cid = id.slice(ECON_SHOP_CAR_BUY_PREFIX.length);
    const defC = getCarDef(cid);
    if (!defC) {
      await interaction.reply({ content: "Неизвестная модель авто.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const u = getEconomyUser(member.guild.id, member.id);
    const cur = getCarDef(u.ownedCarId);
    const cost = cur ? Math.max(0, defC.priceRub - cur.priceRub) : defC.priceRub;
    const prestigeDelta = defC.prestigeDelta - (cur?.prestigeDelta ?? 0);
    if (cur && defC.priceRub < cur.priceRub) {
      await interaction.reply({ content: "Понижение класса **недоступно**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (u.rubles < cost) {
      await interaction.reply({ content: `Нужно ещё **${fmt(cost)}** ₽.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    if (cur?.id === defC.id) {
      await interaction.reply({ content: "У вас уже это авто.", flags: MessageFlags.Ephemeral });
      return true;
    }
    patchEconomyUser(member.guild.id, member.id, {
      rubles: u.rubles - cost,
      ownedCarId: defC.id,
      prestigePoints: Math.max(0, (u.prestigePoints ?? 0) + prestigeDelta),
      courierBikeUntilMs: undefined,
    });
    await replyOrUpdate(interaction, { embeds: [buildShopCarEmbed(member)], components: buildShopCarRows(member) });
    return true;
  }

  if (id === ECON_SHOP_HOUSE) {
    await replyOrUpdate(interaction, { embeds: [buildShopHouseEmbed(member)], components: buildShopHouseRows(member) });
    return true;
  }

  if (id === ECON_SHOP_HOUSE_RENT_1D || id === ECON_SHOP_HOUSE_RENT_7D || id === ECON_SHOP_HOUSE_RENT_30D) {
    const plan: HousingRentPlan = id === ECON_SHOP_HOUSE_RENT_1D ? "day" : id === ECON_SHOP_HOUSE_RENT_7D ? "week" : "month";
    const r = applyRentPlanPurchase(member, plan);
    if (!r.ok) {
      await interaction.reply({ content: r.reply, flags: MessageFlags.Ephemeral });
      return true;
    }
    await replyAfterRentPlanPurchase(interaction, member, "shop");
    return true;
  }

  if (id.startsWith(ECON_HOUSING_EXT_PREFIX)) {
    const raw = id.slice(ECON_HOUSING_EXT_PREFIX.length);
    const plan: HousingRentPlan | undefined =
      raw === "day" ? "day" : raw === "week" ? "week" : raw === "month" ? "month" : undefined;
    if (!plan) {
      await interaction.reply({ content: "Неверный пакет.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const r = applyRentPlanPurchase(member, plan);
    if (!r.ok) {
      await interaction.reply({ content: r.reply, flags: MessageFlags.Ephemeral });
      return true;
    }
    await replyAfterRentPlanPurchase(interaction, member, "myRentEdit");
    return true;
  }

  if (id === ECON_SHOP_HOUSE_LEAVE || id === ECON_HOUSING_LEAVE) {
    const u = getEconomyUser(member.guild.id, member.id);
    if ((u.housingKind ?? "none") !== "rent") {
      await interaction.reply({ content: "Вы **не** на аренде.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const lost = u.housingRentPrestigeGranted ? HOUSING_RENT_PRESTIGE_ONE_TIME : 0;
    const quitJob = economyUserClearTier2PlusJobPatch(u);
    patchEconomyUser(member.guild.id, member.id, {
      housingKind: "none",
      housingRentNextDueMs: undefined,
      housingRentPlan: undefined,
      housingRentRenewalPlan: undefined,
      housingRentLastPaidRub: undefined,
      housingRentLastPeriodMs: undefined,
      housingRentChainStartedAtMs: undefined,
      housingRentTotalPaidRub: undefined,
      housingRentPrestigeGranted: false,
      prestigePoints: Math.max(0, (u.prestigePoints ?? 0) - lost),
      ...quitJob,
    });
    if (id === ECON_HOUSING_LEAVE) {
      await replyOrUpdate(interaction, {
        embeds: [buildTerminalPanelEmbed(member.guild.name)],
        components: buildTerminalPanelRows(member),
      });
    } else {
      await replyOrUpdate(interaction, { embeds: [buildShopHouseEmbed(member)], components: buildShopHouseRows(member) });
    }
    return true;
  }

  if (id.startsWith(ECON_SHOP_HOUSE_RENEW_AFTER_REQ_PREFIX)) {
    const raw = id.slice(ECON_SHOP_HOUSE_RENEW_AFTER_REQ_PREFIX.length);
    const planNext: HousingRentPlan | undefined =
      raw === "day" ? "day" : raw === "week" ? "week" : raw === "month" ? "month" : undefined;
    if (!planNext) {
      await interaction.reply({ content: "Неверный пакет.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const uR = getEconomyUser(member.guild.id, member.id);
    if ((uR.housingKind ?? "none") !== "rent") {
      await interaction.reply({ content: "План следующего цикла доступен только **на аренде**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const nowR = Date.now();
    if (!uR.housingRentNextDueMs || nowR >= uR.housingRentNextDueMs) {
      await interaction.reply({
        content: "Нет активного оплаченного срока — **продлите** аренду, затем можно выбрать пакет на следующий цикл.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const priceN = housingRentPlanPriceRub(planNext);
    const embedR = new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Пакет на следующий цикл")
      .setDescription(
        [
          `Сейчас действует оплаченный срок **до** <t:${Math.floor(uR.housingRentNextDueMs / 1000)}:F> — **он не меняется.**`,
          "",
          `После его окончания **первое** автосписание в полночь МСК будет по пакету **${rentPlanLabelRu(planNext)}** (**${fmt(priceN)}** ₽).`,
          "",
          "Ручные продления до этой даты и пакет **текущего** цикла **не** затрагиваются.",
        ].join("\n"),
      )
      .setFooter({ text: `Запросил: ${member.user.tag}` });
    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [embedR],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder()
            .setCustomId(`${ECON_SHOP_HOUSE_RENEW_AFTER_CNF_PREFIX}${planNext}`)
            .setLabel("Подтвердить")
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(ECON_SHOP_HOUSE_RENEW_AFTER_CAN).setLabel("Отмена").setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    return true;
  }

  if (id.startsWith(ECON_SHOP_HOUSE_RENEW_AFTER_CNF_PREFIX)) {
    const raw = id.slice(ECON_SHOP_HOUSE_RENEW_AFTER_CNF_PREFIX.length);
    const planNext: HousingRentPlan | undefined =
      raw === "day" ? "day" : raw === "week" ? "week" : raw === "month" ? "month" : undefined;
    if (!planNext) {
      await interaction.reply({ content: "Неверный пакет.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const uC = getEconomyUser(member.guild.id, member.id);
    if ((uC.housingKind ?? "none") !== "rent") {
      await interaction.reply({ content: "Вы **не** на аренде.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const nowC = Date.now();
    if (!uC.housingRentNextDueMs || nowC >= uC.housingRentNextDueMs) {
      await interaction.reply({
        content: "Срок аренды уже истёк или не оплачен — действие недоступно.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    patchEconomyUser(member.guild.id, member.id, { housingRentRenewalPlan: planNext });
    const priceC = housingRentPlanPriceRub(planNext);
    const doneEmb = new EmbedBuilder()
      .setColor(PANEL_COLOR)
      .setTitle("Сохранено")
      .setDescription(
        [
          `После <t:${Math.floor(uC.housingRentNextDueMs / 1000)}:F> первое автосписание в полночь МСК: **${rentPlanLabelRu(planNext)}** (**${fmt(priceC)}** ₽).`,
          "",
          "До этой даты можно **переопределить** пакет в **Жильё** → **Изменить срок** (кнопки «После срока»).",
        ].join("\n"),
      );
    await interaction.update({ embeds: [doneEmb], components: [] });
    return true;
  }

  if (id === ECON_SHOP_HOUSE_RENEW_AFTER_CAN) {
    await interaction.update({ content: "Отменено.", embeds: [], components: [] });
    return true;
  }

  if (id.startsWith(ECON_SHOP_APT_BUY_PREFIX)) {
    const aid = id.slice(ECON_SHOP_APT_BUY_PREFIX.length);
    const defA = getApartmentDef(aid);
    if (!defA) {
      await interaction.reply({ content: "Неизвестная квартира.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const u = getEconomyUser(member.guild.id, member.id);
    const hk = u.housingKind ?? "none";
    const curA = getApartmentDef(u.ownedApartmentId);
    const cost = hk === "owned" && curA ? Math.max(0, defA.priceRub - curA.priceRub) : defA.priceRub;
    const prestigeDelta = defA.prestigeDelta - (curA?.prestigeDelta ?? 0);
    if (hk === "owned" && curA && defA.priceRub < curA.priceRub) {
      await interaction.reply({ content: "Переезд на более дешёвую квартиру **недоступен**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const now = Date.now();
    const rentRefund = hk === "rent" ? housingRentUnusedRefundRub(u, now) : 0;
    if (u.rubles + rentRefund < cost) {
      await interaction.reply({
        content: `Нужно ещё **${fmt(Math.max(0, cost - rentRefund))}** ₽ (с учётом возврата с аренды **${fmt(rentRefund)}** ₽).`,
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (hk === "owned" && curA?.id === defA.id) {
      await interaction.reply({ content: "У вас уже эта квартира.", flags: MessageFlags.Ephemeral });
      return true;
    }
    patchEconomyUser(member.guild.id, member.id, {
      rubles: u.rubles + rentRefund - cost,
      housingKind: "owned",
      ownedApartmentId: defA.id,
      housingUtilityNextDueMs: now + HOUSING_CALENDAR_MONTH_MS,
      housingRentNextDueMs: undefined,
      housingRentPlan: undefined,
      housingRentRenewalPlan: undefined,
      housingRentLastPaidRub: undefined,
      housingRentLastPeriodMs: undefined,
      housingRentChainStartedAtMs: undefined,
      housingRentTotalPaidRub: undefined,
      housingRentPrestigeGranted: false,
      prestigePoints: Math.max(0, (u.prestigePoints ?? 0) + prestigeDelta),
    });
    if (rentRefund > 0) {
      appendFeedEvent({
        ts: now,
        guildId: member.guild.id,
        type: "job:passive",
        actorUserId: member.id,
        text: `${member.toString()} купил квартиру **${defA.label}** с аренды: возврат **+${fmt(rentRefund)}** ₽ за неиспользованное время.`,
      });
      await ensureEconomyFeedPanel(interaction.client);
    }
    await replyOrUpdate(interaction, { embeds: [buildShopHouseEmbed(member)], components: buildShopHouseRows(member) });
    return true;
  }

  if (id === ECON_SHOP_APT_SELL) {
    const u = getEconomyUser(member.guild.id, member.id);
    if ((u.housingKind ?? "none") !== "owned") {
      await interaction.reply({ content: "Продать можно только **свою** квартиру.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const curA = getApartmentDef(u.ownedApartmentId);
    if (!curA) {
      await interaction.reply({ content: "Квартира не найдена в данных.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const refund = Math.floor(curA.priceRub * APARTMENT_SELL_REFUND_RATE);
    const nextPrestige = Math.max(0, (u.prestigePoints ?? 0) - curA.prestigeDelta);
    const quitJob = economyUserClearTier2PlusJobPatch(u);
    patchEconomyUser(member.guild.id, member.id, {
      rubles: u.rubles + refund,
      housingKind: "none",
      ownedApartmentId: undefined,
      housingUtilityNextDueMs: undefined,
      prestigePoints: nextPrestige,
      ...quitJob,
    });
    appendFeedEvent({
      ts: Date.now(),
      guildId: member.guild.id,
      type: "job:passive",
      actorUserId: member.id,
      text: `${member.toString()} продал квартиру **${curA.label}**: **+${fmt(refund)}** ₽ (**${Math.round(APARTMENT_SELL_REFUND_RATE * 100)}%**), престиж **−${fmt(curA.prestigeDelta)}**.`,
    });
    await ensureEconomyFeedPanel(interaction.client);
    await replyOrUpdate(interaction, { embeds: [buildShopHouseEmbed(member)], components: buildShopHouseRows(member) });
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
    const next = rollNewSimDigits(member.guild.id);
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
      await interaction.reply({ content: "Аренда вела доступна только на **доставке**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (hasOwnedCourierCar(u)) {
      await interaction.reply({ content: "С **личным авто** аренда вела **не нужна**.", flags: MessageFlags.Ephemeral });
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
    await replyOrUpdate(interaction, { embeds: [buildStarterJobsEmbed(member)], components: buildStarterJobsRows() });
    return true;
  }

  if (id === ECON_WORK_BUTTON_TIER2) {
    const embed = buildTier2JobsOverviewEmbed(member);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}dispatcher`).setLabel("Колл-центр").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}assembler`).setLabel("Склад").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${ECON_WORK_BUTTON_JOB_PREFIX}expediter`).setLabel("Развлекательный центр").setStyle(ButtonStyle.Secondary),
    );
    const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(ECON_BUTTON_WORK).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(ECON_BUTTON_MENU).setLabel("Главное меню").setStyle(ButtonStyle.Secondary),
    );
    await replyOrUpdate(interaction, { embeds: [embed], components: [row, nav] });
    return true;
  }

  if (id === ECON_WORK_BUTTON_TIER3) {
    await replyOrUpdate(interaction, {
      embeds: [buildTier3JobsOverviewEmbed(member)],
      components: buildTier3JobRows(),
    });
    return true;
  }

  if (
    id === ECON_IP_AD_OPEN ||
    id === ECON_IP_DEP_OPEN ||
    id === ECON_IP_WD_OPEN ||
    id === ECON_IP_STAFF ||
    id === ECON_IP_CONTROL
  ) {
    const u = getEconomyUser(member.guild.id, member.id);
    const now = Date.now();
    if (u.jobId !== "soleProp") {
      await interaction.reply({ content: "Эти действия доступны только на работе **ИП**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (id === ECON_IP_AD_OPEN) {
      const maxAd = solePropAdMaxRub(u.jobMskDayStreak ?? 0);
      const modal = new ModalBuilder().setCustomId(ECON_MODAL_IP_AD).setTitle(`Реклама (10k–${fmt(maxAd)} ₽ с бизнеса)`);
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("amount")
            .setLabel("Сумма кампании с баланса бизнеса, ₽")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(4)
            .setMaxLength(12),
        ),
      );
      await interaction.showModal(modal);
      return true;
    }
    if (id === ECON_IP_DEP_OPEN) {
      const modal = new ModalBuilder().setCustomId(ECON_MODAL_IP_DEP).setTitle("На баланс бизнеса");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("amount")
            .setLabel("Сумма со счёта → в бизнес, ₽")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(12),
        ),
      );
      await interaction.showModal(modal);
      return true;
    }
    if (id === ECON_IP_WD_OPEN) {
      const modal = new ModalBuilder().setCustomId(ECON_MODAL_IP_WD).setTitle("Вывод из бизнеса");
      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId("amount")
            .setLabel("Сумма на основной счёт, ₽")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(12),
        ),
      );
      await interaction.showModal(modal);
      return true;
    }
    if (id === ECON_IP_STAFF) {
      if (u.solePropStaffReadyAt && now < u.solePropStaffReadyAt) {
        await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
        return true;
      }
      const { patch, detail } = rollSolePropStaffOutcome(u, now);
      patchEconomyUser(member.guild.id, member.id, patch);
      await replyOrUpdate(interaction, {
        embeds: [buildCurrentJobEmbed(member, { tier3ActionNotes: [detail] })],
        components: buildCurrentJobRows(member),
      });
      return true;
    }
    if (id === ECON_IP_CONTROL) {
      if (u.solePropControlReadyAt && now < u.solePropControlReadyAt) {
        await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
        return true;
      }
      patchEconomyUser(member.guild.id, member.id, {
        solePropControlMskYmd: mskTodayYmd(now),
        solePropControlReadyAt: now + SOLE_PROP_CONTROL_CD_MS,
      });
      await replyOrUpdate(interaction, {
        embeds: [buildCurrentJobEmbed(member, { tier3ActionNotes: ["Контроль отмечен на сегодня (МСК)."] })],
        components: buildCurrentJobRows(member),
      });
      return true;
    }
    await interaction.reply({ content: "Действие не распознано.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (id === ECON_TIER3_SIDE || id === ECON_TIER3_BOSS) {
    const u = getEconomyUser(member.guild.id, member.id);
    const now = Date.now();
    if (!u.jobId || !isTier3JobId(u.jobId)) {
      await interaction.reply({ content: "Доступно только на **работе тир-3**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const jobId = u.jobId;
    const def3 = getTier3JobDef(jobId as Tier3JobId);
    if (def3.archetype === "ip") {
      await interaction.reply({
        content: "На **ИП** нет этих кнопок — **реклама**, **персонал**, **контроль** и переводы **в бизнес / на счёт**.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (id === ECON_TIER3_SIDE) {
      if (u.tier3SideGigReadyAt && now < u.tier3SideGigReadyAt) {
        await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
        return true;
      }
      const streak = u.jobMskDayStreak ?? 0;
      const bonus = rubFromTier3MetaPercent(streak);
      patchEconomyUser(member.guild.id, member.id, {
        rubles: u.rubles + bonus,
        tier3SideGigReadyAt: now + TIER3_SIDE_GIG_CD_MS,
      });
      await replyOrUpdate(interaction, {
        embeds: [buildCurrentJobEmbed(member, { tier3ActionNotes: [`Связь: **${formatDelta(bonus)}** на счёт (10–30% ориентира ежедневного оклада).`] })],
        components: buildCurrentJobRows(member),
      });
      return true;
    }

    if (id === ECON_TIER3_BOSS) {
      if (u.tier3BossReadyAt && now < u.tier3BossReadyAt) {
        await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
        return true;
      }
      if (def3.archetype === "legal") {
        const streak = u.jobMskDayStreak ?? 0;
        const bonus = rubFromTier3MetaPercent(streak);
        patchEconomyUser(member.guild.id, member.id, {
          rubles: u.rubles + bonus,
          tier3BossReadyAt: now + TIER3_BOSS_CD_MS,
        });
        await replyOrUpdate(interaction, {
          embeds: [buildCurrentJobEmbed(member, { tier3ActionNotes: [`Совещание: **${formatDelta(bonus)}** на счёт (10–30% ориентира ежедневного оклада).`] })],
          components: buildCurrentJobRows(member),
        });
        return true;
      }
      const streak = u.jobMskDayStreak ?? 0;
      const r = Math.random();
      let delta = 0;
      let detail: string;
      if (r < 0.42) {
        delta = randInt(5, 10);
        detail = `Куратор даёт ход: **+${delta}** дн. к стрику (быстрее к следующему рангу).`;
      } else if (r < 0.78) {
        delta = randInt(2, 4);
        detail = `Куратор подталкивает: **+${delta}** дн. к стрику.`;
      } else {
        detail = "Куратор на связи — **без изменений** по стрику.";
      }
      const nextStreak = streak + delta;
      patchEconomyUser(member.guild.id, member.id, {
        jobMskDayStreak: nextStreak,
        tier3BossReadyAt: now + TIER3_BOSS_CD_MS,
      });
      await replyOrUpdate(interaction, {
        embeds: [buildCurrentJobEmbed(member, { tier3ActionNotes: [detail] })],
        components: buildCurrentJobRows(member),
      });
      return true;
    }

    await interaction.reply({ content: "Действие не распознано.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (id.startsWith(ECON_WORK_BUTTON_JOB_DETAIL_PREFIX)) {
    const raw = id.slice(ECON_WORK_BUTTON_JOB_DETAIL_PREFIX.length);
    if (!isWorkJobId(raw)) {
      await interaction.reply({ content: "Неизвестная профессия.", flags: MessageFlags.Ephemeral });
      return true;
    }
    await replyOrUpdate(interaction, { embeds: [buildJobDetailEmbed(member, raw)], components: buildJobDetailRows(raw) });
    return true;
  }

  if (id.startsWith(ECON_WORK_BUTTON_JOB_DETAIL_CLOSE_PREFIX)) {
    const raw = id.slice(ECON_WORK_BUTTON_JOB_DETAIL_CLOSE_PREFIX.length);
    if (!isWorkJobId(raw)) {
      await interaction.reply({ content: "Неизвестная профессия.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const uClose = getEconomyUser(member.guild.id, member.id);
    if (uClose.jobId === raw) {
      await replyOrUpdate(interaction, { embeds: [buildCurrentJobEmbed(member)], components: buildCurrentJobRows(member) });
    } else {
      const defC = getAnyJobDef(raw);
      const reqC = meetsJobReq(uClose, defC);
      await replyOrUpdate(interaction, { embeds: [buildJobInfoEmbed(member, raw)], components: buildJobInfoRows(member, raw, reqC.ok) });
    }
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
    const nowTake = Date.now();
    if ((isTier2JobId(jobId) || isTier3PanelJob(jobId)) && !hasTier2PlusHousing(cur, nowTake)) {
      await interaction.reply({
        content: "Сначала оформите **жильё** (аренда или своя квартира) в магазине терминала — **обязательное** условие для работ **тир 2+**.",
        flags: MessageFlags.Ephemeral,
      });
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

    const curTake = getEconomyUser(member.guild.id, member.id);
    patchEconomyUser(member.guild.id, member.id, {
      jobId,
      jobChosenAt: Date.now(),
      ...tier3PatchWhenJobChanges(curTake, jobId),
    });
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
    const nowSw = Date.now();
    if ((isTier2JobId(jobId) || isTier3PanelJob(jobId)) && !hasTier2PlusHousing(cur, nowSw)) {
      await interaction.reply({
        content: "Сначала оформите **жильё** (аренда или своя квартира) в магазине терминала — **обязательное** условие для работ **тир 2+**.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    if (!cur.jobId) {
      patchEconomyUser(member.guild.id, member.id, {
        jobId,
        jobChosenAt: Date.now(),
        ...tier3PatchWhenJobChanges(cur, jobId),
      });
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

    patchEconomyUser(member.guild.id, member.id, {
      jobId,
      jobChosenAt: Date.now(),
      ...tier3PatchWhenJobChanges(cur, jobId),
    });
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
    const uQuit = getEconomyUser(member.guild.id, member.id);
    patchEconomyUser(member.guild.id, member.id, {
      jobId: undefined,
      jobChosenAt: undefined,
      lastWorkAt: undefined,
      ...tier3PatchWhenJobChanges(uQuit, undefined),
    });
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

    if (jobId === "soleProp") {
      await interaction.reply({ content: "На **ИП** смен **нет** — доход **ежедневным окладом** и действиями бизнеса.", flags: MessageFlags.Ephemeral });
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
      if (onlineDue && (u.simBalanceRub ?? 0) < COURIER_SIM_MONTHLY_FEE_RUB) {
        await interaction.reply({
          content: `На балансе сим нужно **${COURIER_SIM_MONTHLY_FEE_RUB.toLocaleString("ru-RU")}** ₽ за **тариф** на **30** суток (пополните в магазине).`,
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
      const { rub, band } = rollWaiterCafePayoutRub();
      extra = rub;
      notes.push(`${CAFE_BAND_HINT[band] ?? "Кафе."} Случайный итог: **${formatDelta(rub)}** ₽.`);
    } else if (jobId === "watchman") {
      // только фикс
    } else if (jobId === "dispatcher") {
      if (chance(0.02)) {
        const bonus = randInt(345, 656);
        extra += bonus;
        notes.push(`премия ${formatDelta(bonus)} (редко, слаженная смена)`);
      }
    } else if (jobId === "assembler") {
      if (chance(0.03)) {
        const fine = randInt(138, 414);
        extra -= fine;
        notes.push(`штраф ${formatDelta(-fine)}`);
      }
      if (expAfter % 7 === 0) {
        const bonus = 1_794;
        extra += bonus;
        notes.push(`премия ${formatDelta(bonus)} (7 смен)`);
      }
    } else if (jobId === "expediter") {
      base = 0;
      const r = Math.random();
      let add: number;
      if (r < 0.12) {
        add = randInt(-5_500, -3_000);
        notes.push(`Срыв / авария **${formatDelta(add)}** к базе выплаты — итог может быть в минусе.`);
      } else if (r < 0.35) {
        add = randInt(800, 1_500);
        notes.push(`Надбавка **${formatDelta(add)}** — ровный маршрут.`);
      } else if (r < 0.7) {
        add = randInt(1_500, 2_500);
        notes.push(`Надбавка **${formatDelta(add)}** — плотный график, много точек.`);
      } else if (r < 0.9) {
        add = randInt(2_500, 3_800);
        notes.push(`Надбавка **${formatDelta(add)}** — удачные рейсы, премия за скорость.`);
      } else {
        add = randInt(3_800, 5_200);
        notes.push(`Надбавка **${formatDelta(add)}** — «жирный» день.`);
      }
      extra = EXPEDITER_PAYOUT_FLOOR_RUB + add;
    } else if (jobId === "officeAnalyst") {
      const rank = tier3PromotionRank(u.jobMskDayStreak ?? 0);
      base = def.basePayoutRub + rank * 150 + Math.min(450, Math.floor((u.jobMskDayStreak ?? 0) / 5) * 30);
      if (chance(0.03)) {
        const fine = randInt(100, 280);
        extra -= fine;
        notes.push(`штраф ${formatDelta(-fine)}`);
      }
    } else if (jobId === "shadowFixer") {
      base = 0;
      const rank = tier3PromotionRank(u.jobMskDayStreak ?? 0);
      const streak = u.jobMskDayStreak ?? 0;
      const posBoost = 1 + rank * 0.025 + Math.min(0.15, streak * 0.002);
      const r = Math.random();
      if (r < 0.1) {
        extra = -Math.round(randInt(70, 280) * 3.45);
        notes.push(`срыв **${formatDelta(extra)}** — материалы, облавы, двойной крёст.`);
      } else if (r < 0.38) {
        extra = Math.floor(randInt(55, 155) * posBoost * 1.12 * 3.45);
        notes.push(`серая сделка **${formatDelta(extra)}**.`);
      } else if (r < 0.72) {
        extra = Math.floor(randInt(155, 400) * posBoost * 1.12 * 3.45);
        notes.push(`удачный поток **${formatDelta(extra)}**.`);
      } else if (r < 0.92) {
        extra = Math.floor(randInt(320, 780) * posBoost * 1.12 * 3.45);
        notes.push(`жирный лот **${formatDelta(extra)}**.`);
      } else {
        extra = Math.floor(randInt(580, 1280) * posBoost * 1.12 * 3.45);
        notes.push(`крупный куш **${formatDelta(extra)}**.`);
      }
    } else if (jobId === "courier") {
      // фикс в base
    }

    let jobTotal = base + extra;
    const variablePayout = jobUsesVariablePayout(jobId);
    if (!variablePayout) jobTotal = Math.max(0, jobTotal);

    if (isTier12JobId(jobId)) {
      const rankBeforeT12 = tier12RankFromShifts(expBefore, def.baseCooldownMs);
      const rankAfterT12 = tier12RankFromShifts(expAfter, def.baseCooldownMs);
      jobTotal += tier12RankFlatBonusRub(jobId, rankAfterT12);
      if (rankAfterT12 > rankBeforeT12) {
        notes.push(`Повышение: **${tier12RankTitle(jobId, rankAfterT12)}** (ранг **${rankAfterT12}**).`);
        appendFeedEvent({
          ts: now,
          guildId,
          type: "job:promotion",
          actorUserId: member.id,
          text: `${member.toString()}: **${def.title}** — **${tier12RankTitle(jobId, rankAfterT12)}** (ранг **${rankAfterT12}**).`,
        });
      }
    }

    let rublesNext = u.rubles;
    let simBalNext = u.simBalanceRub ?? 0;
    let phoneUntilNext = u.courierPhonePaidUntilMs;

    if (jobId === "courier") {
      const onlineDue = !u.courierPhonePaidUntilMs || now >= u.courierPhonePaidUntilMs;
      if (onlineDue) {
        simBalNext -= COURIER_SIM_MONTHLY_FEE_RUB;
        phoneUntilNext = now + COURIER_SIM_MONTHLY_PERIOD_MS;
        notes.push(`тариф 30 суток ${formatDelta(-COURIER_SIM_MONTHLY_FEE_RUB)} (баланс сим)`);
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

  if (modalId === ECON_MODAL_IP_AD || modalId === ECON_MODAL_IP_DEP || modalId === ECON_MODAL_IP_WD) {
    if (!interaction.inGuild() || !interaction.guildId || !interaction.member) {
      await interaction.reply({ content: "Эта форма работает только на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const mem = interaction.member as GuildMember;
    if (mem.user.bot) {
      await interaction.reply({ content: "Ботам экономика не положена.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const u = getEconomyUser(mem.guild.id, mem.id);
    if (u.jobId !== "soleProp") {
      await interaction.reply({ content: "Формы **ИП** доступны только на работе **ИП**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const rawIn = interaction.fields.getTextInputValue("amount").trim().replace(/\s/g, "").replace(",", ".");
    const amount = Math.floor(Number(rawIn));
    if (!Number.isFinite(amount) || amount < 1) {
      await interaction.reply({ content: "Введите целое число **от 1 ₽**.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const now = Date.now();
    if (modalId === ECON_MODAL_IP_AD) {
      if (u.solePropAdvertReadyAt && now < u.solePropAdvertReadyAt) {
        await interaction.reply({ content: "Реклама ещё на перезарядке.", flags: MessageFlags.Ephemeral });
        return true;
      }
      const maxAd = solePropAdMaxRub(u.jobMskDayStreak ?? 0);
      const biz = u.solePropCapitalRub ?? 0;
      const out = solePropAdvertOutcome(biz, amount, maxAd);
      if (!out.ok && out.delta === 0) {
        await interaction.reply({ content: out.detail, flags: MessageFlags.Ephemeral });
        return true;
      }
      const nextBiz = Math.max(0, biz + out.delta);
      patchEconomyUser(mem.guild.id, mem.id, {
        solePropCapitalRub: nextBiz,
        solePropAdvertReadyAt: now + SOLE_PROP_AD_CD_MS,
      });
      await interaction.reply({
        embeds: [buildCurrentJobEmbed(mem, { tier3ActionNotes: [out.detail] })],
        components: buildCurrentJobRows(mem),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    if (modalId === ECON_MODAL_IP_DEP) {
      if (u.rubles < amount) {
        await interaction.reply({ content: `На счёте только **${fmt(u.rubles)}** ₽.`, flags: MessageFlags.Ephemeral });
        return true;
      }
      patchEconomyUser(mem.guild.id, mem.id, {
        rubles: u.rubles - amount,
        solePropCapitalRub: (u.solePropCapitalRub ?? 0) + amount,
      });
      await interaction.reply({
        embeds: [buildCurrentJobEmbed(mem, { tier3ActionNotes: [`На баланс бизнеса переведено **${fmt(amount)}** ₽.`] })],
        components: buildCurrentJobRows(mem),
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
    const bizW = u.solePropCapitalRub ?? 0;
    if (amount > bizW) {
      await interaction.reply({ content: `В бизнесе только **${fmt(bizW)}** ₽.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    patchEconomyUser(mem.guild.id, mem.id, {
      rubles: u.rubles + amount,
      solePropCapitalRub: bizW - amount,
    });
    await interaction.reply({
      embeds: [buildCurrentJobEmbed(mem, { tier3ActionNotes: [`На основной счёт выведено **${fmt(amount)}** ₽.`] })],
      components: buildCurrentJobRows(mem),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  return false;
}


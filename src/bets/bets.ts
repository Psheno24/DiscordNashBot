import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChatInputCommandInteraction,
  type Client,
  type ModalSubmitInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { economyFeedChannelId } from "../config.js";
import { MSK_OFFSET_MS } from "../time/msk.js";
import { appendFeedEvent } from "../economy/feedStore.js";
import { ensureEconomyFeedPanel } from "../economy/panel.js";
import { addToTreasury, trySpendTreasuryRub } from "../economy/taxTreasury.js";
import { getEconomyUser, patchEconomyUser } from "../economy/userStore.js";
import {
  buildAdminEconEmbed,
  buildAdminEconRows,
  buildAdminHubEmbed,
  buildAdminHubRows,
  NEURO_ADMIN_BUTTON_GRANT_RUB,
  NEURO_ADMIN_BUTTON_TAKE_RUB,
  NEURO_ADMIN_ECON,
  NEURO_MAIN_ADMIN,
} from "../neurocontrol/adminHub.js";
import { giveMoneyCommandName, takeMoneyCommandName } from "../welcomePreview.js";
import { getBetEvent, listBetEvents, upsertBetEvent, type BetEvent, type PlacedBet } from "./store.js";

export const NEURO_ADMIN_BUTTON_MENU = "neuroAdmin:menu";
export const NEURO_ADMIN_BUTTON_CREATE_BET = "neuroAdmin:createBet";
export const NEURO_ADMIN_BUTTON_BETS = "neuroAdmin:bets";

/** Одна модалка: событие, 2 команды (имя + кэф), ничья (опц.), закрытие. */
const MODAL_CREATE_BET = "modal:bet:create";
const MODAL_EDIT_BET_PREFIX = "modal:bet:edit:";
const MODAL_GRANT_RUB = "modal:econ:grantRub";
const MODAL_TAKE_RUB = "modal:econ:takeRub";

const BET_BUTTON_OPEN_PREFIX = "bet:open:";
const BET_MENU_PICK_PREFIX = "bet:menuPick:";
const BET_MENU_BACK_PREFIX = "bet:menuBack:";
const BET_MENU_CLOSE = "bet:menuClose";
const BET_MENU_MORE_GO_PREFIX = "bet:moreGo:";
const BET_MENU_MORE_ABORT_PREFIX = "bet:moreAbort:";
const BET_BUTTON_CONFIRM_PREFIX = "bet:confirm:";
const BET_BUTTON_CONFIRM_CANCEL_PREFIX = "bet:confirmCancel:";

const MODAL_BET_AMOUNT_PREFIX = "modal:bet:amount:";

const BET_COLOR = 0xb71c1c;
const BET_RESOLVED_FEED_MESSAGE_DELETE_AFTER_MS = 24 * 60 * 60 * 1000;

const ADMIN_BET_MANAGE_PREFIX = "neuroAdmin:bet:";
const ADMIN_BET_CHOOSE_PREFIX = "neuroAdmin:betChoose:";
const ADMIN_BET_CONFIRM_PREFIX = "neuroAdmin:betConfirm:";
const ADMIN_BET_CANCEL_PREFIX = "neuroAdmin:betCancel:";
const ADMIN_BET_EDIT_PREFIX = "neuroAdmin:betEdit:";

function isAcceptingBets(ev: BetEvent, now = Date.now()): boolean {
  return ev.status === "open" && now <= ev.closesAt;
}

function canAdminResolveOrCancel(ev: BetEvent): boolean {
  return ev.status === "open" || (ev.status as any) === "closed";
}

async function replyOrUpdateEphemeral(
  interaction: ButtonInteraction,
  payload: { content?: string; embeds?: EmbedBuilder[]; components?: ActionRowBuilder<ButtonBuilder>[] },
) {
  const isEphemeralMessage = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
  if (interaction.message && isEphemeralMessage) {
    await interaction.update(payload);
    return;
  }
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

function canAdmin(interaction: ButtonInteraction | ModalSubmitInteraction): boolean {
  return (
    interaction.inGuild() &&
    (interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator))
  );
}

async function isGuildOwner(
  interaction: ButtonInteraction | ModalSubmitInteraction | ChatInputCommandInteraction,
): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guildId) return false;
  const g = interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null));
  return Boolean(g && g.ownerId === interaction.user.id);
}

async function grantRublesFromTreasury(
  client: Client,
  guildId: string,
  actorUserId: string,
  actorDisplay: string,
  targetUserId: string,
  amount: number,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const spend = trySpendTreasuryRub(guildId, amount);
  if (!spend.ok) {
    const bal = spend.balance.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
    return { ok: false, message: `В казне недостаточно средств. Сейчас: **${bal}** ₽.` };
  }
  const u = getEconomyUser(guildId, targetUserId);
  patchEconomyUser(guildId, targetUserId, { rubles: u.rubles + amount });
  appendFeedEvent({
    ts: Date.now(),
    guildId,
    type: "admin:budget",
    actorUserId,
    text: `${actorDisplay} выдал <@${targetUserId}> **${amount.toLocaleString("ru-RU")} ₽** из казны.`,
  });
  await ensureEconomyFeedPanel(client);
  return { ok: true };
}

async function takeRublesFromUser(
  client: Client,
  guildId: string,
  actorUserId: string,
  actorDisplay: string,
  targetUserId: string,
  amount: number,
  creditTreasury: boolean,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const u = getEconomyUser(guildId, targetUserId);
  const wallet = Math.floor(Number.isFinite(u.rubles) ? u.rubles : 0);
  if (wallet < amount) {
    return {
      ok: false,
      message: `У пользователя недостаточно ₽. Сейчас на счёте: **${wallet.toLocaleString("ru-RU")}** ₽.`,
    };
  }
  patchEconomyUser(guildId, targetUserId, { rubles: u.rubles - amount });
  if (creditTreasury) {
    addToTreasury(guildId, amount);
  }
  appendFeedEvent({
    ts: Date.now(),
    guildId,
    type: "admin:budget",
    actorUserId,
    text: creditTreasury
      ? `${actorDisplay} забрал у <@${targetUserId}> **${amount.toLocaleString("ru-RU")} ₽** в казну.`
      : `${actorDisplay} изъял у <@${targetUserId}> **${amount.toLocaleString("ru-RU")} ₽** (без зачисления в казну).`,
  });
  await ensureEconomyFeedPanel(client);
  return { ok: true };
}

/** `/givemoney` и `/takemoney` — только владелец сервера. */
export async function handleMoneyOwnerSlashCommand(interaction: ChatInputCommandInteraction): Promise<boolean> {
  const name = interaction.commandName;
  if (name !== giveMoneyCommandName && name !== takeMoneyCommandName) return false;

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Команда только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!(await isGuildOwner(interaction))) {
    await interaction.reply({
      content: "Эту команду может использовать только **владелец сервера**.",
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const target = interaction.options.getUser("member", true);
  const amount = interaction.options.getInteger("amount", true);
  const guildId = interaction.guildId;
  const actorDisplay = interaction.user.toString();

  if (name === giveMoneyCommandName) {
    const r = await grantRublesFromTreasury(
      interaction.client,
      guildId,
      interaction.user.id,
      actorDisplay,
      target.id,
      amount,
    );
    if (!r.ok) {
      await interaction.reply({ content: r.message, flags: MessageFlags.Ephemeral });
      return true;
    }
    await interaction.reply({
      content: `Выдано **${amount.toLocaleString("ru-RU")}** ₽ пользователю ${target} (из казны).`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  const creditTreasury = interaction.options.getBoolean("to_treasury") ?? true;
  const r = await takeRublesFromUser(
    interaction.client,
    guildId,
    interaction.user.id,
    actorDisplay,
    target.id,
    amount,
    creditTreasury,
  );
  if (!r.ok) {
    await interaction.reply({ content: r.message, flags: MessageFlags.Ephemeral });
    return true;
  }
  await interaction.reply({
    content: creditTreasury
      ? `Снято **${amount.toLocaleString("ru-RU")}** ₽ с ${target} и зачислено в казну.`
      : `Снято **${amount.toLocaleString("ru-RU")}** ₽ с ${target} (в казну не зачислено).`,
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

export async function handleNeuroAdminButton(interaction: ButtonInteraction): Promise<boolean> {
  const id = interaction.customId;
  if (
    ![
      NEURO_ADMIN_BUTTON_MENU,
      NEURO_MAIN_ADMIN,
      NEURO_ADMIN_ECON,
      NEURO_ADMIN_BUTTON_CREATE_BET,
      NEURO_ADMIN_BUTTON_GRANT_RUB,
      NEURO_ADMIN_BUTTON_TAKE_RUB,
      NEURO_ADMIN_BUTTON_BETS,
    ].includes(id) &&
    !id.startsWith(ADMIN_BET_MANAGE_PREFIX) &&
    !id.startsWith(ADMIN_BET_CHOOSE_PREFIX) &&
    !id.startsWith(ADMIN_BET_CONFIRM_PREFIX) &&
    !id.startsWith(ADMIN_BET_CANCEL_PREFIX) &&
    !id.startsWith(ADMIN_BET_EDIT_PREFIX)
  ) {
    return false;
  }

  if (!interaction.inGuild() || !interaction.guildId) {
    await replyOrUpdateEphemeral(interaction, { content: "Админ-меню доступно только на сервере." });
    return true;
  }
  if (!canAdmin(interaction)) {
    await replyOrUpdateEphemeral(interaction, { content: "Недостаточно прав (нужно Manage Server)." });
    return true;
  }

  if (id === NEURO_ADMIN_BUTTON_MENU || id === NEURO_MAIN_ADMIN) {
    await replyOrUpdateEphemeral(interaction, { embeds: [buildAdminHubEmbed()], components: buildAdminHubRows() });
    return true;
  }

  if (id === NEURO_ADMIN_ECON) {
    const owner = await isGuildOwner(interaction);
    await replyOrUpdateEphemeral(interaction, {
      embeds: [buildAdminEconEmbed()],
      components: buildAdminEconRows(owner),
    });
    return true;
  }

  if (id === NEURO_ADMIN_BUTTON_BETS) {
    const guildId = interaction.guildId;
    const events = listBetEvents(guildId)
      .filter((e) => canAdminResolveOrCancel(e))
      .sort((a, b) => b.createdAt - a.createdAt);
    const embed = new EmbedBuilder()
      .setColor(0x0d47a1)
      .setTitle("Ставки: управление")
      .setDescription(events.length ? "Выберите ставку ниже." : "Открытых ставок нет.");

    const rows: ActionRowBuilder<ButtonBuilder>[] = [];
    if (events.length) {
      const row = new ActionRowBuilder<ButtonBuilder>();
      for (const ev of events.slice(0, 5)) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`${ADMIN_BET_MANAGE_PREFIX}${ev.id}`)
            .setLabel(ev.title.slice(0, 80))
            .setStyle(ButtonStyle.Secondary),
        );
      }
      rows.push(row);
    }
    rows.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(NEURO_MAIN_ADMIN).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      ),
    );

    await replyOrUpdateEphemeral(interaction, { embeds: [embed], components: rows });
    return true;
  }

  if (id === NEURO_ADMIN_BUTTON_CREATE_BET) {
    const modal = new ModalBuilder().setCustomId(MODAL_CREATE_BET).setTitle("Создать ставку");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("title").setLabel("Название события").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("team1_line")
          .setLabel("Команда 1 и коэфф (через пробел)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setPlaceholder("Зенит 1,9"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("team2_line")
          .setLabel("Команда 2 и коэфф (через пробел)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(100)
          .setPlaceholder("Спартак 2,15"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("draw_odds")
          .setLabel("Ничья — коэфф. (пусто = без ничьей)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setMaxLength(12)
          .setPlaceholder("3,2 или пусто"),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("closeAt")
          .setLabel("Закрытие приёма (UTC+3)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("09.05 18:30 или 09-05-2026 18:30"),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (id === NEURO_ADMIN_BUTTON_GRANT_RUB) {
    if (!(await isGuildOwner(interaction))) {
      await replyOrUpdateEphemeral(interaction, {
        content: "Выдать и забрать ₽ может только **владелец сервера**.",
      });
      return true;
    }
    const modal = new ModalBuilder().setCustomId(MODAL_GRANT_RUB).setTitle("Выдать ₽");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("user")
          .setLabel("Пользователь (mention или ID)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("amount").setLabel("Сумма ₽").setStyle(TextInputStyle.Short).setRequired(true),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (id === NEURO_ADMIN_BUTTON_TAKE_RUB) {
    if (!(await isGuildOwner(interaction))) {
      await replyOrUpdateEphemeral(interaction, {
        content: "Выдать и забрать ₽ может только **владелец сервера**.",
      });
      return true;
    }
    const modal = new ModalBuilder().setCustomId(MODAL_TAKE_RUB).setTitle("Забрать ₽");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("user")
          .setLabel("Пользователь (mention или ID)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("amount").setLabel("Сумма ₽").setStyle(TextInputStyle.Short).setRequired(true),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  return false;
}

function normalizeOddsToken(raw: string): string {
  return raw.trim().replace(/^x\s*/i, "").trim();
}

function parseOddsField(raw: string): number | undefined {
  const compact = normalizeOddsToken(raw).replace(/\s/g, "").replace(/,/g, ".");
  const odds = Number.parseFloat(compact);
  if (!Number.isFinite(odds) || odds < 1.01 || odds > 100) return undefined;
  return odds;
}

/** Сумма ставки в ₽: целое > 0; пробелы; запятая или точка как десятичный разделитель (копейки отбрасываются); группы тысяч точками (`1.234`). */
function parseBetAmountRubles(raw: string): number | undefined {
  let s = raw.trim().replace(/\u00a0/g, " ").replace(/\s/g, "");
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  s = s.replace(/,/g, ".");
  const n = Math.floor(Number.parseFloat(s));
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n;
}

/** Последний токен — коэффициент (можно с префиксом x), остальное — название; пробелы/табы нормализуются. */
function parseTeamOddsLine(raw: string): { label: string; odds: number } | undefined {
  const t = raw.trim().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  if (!t) return undefined;
  const parts = t.split(" ");
  if (parts.length < 2) return undefined;
  const oddsPart = parts[parts.length - 1]!;
  const label = parts.slice(0, -1).join(" ").trim();
  const odds = parseOddsField(oddsPart);
  if (!label || odds == null) return undefined;
  return { label, odds };
}

function betOption(id: string, label: string, odds: number): { id: string; label: string; odds: number } {
  return { id, label: label.slice(0, 80), odds };
}

function getUserStakes(ev: BetEvent, userId: string): PlacedBet[] {
  return ev.bets[userId] ?? [];
}

async function deleteBetFeedMessage(client: Client, ev: BetEvent): Promise<void> {
  if (!ev.channelId || !ev.messageId) return;
  const ch = await client.channels.fetch(ev.channelId).catch(() => null);
  if (!ch?.isTextBased() || ch.isDMBased()) return;
  const msg = await ch.messages.fetch(ev.messageId).catch(() => null);
  if (msg) await msg.delete().catch(() => null);
  ev.messageId = undefined;
  ev.resolvedDeleteFeedMessageAtMs = undefined;
}

/** DD-MM HH:MM по UTC+3 для подстановки в модалку редактирования. */
function formatCloseAtMskForModal(closesAt: number): string {
  const d = new Date(closesAt + MSK_OFFSET_MS);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${dd}-${mo} ${hh}:${mm}`;
}

function collectUsedOptionIds(ev: BetEvent): Set<string> {
  const s = new Set<string>();
  for (const stakes of Object.values(ev.bets)) {
    for (const b of stakes) s.add(b.optionId);
  }
  return s;
}

function truncateInput(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : t.slice(0, max);
}

function showEditBetModal(interaction: ButtonInteraction, ev: BetEvent): Promise<void> {
  const byId = Object.fromEntries(ev.options.map((o) => [o.id, o]));
  const a = byId["A"];
  const b = byId["B"];
  const d = byId["D"];
  const team1 = a ? `${a.label} ${a.odds.toLocaleString("ru-RU")}` : "";
  const team2 = b ? `${b.label} ${b.odds.toLocaleString("ru-RU")}` : "";
  const drawOddsStr = d ? d.odds.toLocaleString("ru-RU") : "";
  const closeStr = formatCloseAtMskForModal(ev.closesAt);

  const modal = new ModalBuilder().setCustomId(`${MODAL_EDIT_BET_PREFIX}${ev.id}`).setTitle("Редактировать линию");
  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("title")
        .setLabel("Название события")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setValue(truncateInput(ev.title, 100)),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("team1_line")
        .setLabel("Команда 1 и коэфф (через пробел)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setValue(truncateInput(team1, 100)),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("team2_line")
        .setLabel("Команда 2 и коэфф (через пробел)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(100)
        .setValue(truncateInput(team2, 100)),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("draw_odds")
        .setLabel("Ничья — коэфф. (пусто = без ничьей)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setMaxLength(12)
        .setValue(truncateInput(drawOddsStr, 12)),
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId("closeAt")
        .setLabel("Закрытие приёма (UTC+3)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(30)
        .setValue(truncateInput(closeStr, 30)),
    ),
  );
  return interaction.showModal(modal);
}

function formatUserStakesUnderRules(ev: BetEvent, stakes: PlacedBet[]): string {
  if (!stakes.length) return "";
  const lines = stakes.map((bet) => {
    const label = ev.options.find((o) => o.id === bet.optionId)?.label ?? bet.optionId;
    const oddStr = bet.oddsAtPlacement.toLocaleString("ru-RU");
    const pot = Math.floor(bet.amount * bet.oddsAtPlacement);
    return `• **${label}** · **${bet.amount.toLocaleString("ru-RU")} ₽** · кэф при приёме **x${oddStr}** (до **${pot.toLocaleString("ru-RU")} ₽**)`;
  });
  return ["", "**Ваши ставки** (коэффициент зафиксирован при приёме):", ...lines, ""].join("\n");
}

function buildBetRepeatWarningEmbed(ev: BetEvent, userId: string, pickedLabel: string): EmbedBuilder {
  const stakes = getUserStakes(ev, userId);
  const prev = stakes.map((bet) => {
    const label = ev.options.find((o) => o.id === bet.optionId)?.label ?? bet.optionId;
    return `• **${label}** · **${bet.amount.toLocaleString("ru-RU")} ₽** · x${bet.oddsAtPlacement.toLocaleString("ru-RU")}`;
  });
  return new EmbedBuilder()
    .setColor(BET_COLOR)
    .setTitle("Добавить ещё ставку?")
    .setDescription(
      [
        `По событию **${ev.title}** у вас уже есть ставки.`,
        "",
        "**Уже принято:**",
        ...prev,
        "",
        `Вы выбрали исход: **${pickedLabel}**.`,
        "",
        "**Поставить ещё** — ввести сумму. **Отменить** — вернуться к окну события.",
      ].join("\n"),
    );
}

/**
 * Закрытие приёма по UTC+3.
 * Форматы: `DD-MM HH:MM`, `DD.MM HH:MM`, `DD/MM HH:MM`, опционально с годом `DD-MM-YYYY HH:MM`.
 * День и месяц могут быть без ведущего нуля. Год без указания — ближайшее будущее время в этом или следующем календарном году.
 */
function parseCloseAt(raw: string, now = Date.now()): number | undefined {
  const t = raw.trim().replace(/\u00a0/g, " ").replace(/\s+/g, " ");
  if (!t) return undefined;

  const nowMsk = new Date(now + MSK_OFFSET_MS);
  const defaultYear = nowMsk.getUTCFullYear();

  const withYear = t.match(/^(\d{1,2})[-./](\d{1,2})[-./](\d{4})\s+(\d{1,2}):(\d{2})$/);
  const noYear = t.match(/^(\d{1,2})[-./](\d{1,2})\s+(\d{1,2}):(\d{2})$/);

  let dd: number;
  let mo: number;
  let hh: number;
  let mm: number;
  let explicitYear: number | undefined;

  if (withYear) {
    dd = Number(withYear[1]);
    mo = Number(withYear[2]);
    explicitYear = Number(withYear[3]);
    hh = Number(withYear[4]);
    mm = Number(withYear[5]);
  } else if (noYear) {
    dd = Number(noYear[1]);
    mo = Number(noYear[2]);
    explicitYear = undefined;
    hh = Number(noYear[3]);
    mm = Number(noYear[4]);
  } else {
    return undefined;
  }

  if (![dd, mo, hh, mm].every(Number.isFinite)) return undefined;
  if (explicitYear != null && !Number.isFinite(explicitYear)) return undefined;
  if (mo < 1 || mo > 12 || dd < 1 || dd > 31 || hh < 0 || hh > 23 || mm < 0 || mm > 59) return undefined;

  const makeTs = (y: number) => {
    const asUtc = Date.UTC(y, mo - 1, dd, hh, mm, 0, 0);
    return asUtc - MSK_OFFSET_MS;
  };

  const calendarOk = (y: number, ts: number) => {
    if (!Number.isFinite(ts)) return false;
    const chk = new Date(ts + MSK_OFFSET_MS);
    return chk.getUTCFullYear() === y && chk.getUTCMonth() === mo - 1 && chk.getUTCDate() === dd;
  };

  if (explicitYear != null) {
    const ts = makeTs(explicitYear);
    if (!calendarOk(explicitYear, ts)) return undefined;
    if (ts > now) return ts;
    return undefined;
  }

  for (const y of [defaultYear, defaultYear + 1]) {
    const ts = makeTs(y);
    if (!calendarOk(y, ts)) continue;
    if (ts > now) return ts;
  }
  return undefined;
}

function parseUserId(raw: string): string | undefined {
  const m = raw.trim().match(/^<@!?(\d+)>$/);
  if (m) return m[1];
  if (/^\d{5,25}$/.test(raw.trim())) return raw.trim();
  return undefined;
}

function betStatusDescriptionLine(ev: BetEvent): string {
  const closes = Math.floor(ev.closesAt / 1000);
  const accepting = isAcceptingBets(ev);
  if (accepting) {
    return `Приём ставок до <t:${closes}:R> (до <t:${closes}:t>).`;
  }
  if (ev.status === "open" || (ev.status as any) === "closed") {
    return `Приём ставок **закрыт**. Окончание приёма: <t:${closes}:F>.`;
  }
  if (ev.status === "resolved") {
    return `Результат: **${ev.options.find((o) => o.id === ev.winningOptionId)?.label ?? "—"}**.`;
  }
  return "Событие отменено.";
}

function buildBetEmbed(ev: BetEvent): EmbedBuilder {
  const statusLine = betStatusDescriptionLine(ev);

  const opts = ev.options.map((o) => `• **${o.label}** — x${o.odds.toLocaleString("ru-RU")}`).join("\n");
  return new EmbedBuilder()
    .setColor(BET_COLOR)
    .setTitle(`Ставка: ${ev.title}`)
    .setDescription([statusLine, "", "Коэффициенты:", opts].join("\n"));
}

function buildBetRows(ev: BetEvent): ActionRowBuilder<ButtonBuilder>[] {
  const accepting = isAcceptingBets(ev);
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BET_BUTTON_OPEN_PREFIX}${ev.id}`)
        .setLabel("Сделать ставку")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!accepting),
    ),
  ];
}

function buildBetMenuEmbed(ev: BetEvent, balanceRub: number, userId: string): EmbedBuilder {
  const statusLine = betStatusDescriptionLine(ev);
  const opts = ev.options.map((o) => `• **${o.label}** — x${o.odds.toLocaleString("ru-RU")}`).join("\n");
  const stakesBlock = formatUserStakesUnderRules(ev, getUserStakes(ev, userId));
  return new EmbedBuilder()
    .setColor(BET_COLOR)
    .setTitle(`Ставка: ${ev.title}`)
    .setDescription(
      [
        statusLine,
        "",
        `Ваш баланс: **${balanceRub.toLocaleString("ru-RU")} ₽**`,
        "",
        "Правила:",
        "- можно сделать **несколько** ставок на это событие;",
        "- принятую ставку **нельзя отменить** или изменить;",
        "- коэффициент по уже принятой ставке **не меняется**, даже если линию обновят.",
        stakesBlock,
        "**Актуальные коэффициенты:**",
        opts,
        "",
        "Выберите исход ниже.",
      ].join("\n"),
    );
}

function buildBetMenuRows(ev: BetEvent): ActionRowBuilder<ButtonBuilder>[] {
  const accepting = isAcceptingBets(ev);
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const opt of ev.options.slice(0, 3)) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${BET_MENU_PICK_PREFIX}${ev.id}:${opt.id}`)
        .setLabel(opt.label)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(!accepting),
    );
  }
  return [
    row,
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(BET_MENU_CLOSE).setLabel("Закрыть").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export async function handleBetButton(interaction: ButtonInteraction): Promise<boolean> {
  const id = interaction.customId;
  if (
    !id.startsWith(BET_BUTTON_OPEN_PREFIX) &&
    !id.startsWith(BET_MENU_PICK_PREFIX) &&
    !id.startsWith(BET_MENU_BACK_PREFIX) &&
    id !== BET_MENU_CLOSE &&
    !id.startsWith(BET_MENU_MORE_GO_PREFIX) &&
    !id.startsWith(BET_MENU_MORE_ABORT_PREFIX) &&
    !id.startsWith(BET_BUTTON_CONFIRM_PREFIX) &&
    !id.startsWith(BET_BUTTON_CONFIRM_CANCEL_PREFIX)
  ) {
    return false;
  }

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Ставки доступны только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const guildId = interaction.guildId;

  if (id.startsWith(BET_BUTTON_OPEN_PREFIX)) {
    const eventId = id.slice(BET_BUTTON_OPEN_PREFIX.length);
    const ev = getBetEvent(guildId, eventId);
    if (!ev) {
      await interaction.reply({ content: "Событие не найдено.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!isAcceptingBets(ev)) {
      await interaction.reply({ content: "Приём ставок закрыт.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const userId = interaction.user.id;
    const u = getEconomyUser(guildId, userId);
    const embed = buildBetMenuEmbed(ev, u.rubles, userId);
    const rows = buildBetMenuRows(ev);
    await interaction.reply({ embeds: [embed], components: rows, flags: MessageFlags.Ephemeral });
    return true;
  }

  if (id === BET_MENU_CLOSE || id.startsWith(BET_MENU_BACK_PREFIX)) {
    // Закрываем личное окно ставок
    const isEphemeralMessage = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
    if (interaction.message && isEphemeralMessage) {
      await interaction.update({ content: "Окно ставок закрыто.", embeds: [], components: [] });
    } else {
      await interaction.reply({ content: "Окно ставок закрыто.", flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  if (id.startsWith(BET_MENU_PICK_PREFIX)) {
    const rest = id.slice(BET_MENU_PICK_PREFIX.length);
    const [eventId, optionId] = rest.split(":");
    if (!eventId || !optionId) return false;
    const ev = getBetEvent(guildId, eventId);
    if (!ev) {
      await interaction.reply({ content: "Событие не найдено.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!isAcceptingBets(ev)) {
      await interaction.reply({ content: "Приём ставок закрыт.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const userId = interaction.user.id;
    const opt = ev.options.find((o) => o.id === optionId);
    if (!opt) {
      await interaction.reply({ content: "Исход не найден.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const stakes = getUserStakes(ev, userId);
    if (stakes.length > 0) {
      const warn = buildBetRepeatWarningEmbed(ev, userId, opt.label);
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${BET_MENU_MORE_GO_PREFIX}${eventId}:${optionId}`)
          .setLabel("Поставить ещё")
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`${BET_MENU_MORE_ABORT_PREFIX}${eventId}`)
          .setLabel("Отменить")
          .setStyle(ButtonStyle.Secondary),
      );
      const isEphemeralMessage = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
      const payload = { embeds: [warn], components: [row], content: undefined as string | undefined };
      if (interaction.message && isEphemeralMessage) await interaction.update(payload);
      else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      return true;
    }

    const u = getEconomyUser(guildId, userId);
    const modal = new ModalBuilder().setCustomId(`${MODAL_BET_AMOUNT_PREFIX}${eventId}:${optionId}`).setTitle("Сумма ставки");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel(`Сколько ₽ поставить? Баланс: ${u.rubles.toLocaleString("ru-RU")} ₽`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("1000 или 1 000 или 500,50"),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (id.startsWith(BET_MENU_MORE_ABORT_PREFIX)) {
    const eventId = id.slice(BET_MENU_MORE_ABORT_PREFIX.length);
    const ev = getBetEvent(guildId, eventId);
    if (!ev) {
      await interaction.reply({ content: "Событие не найдено.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const userId = interaction.user.id;
    const u = getEconomyUser(guildId, userId);
    await interaction.update({
      embeds: [buildBetMenuEmbed(ev, u.rubles, userId)],
      components: buildBetMenuRows(ev),
      content: undefined,
    });
    return true;
  }

  if (id.startsWith(BET_MENU_MORE_GO_PREFIX)) {
    const rest = id.slice(BET_MENU_MORE_GO_PREFIX.length);
    const lastColon = rest.lastIndexOf(":");
    if (lastColon <= 0) return false;
    const eventId = rest.slice(0, lastColon);
    const optionId = rest.slice(lastColon + 1);
    const ev = getBetEvent(guildId, eventId);
    if (!ev || !isAcceptingBets(ev)) {
      await interaction.reply({ content: "Приём ставок закрыт или событие не найдено.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const opt = ev.options.find((o) => o.id === optionId);
    if (!opt) {
      await interaction.reply({ content: "Исход не найден.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const userId = interaction.user.id;
    const u = getEconomyUser(guildId, userId);
    const modal = new ModalBuilder().setCustomId(`${MODAL_BET_AMOUNT_PREFIX}${eventId}:${optionId}`).setTitle("Сумма ставки");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel(`Сколько ₽ поставить? Баланс: ${u.rubles.toLocaleString("ru-RU")} ₽`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder("1000 или 1 000 или 500,50"),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (id.startsWith(BET_BUTTON_CONFIRM_CANCEL_PREFIX)) {
    const eventId = id.slice(BET_BUTTON_CONFIRM_CANCEL_PREFIX.length);
    const ev = getBetEvent(guildId, eventId);
    if (!ev) {
      await interaction.reply({ content: "Событие не найдено.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const userId = interaction.user.id;
    const u = getEconomyUser(guildId, userId);
    const embed = buildBetMenuEmbed(ev, u.rubles, userId);
    const rows = buildBetMenuRows(ev);
    const isEphemeralMessage = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
    const payload = { content: undefined as string | undefined, embeds: [embed], components: rows };
    if (interaction.message && isEphemeralMessage) await interaction.update(payload);
    else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
    return true;
  }

  if (id.startsWith(BET_BUTTON_CONFIRM_PREFIX)) {
    const rest = id.slice(BET_BUTTON_CONFIRM_PREFIX.length);
    const [eventId, optionId, amountRaw] = rest.split(":");
    const amount = Number.parseInt(amountRaw ?? "", 10);
    if (!eventId || !optionId || !Number.isFinite(amount) || amount <= 0) {
      await interaction.reply({ content: "Некорректное подтверждение ставки.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const ev = getBetEvent(guildId, eventId);
    if (!ev) {
      await interaction.reply({ content: "Событие не найдено.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!isAcceptingBets(ev)) {
      await interaction.reply({ content: "Приём ставок закрыт.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const opt = ev.options.find((o) => o.id === optionId);
    if (!opt) {
      await interaction.reply({ content: "Исход не найден.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const userId = interaction.user.id;
    const u = getEconomyUser(guildId, userId);
    if (u.rubles < amount) {
      await interaction.reply({ content: `Недостаточно ₽. Баланс: ${u.rubles.toLocaleString("ru-RU")} ₽.`, flags: MessageFlags.Ephemeral });
      return true;
    }

    patchEconomyUser(guildId, userId, { rubles: u.rubles - amount });
    const prev = getUserStakes(ev, userId);
    ev.bets[userId] = [...prev, { optionId, amount, ts: Date.now(), oddsAtPlacement: opt.odds }];
    upsertBetEvent(ev);

    appendFeedEvent({
      ts: Date.now(),
      guildId,
      type: "bet:placed",
      actorUserId: userId,
      text: `${interaction.user.toString()} поставил **${amount.toLocaleString("ru-RU")} ₽** на «${opt.label}» (ставка: ${ev.title}).`,
    });
    await ensureEconomyFeedPanel(interaction.client);

    if (ev.channelId && ev.messageId) {
      const ch = await interaction.client.channels.fetch(ev.channelId).catch(() => null);
      if (ch?.isTextBased() && !ch.isDMBased()) {
        const msg = await ch.messages.fetch(ev.messageId).catch(() => null);
        if (msg) {
          await msg.edit({ embeds: [buildBetEmbed(ev)], components: buildBetRows(ev) }).catch(() => null);
        }
      }
    }

    const isEphemeralMessage = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
    const oddSnap = opt.odds;
    const potential = Math.floor(amount * oddSnap);
    const doneEmbed = new EmbedBuilder()
      .setColor(BET_COLOR)
      .setTitle("Ставка принята")
      .setDescription(
        [
          `Ставка: **${ev.title}**`,
          `Исход: **${opt.label}**`,
          `Коэффициент (зафиксирован): **x${oddSnap.toLocaleString("ru-RU")}**`,
          "",
          `Сумма: **${amount.toLocaleString("ru-RU")} ₽**`,
          `Можно выиграть: **${potential.toLocaleString("ru-RU")} ₽**`,
          "",
          `Приём ставок до <t:${Math.floor(ev.closesAt / 1000)}:R>.`,
        ].join("\n"),
      );
    const closeRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(BET_MENU_CLOSE).setLabel("Закрыть").setStyle(ButtonStyle.Secondary),
    );
    if (interaction.message && isEphemeralMessage) {
      await interaction.update({ embeds: [doneEmbed], components: [closeRow], content: undefined });
    } else {
      await interaction.reply({ embeds: [doneEmbed], components: [closeRow], flags: MessageFlags.Ephemeral });
    }
    return true;
  }

  return false;
}

export async function handleBetModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  const id = interaction.customId;

  if (id === MODAL_CREATE_BET) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Нужно запускать на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!canAdmin(interaction)) {
      await interaction.reply({ content: "Недостаточно прав.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const guildId = interaction.guildId;
    const title = interaction.fields.getTextInputValue("title").trim();
    const t1 = parseTeamOddsLine(interaction.fields.getTextInputValue("team1_line"));
    const t2 = parseTeamOddsLine(interaction.fields.getTextInputValue("team2_line"));
    const drawRaw = interaction.fields.getTextInputValue("draw_odds").trim();
    const drawOdds = drawRaw ? parseOddsField(drawRaw) : undefined;
    const closeAtRaw = interaction.fields.getTextInputValue("closeAt").trim();
    const closesAt = parseCloseAt(closeAtRaw, Date.now());

    if (!title || !t1 || !t2 || !closesAt || (drawRaw && drawOdds == null)) {
      const lines = ["Проверьте поля:"];
      if (!title) lines.push("• **Название события** не должно быть пустым.");
      if (!t1)
        lines.push(
          "• **Команда 1:** после названия через пробел коэффициент **1,01–100** (например `Зенит 1,9` или `Команда А x2`).",
        );
      if (!t2) lines.push("• **Команда 2:** то же правило, что для первой команды.");
      if (!closesAt)
        lines.push(
          "• **Закрытие приёма** по **UTC+3**: **день-месяц время**, например `09-05 18:30`, `09.05 18:30` или с годом `09-05-2026 18:30`. Время должно быть **в будущем**.",
        );
      if (drawRaw && drawOdds == null) lines.push("• **Ничья:** укажите один коэффициент (например `3,2`) или оставьте поле пустым.");
      await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
      return true;
    }

    const optA = betOption("A", t1.label, t1.odds);
    const optB = betOption("B", t2.label, t2.odds);
    const options: BetEvent["options"] =
      drawOdds != null ? [optA, betOption("D", "Ничья", drawOdds), optB] : [optA, optB];

    const chId = economyFeedChannelId(guildId);
    if (!chId) {
      await interaction.reply({
        content: "Канал ленты экономики не настроен. Задайте его в «Нейроком контроль → Настройки».",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const feed = await interaction.client.channels.fetch(chId).catch(() => null);
    if (!feed?.isTextBased() || feed.isDMBased() || !feed.isSendable()) {
      await interaction.reply({ content: "Канал ленты недоступен или нет прав писать.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const eventId = randomUUID().slice(0, 8);
    const ev: BetEvent = {
      id: eventId,
      guildId,
      title,
      options,
      createdByUserId: interaction.user.id,
      createdAt: Date.now(),
      closesAt,
      status: "open",
      bets: {},
    };

    try {
      const sent = await feed.send({
        embeds: [buildBetEmbed(ev)],
        components: buildBetRows(ev),
      });
      ev.channelId = sent.channelId;
      ev.messageId = sent.id;
      upsertBetEvent(ev);

      appendFeedEvent({ ts: Date.now(), guildId, type: "bet:created", actorUserId: interaction.user.id, text: `Создана ставка: **${title}**.` });
      await ensureEconomyFeedPanel(interaction.client);

      await interaction.reply({ content: "Ставка создана и опубликована в ленте.", flags: MessageFlags.Ephemeral });
    } catch (e) {
      await interaction.reply({
        content: "Не удалось отправить сообщение в канал ленты (права бота или лимиты Discord). Ставка **не** сохранена.",
        flags: MessageFlags.Ephemeral,
      });
    }
    return true;
  }

  if (id.startsWith(MODAL_EDIT_BET_PREFIX)) {
    const eventId = id.slice(MODAL_EDIT_BET_PREFIX.length);
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Нужно запускать на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!canAdmin(interaction)) {
      await interaction.reply({ content: "Недостаточно прав.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const guildId = interaction.guildId;
    const ev = eventId ? getBetEvent(guildId, eventId) : undefined;
    if (!ev || !canAdminResolveOrCancel(ev)) {
      await interaction.reply({ content: "Ставка не найдена или уже закрыта.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const title = interaction.fields.getTextInputValue("title").trim();
    const t1 = parseTeamOddsLine(interaction.fields.getTextInputValue("team1_line"));
    const t2 = parseTeamOddsLine(interaction.fields.getTextInputValue("team2_line"));
    const drawRaw = interaction.fields.getTextInputValue("draw_odds").trim();
    const drawOdds = drawRaw ? parseOddsField(drawRaw) : undefined;
    const closeAtRaw = interaction.fields.getTextInputValue("closeAt").trim();
    const closesAt = parseCloseAt(closeAtRaw, Date.now());

    if (!title || !t1 || !t2 || !closesAt || (drawRaw && drawOdds == null)) {
      const lines = ["Проверьте поля:"];
      if (!title) lines.push("• **Название события** не должно быть пустым.");
      if (!t1)
        lines.push(
          "• **Команда 1:** после названия через пробел коэффициент **1,01–100** (например `Зенит 1,9` или `Команда А x2`).",
        );
      if (!t2) lines.push("• **Команда 2:** то же правило, что для первой команды.");
      if (!closesAt)
        lines.push(
          "• **Закрытие приёма** по **UTC+3**: **день-месяц время**, например `09-05 18:30`, `09.05 18:30` или с годом `09-05-2026 18:30`. Время должно быть **в будущем**.",
        );
      if (drawRaw && drawOdds == null) lines.push("• **Ничья:** укажите один коэффициент (например `3,2`) или оставьте поле пустым.");
      await interaction.reply({ content: lines.join("\n"), flags: MessageFlags.Ephemeral });
      return true;
    }

    const optA = betOption("A", t1.label, t1.odds);
    const optB = betOption("B", t2.label, t2.odds);
    const options: BetEvent["options"] =
      drawOdds != null ? [optA, betOption("D", "Ничья", drawOdds), optB] : [optA, optB];

    const used = collectUsedOptionIds(ev);
    for (const oid of used) {
      if (!options.some((o) => o.id === oid)) {
        const oldLabel = ev.options.find((o) => o.id === oid)?.label ?? oid;
        await interaction.reply({
          content: `Нельзя убрать исход «${oldLabel}»: на него уже есть ставки. Оставьте линию с этим исходом (например ничья с коэффициентом).`,
          flags: MessageFlags.Ephemeral,
        });
        return true;
      }
    }

    ev.title = title;
    ev.options = options;
    ev.closesAt = closesAt;
    upsertBetEvent(ev);

    appendFeedEvent({
      ts: Date.now(),
      guildId,
      type: "bet:updated",
      actorUserId: interaction.user.id,
      text: `Обновлена линия ставки: **${title}**.`,
    });
    await ensureEconomyFeedPanel(interaction.client);

    if (ev.channelId && ev.messageId) {
      const ch = await interaction.client.channels.fetch(ev.channelId).catch(() => null);
      if (ch?.isTextBased() && !ch.isDMBased()) {
        const msg = await ch.messages.fetch(ev.messageId).catch(() => null);
        if (msg) await msg.edit({ embeds: [buildBetEmbed(ev)], components: buildBetRows(ev) }).catch(() => null);
      }
    }

    await interaction.reply({ content: "Ставка обновлена. Уже принятые ставки сохраняют прежние коэффициенты.", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (id === MODAL_GRANT_RUB) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Нужно запускать на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!(await isGuildOwner(interaction))) {
      await interaction.reply({
        content: "Выдать ₽ может только **владелец сервера**.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const guildId = interaction.guildId;
    const userRaw = interaction.fields.getTextInputValue("user");
    const amountRaw = interaction.fields.getTextInputValue("amount");
    const userId = parseUserId(userRaw);
    const amount = Number.parseInt(amountRaw, 10);
    if (!userId || !Number.isFinite(amount) || amount <= 0) {
      await interaction.reply({ content: "Некорректный пользователь или сумма.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const rGrant = await grantRublesFromTreasury(
      interaction.client,
      guildId,
      interaction.user.id,
      interaction.user.toString(),
      userId,
      amount,
    );
    if (!rGrant.ok) {
      await interaction.reply({ content: rGrant.message, flags: MessageFlags.Ephemeral });
      return true;
    }

    await interaction.reply({
      content: `Выдано ${amount.toLocaleString("ru-RU")} ₽ пользователю <@${userId}> (из казны).`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (id === MODAL_TAKE_RUB) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Нужно запускать на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!(await isGuildOwner(interaction))) {
      await interaction.reply({
        content: "Забрать ₽ может только **владелец сервера**.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const guildId = interaction.guildId;
    const userRaw = interaction.fields.getTextInputValue("user");
    const amountRaw = interaction.fields.getTextInputValue("amount");
    const userId = parseUserId(userRaw);
    const amount = Number.parseInt(amountRaw, 10);
    if (!userId || !Number.isFinite(amount) || amount <= 0) {
      await interaction.reply({ content: "Некорректный пользователь или сумма.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const rTake = await takeRublesFromUser(
      interaction.client,
      guildId,
      interaction.user.id,
      interaction.user.toString(),
      userId,
      amount,
      true,
    );
    if (!rTake.ok) {
      await interaction.reply({ content: rTake.message, flags: MessageFlags.Ephemeral });
      return true;
    }

    await interaction.reply({
      content: `Снято ${amount.toLocaleString("ru-RU")} ₽ с <@${userId}> и зачислено в казну.`,
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }

  if (id.startsWith(MODAL_BET_AMOUNT_PREFIX)) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Нужно запускать на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const rest = id.slice(MODAL_BET_AMOUNT_PREFIX.length);
    const [eventId, optionId] = rest.split(":");
    if (!eventId || !optionId) return false;
    const ev = getBetEvent(interaction.guildId, eventId);
    if (!ev) {
      await interaction.reply({ content: "Событие не найдено.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!isAcceptingBets(ev)) {
      await interaction.reply({ content: "Приём ставок закрыт.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const opt = ev.options.find((o) => o.id === optionId);
    if (!opt) {
      await interaction.reply({ content: "Исход не найден.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const amount = parseBetAmountRubles(interaction.fields.getTextInputValue("amount"));
    if (amount == null) {
      await interaction.reply({
        content: "Укажите сумму в ₽ (целое число больше нуля). Можно с пробелами и с **запятой** или **точкой**.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const u = getEconomyUser(guildId, userId);
    if (u.rubles < amount) {
      await interaction.reply({ content: `Недостаточно ₽. Баланс: ${u.rubles.toLocaleString("ru-RU")} ₽.`, flags: MessageFlags.Ephemeral });
      return true;
    }

    const potential = Math.floor(amount * opt.odds);
    const embed = new EmbedBuilder()
      .setColor(BET_COLOR)
      .setTitle("Подтверждение ставки")
      .setDescription(
        [
          `Ставка: **${ev.title}**`,
          `Исход: **${opt.label}**`,
          `Коэффициент: **x${opt.odds.toLocaleString("ru-RU")}**`,
          "",
          `Ставите: **${amount.toLocaleString("ru-RU")} ₽**`,
          `Можно выиграть: **${potential.toLocaleString("ru-RU")} ₽**`,
          "",
          `Ваш баланс: **${u.rubles.toLocaleString("ru-RU")} ₽**`,
        ].join("\n"),
      );
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${BET_BUTTON_CONFIRM_PREFIX}${eventId}:${optionId}:${amount}`)
        .setLabel("Подтвердить")
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${BET_BUTTON_CONFIRM_CANCEL_PREFIX}${eventId}`).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
    return true;
  }

  return false;
}

export async function ensureBetsHealth(client: Client) {
  const tick = async () => {
    const now = Date.now();
    for (const guild of client.guilds.cache.values()) {
      const events = listBetEvents(guild.id);
      for (const ev of events) {
        if (
          ev.status === "resolved" &&
          ev.resolvedDeleteFeedMessageAtMs &&
          now >= ev.resolvedDeleteFeedMessageAtMs &&
          ev.channelId &&
          ev.messageId
        ) {
          const ch = await client.channels.fetch(ev.channelId).catch(() => null);
          if (ch?.isTextBased() && !ch.isDMBased()) {
            const msg = await ch.messages.fetch(ev.messageId).catch(() => null);
            if (msg) await msg.delete().catch(() => null);
          }
          ev.messageId = undefined;
          ev.resolvedDeleteFeedMessageAtMs = undefined;
          upsertBetEvent(ev);
        }

        if (ev.status === "open" && now > ev.closesAt) {
          // совместимость со старым store.ts: статус 'closed' хранится как строка
          (ev as any).status = "closed";
          upsertBetEvent(ev);
        }
        if (ev.channelId && ev.messageId) {
          const ch = await client.channels.fetch(ev.channelId).catch(() => null);
          if (ch?.isTextBased() && !ch.isDMBased()) {
            const msg = await ch.messages.fetch(ev.messageId).catch(() => null);
            if (msg) {
              await msg.edit({ embeds: [buildBetEmbed(ev)], components: buildBetRows(ev) }).catch(() => null);
            }
          }
        }
      }
    }
  };

  await tick().catch(() => null);
  setInterval(() => void tick().catch(() => null), 60_000);
}

export async function handleNeuroAdminBetFlow(interaction: ButtonInteraction): Promise<boolean> {
  const id = interaction.customId;
  if (
    !id.startsWith(ADMIN_BET_MANAGE_PREFIX) &&
    !id.startsWith(ADMIN_BET_CHOOSE_PREFIX) &&
    !id.startsWith(ADMIN_BET_CONFIRM_PREFIX) &&
    !id.startsWith(ADMIN_BET_CANCEL_PREFIX) &&
    !id.startsWith(ADMIN_BET_EDIT_PREFIX)
  ) {
    return false;
  }
  if (!interaction.inGuild() || !interaction.guildId) return false;
  if (!canAdmin(interaction)) {
    await replyOrUpdateEphemeral(interaction, { content: "Недостаточно прав." });
    return true;
  }

  const guildId = interaction.guildId;

  if (id.startsWith(ADMIN_BET_EDIT_PREFIX)) {
    const eventId = id.slice(ADMIN_BET_EDIT_PREFIX.length);
    const ev = eventId ? getBetEvent(guildId, eventId) : undefined;
    if (!ev) {
      await replyOrUpdateEphemeral(interaction, { content: "Ставка не найдена." });
      return true;
    }
    if (!canAdminResolveOrCancel(ev)) {
      await replyOrUpdateEphemeral(interaction, { content: "Ставка уже закрыта." });
      return true;
    }
    await showEditBetModal(interaction, ev);
    return true;
  }

  if (id.startsWith(ADMIN_BET_MANAGE_PREFIX)) {
    const eventId = id.slice(ADMIN_BET_MANAGE_PREFIX.length);
    const ev = eventId ? getBetEvent(guildId, eventId) : undefined;
    if (!ev) {
      await interaction.reply({ content: "Ставка не найдена.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const embed = new EmbedBuilder()
      .setColor(0x0d47a1)
      .setTitle(`Ставка: ${ev.title}`)
      .setDescription("Выберите победителя (только для админов).");

    const winnersRow = new ActionRowBuilder<ButtonBuilder>();
    for (const opt of ev.options.slice(0, 3)) {
      winnersRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`${ADMIN_BET_CHOOSE_PREFIX}${ev.id}:${opt.id}`)
          .setLabel(`Победитель: ${opt.label}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!canAdminResolveOrCancel(ev)),
      );
    }
    const adminRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ADMIN_BET_EDIT_PREFIX}${ev.id}`)
        .setLabel("Редактировать")
        .setStyle(ButtonStyle.Primary)
        .setDisabled(!canAdminResolveOrCancel(ev)),
      new ButtonBuilder()
        .setCustomId(`${ADMIN_BET_CANCEL_PREFIX}${ev.id}`)
        .setLabel("Отменить ставку")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!canAdminResolveOrCancel(ev)),
    );

    await replyOrUpdateEphemeral(interaction, {
      embeds: [embed],
      components: [
        winnersRow,
        adminRow,
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(NEURO_ADMIN_BUTTON_BETS).setLabel("Назад").setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    return true;
  }

  if (id.startsWith(ADMIN_BET_CHOOSE_PREFIX)) {
    const rest = id.slice(ADMIN_BET_CHOOSE_PREFIX.length);
    const [eventId, optionId] = rest.split(":");
    const ev = eventId ? getBetEvent(guildId, eventId) : undefined;
    if (!ev) {
      await replyOrUpdateEphemeral(interaction, { content: "Ставка не найдена." });
      return true;
    }
    if (!canAdminResolveOrCancel(ev)) {
      await replyOrUpdateEphemeral(interaction, { content: "Ставка уже закрыта." });
      return true;
    }
    const label = ev.options.find((o) => o.id === optionId)?.label ?? optionId;
    const embed = new EmbedBuilder()
      .setColor(0x0d47a1)
      .setTitle("Подтверждение")
      .setDescription(`Вы уверены, что победитель: **${label}**?\n\nСтавка: **${ev.title}**`);
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`${ADMIN_BET_CONFIRM_PREFIX}${ev.id}:${optionId}`).setLabel("Да, подтвердить").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${ADMIN_BET_MANAGE_PREFIX}${ev.id}`).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    );
    await replyOrUpdateEphemeral(interaction, { embeds: [embed], components: [row] });
    return true;
  }

  if (id.startsWith(ADMIN_BET_CANCEL_PREFIX)) {
    const eventId = id.slice(ADMIN_BET_CANCEL_PREFIX.length);
    const ev = eventId ? getBetEvent(guildId, eventId) : undefined;
    if (!ev) {
      await replyOrUpdateEphemeral(interaction, { content: "Ставка не найдена." });
      return true;
    }
    if (!canAdminResolveOrCancel(ev)) {
      await replyOrUpdateEphemeral(interaction, { content: "Ставка уже закрыта." });
      return true;
    }
    for (const [userId, stakes] of Object.entries(ev.bets)) {
      for (const bet of stakes) {
        const u = getEconomyUser(guildId, userId);
        patchEconomyUser(guildId, userId, { rubles: u.rubles + bet.amount });
      }
    }
    ev.status = "cancelled";
    await deleteBetFeedMessage(interaction.client, ev);
    upsertBetEvent(ev);
    appendFeedEvent({ ts: Date.now(), guildId, type: "bet:resolved", text: `Ставка «${ev.title}» отменена. Ставки возвращены.` });
    await ensureEconomyFeedPanel(interaction.client);
    await replyOrUpdateEphemeral(interaction, { content: "Ставка отменена." });
    return true;
  }

  if (id.startsWith(ADMIN_BET_CONFIRM_PREFIX)) {
    const rest = id.slice(ADMIN_BET_CONFIRM_PREFIX.length);
    const [eventId, optionId] = rest.split(":");
    const ev = eventId ? getBetEvent(guildId, eventId) : undefined;
    if (!ev) {
      await replyOrUpdateEphemeral(interaction, { content: "Ставка не найдена." });
      return true;
    }
    if (!canAdminResolveOrCancel(ev)) {
      await replyOrUpdateEphemeral(interaction, { content: "Ставка уже закрыта." });
      return true;
    }
    // fixed-odds payouts: payout = amount * odds
    const opt = ev.options.find((o) => o.id === optionId);
    if (!opt) {
      await replyOrUpdateEphemeral(interaction, { content: "Исход не найден." });
      return true;
    }
    for (const [userId, stakes] of Object.entries(ev.bets)) {
      for (const bet of stakes) {
        if (bet.optionId !== optionId) continue;
        const payout = Math.floor(bet.amount * bet.oddsAtPlacement);
        const u = getEconomyUser(guildId, userId);
        patchEconomyUser(guildId, userId, { rubles: u.rubles + payout });
      }
    }
    ev.status = "resolved";
    ev.winningOptionId = optionId;
    ev.resolvedDeleteFeedMessageAtMs = Date.now() + BET_RESOLVED_FEED_MESSAGE_DELETE_AFTER_MS;
    upsertBetEvent(ev);
    appendFeedEvent({ ts: Date.now(), guildId, type: "bet:resolved", text: `Ставка «${ev.title}» решена: победил исход **${opt.label}**.` });
    await ensureEconomyFeedPanel(interaction.client);
    if (ev.channelId && ev.messageId) {
      const ch = await interaction.client.channels.fetch(ev.channelId).catch(() => null);
      if (ch?.isTextBased() && !ch.isDMBased()) {
        const msg = await ch.messages.fetch(ev.messageId).catch(() => null);
        if (msg) await msg.edit({ embeds: [buildBetEmbed(ev)], components: buildBetRows(ev) }).catch(() => null);
      }
    }
    await replyOrUpdateEphemeral(interaction, { content: "Победитель зафиксирован, выплаты начислены." });
    return true;
  }

  return false;
}


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
  type Client,
  type ModalSubmitInteraction,
} from "discord.js";
import { randomUUID } from "node:crypto";
import { economyFeedChannelId } from "../config.js";
import { appendFeedEvent } from "../economy/feedStore.js";
import { ensureEconomyFeedPanel } from "../economy/panel.js";
import { getEconomyUser, patchEconomyUser } from "../economy/userStore.js";
import { getBetEvent, listBetEvents, upsertBetEvent, type BetEvent } from "./store.js";

export const NEURO_ADMIN_BUTTON_MENU = "neuroAdmin:menu";
export const NEURO_ADMIN_BUTTON_CREATE_BET = "neuroAdmin:createBet";
export const NEURO_ADMIN_BUTTON_GRANT_RUB = "neuroAdmin:grantRub";
export const NEURO_ADMIN_BUTTON_BETS = "neuroAdmin:bets";

const MODAL_CREATE_BET = "modal:bet:create";
const MODAL_GRANT_RUB = "modal:econ:grantRub";

const BET_BUTTON_PICK_PREFIX = "bet:pick:";

const MODAL_BET_AMOUNT_PREFIX = "modal:bet:amount:";

const BET_COLOR = 0xb71c1c;

const ADMIN_BET_MANAGE_PREFIX = "neuroAdmin:bet:";
const ADMIN_BET_CHOOSE_PREFIX = "neuroAdmin:betChoose:";
const ADMIN_BET_CONFIRM_PREFIX = "neuroAdmin:betConfirm:";
const ADMIN_BET_CANCEL_PREFIX = "neuroAdmin:betCancel:";

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

function buildAdminMenuEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(0x0d47a1)
    .setTitle("Админ-меню: ивенты и экономика")
    .setDescription(["Создание событий для ленты (ставки/ивенты) и базовые админ-инструменты."].join("\n"));
}

function buildAdminMenuRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_ADMIN_BUTTON_CREATE_BET).setLabel("Создать ставку").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(NEURO_ADMIN_BUTTON_BETS).setLabel("Ставки").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(NEURO_ADMIN_BUTTON_GRANT_RUB).setLabel("Выдать ₽").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export async function handleNeuroAdminButton(interaction: ButtonInteraction): Promise<boolean> {
  const id = interaction.customId;
  if (
    ![
      NEURO_ADMIN_BUTTON_MENU,
      NEURO_ADMIN_BUTTON_CREATE_BET,
      NEURO_ADMIN_BUTTON_GRANT_RUB,
      NEURO_ADMIN_BUTTON_BETS,
    ].includes(id) &&
    !id.startsWith(ADMIN_BET_MANAGE_PREFIX) &&
    !id.startsWith(ADMIN_BET_CHOOSE_PREFIX) &&
    !id.startsWith(ADMIN_BET_CONFIRM_PREFIX) &&
    !id.startsWith(ADMIN_BET_CANCEL_PREFIX)
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

  if (id === NEURO_ADMIN_BUTTON_MENU) {
    await replyOrUpdateEphemeral(interaction, { embeds: [buildAdminMenuEmbed()], components: buildAdminMenuRows() });
    return true;
  }

  if (id === NEURO_ADMIN_BUTTON_BETS) {
    const guildId = interaction.guildId;
    const events = listBetEvents(guildId).filter((e) => e.status === "open").sort((a, b) => b.createdAt - a.createdAt);
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
        new ButtonBuilder().setCustomId(NEURO_ADMIN_BUTTON_MENU).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      ),
    );

    await replyOrUpdateEphemeral(interaction, { embeds: [embed], components: rows });
    return true;
  }

  if (id === NEURO_ADMIN_BUTTON_CREATE_BET) {
    const modal = new ModalBuilder().setCustomId(MODAL_CREATE_BET).setTitle("Создать ставку");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("title").setLabel("Название события").setStyle(TextInputStyle.Short).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("a")
          .setLabel("Исход A (пример: Team A | 1.8)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("b")
          .setLabel("Исход B (пример: Team B | 2.1)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("closeAt")
          .setLabel("Закрытие: +минуты или YYYY-MM-DD HH:MM")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (id === NEURO_ADMIN_BUTTON_GRANT_RUB) {
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

  return false;
}

function parseOptionWithOdds(raw: string, fallbackId: string): { id: string; label: string; odds: number } | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const parts = t.split("|").map((x) => x.trim()).filter(Boolean);
  const label = (parts[0] ?? "").slice(0, 80);
  if (!label) return undefined;
  const oddsRaw = parts[1] ?? "2.0";
  const odds = Number.parseFloat(oddsRaw.replace(",", "."));
  if (!Number.isFinite(odds) || odds < 1.01 || odds > 100) return undefined;
  return { id: fallbackId, label, odds };
}

function parseCloseAt(raw: string, now = Date.now()): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  if (t.startsWith("+")) {
    const min = Number.parseInt(t.slice(1), 10);
    if (!Number.isFinite(min) || min <= 0) return undefined;
    return now + min * 60_000;
  }
  // YYYY-MM-DD HH:MM (локальное время сервера)
  const m = t.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!m) return undefined;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const hh = Number(m[4]);
  const mm = Number(m[5]);
  const dt = new Date(y, mo - 1, d, hh, mm, 0, 0);
  const ts = dt.getTime();
  if (!Number.isFinite(ts) || ts <= now) return undefined;
  return ts;
}

function parseUserId(raw: string): string | undefined {
  const m = raw.trim().match(/^<@!?(\d+)>$/);
  if (m) return m[1];
  if (/^\d{5,25}$/.test(raw.trim())) return raw.trim();
  return undefined;
}

function buildBetEmbed(ev: BetEvent): EmbedBuilder {
  const closes = Math.floor(ev.closesAt / 1000);
  const statusLine =
    ev.status === "open"
      ? `Приём ставок до <t:${closes}:R> (до <t:${closes}:t>).`
      : ev.status === "resolved"
        ? `Результат: **${ev.options.find((o) => o.id === ev.winningOptionId)?.label ?? "—"}**.`
        : "Событие отменено.";

  const total = Object.values(ev.bets).reduce((s, b) => s + b.amount, 0);
  const opts = ev.options.map((o) => `• **${o.label}** — x${o.odds.toLocaleString("ru-RU")}`).join("\n");
  return new EmbedBuilder()
    .setColor(BET_COLOR)
    .setTitle(`Ставка: ${ev.title}`)
    .setDescription([statusLine, "", "Коэффициенты:", opts, "", `Банк: **${total.toLocaleString("ru-RU")} ₽**`].join("\n"));
}

function buildBetRows(ev: BetEvent): ActionRowBuilder<ButtonBuilder>[] {
  const row1 = new ActionRowBuilder<ButtonBuilder>();
  for (const opt of ev.options.slice(0, 3)) {
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`${BET_BUTTON_PICK_PREFIX}${ev.id}:${opt.id}`)
        .setLabel(opt.label)
        .setStyle(ButtonStyle.Primary)
        .setDisabled(ev.status !== "open"),
    );
  }

  return [row1];
}

export async function handleBetButton(interaction: ButtonInteraction): Promise<boolean> {
  const id = interaction.customId;
  if (!id.startsWith(BET_BUTTON_PICK_PREFIX)) {
    return false;
  }

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Ставки доступны только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const guildId = interaction.guildId;

  if (id.startsWith(BET_BUTTON_PICK_PREFIX)) {
    const rest = id.slice(BET_BUTTON_PICK_PREFIX.length);
    const [eventId, optionId] = rest.split(":");
    if (!eventId || !optionId) return false;
    const ev = getBetEvent(guildId, eventId);
    if (!ev) {
      await interaction.reply({ content: "Событие не найдено.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (ev.status !== "open" || Date.now() > ev.closesAt) {
      await interaction.reply({ content: "Приём ставок закрыт.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const opt = ev.options.find((o) => o.id === optionId);
    if (!opt) {
      await interaction.reply({ content: "Исход не найден.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const modal = new ModalBuilder().setCustomId(`${MODAL_BET_AMOUNT_PREFIX}${eventId}:${optionId}`).setTitle("Сумма ставки");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("amount")
          .setLabel(`Сколько ₽ поставить на «${opt.label}»`)
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
    );
    await interaction.showModal(modal);
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
    const aRaw = interaction.fields.getTextInputValue("a").trim();
    const bRaw = interaction.fields.getTextInputValue("b").trim();
    const closeAtRaw = interaction.fields.getTextInputValue("closeAt").trim();
    const optA = parseOptionWithOdds(aRaw, "A");
    const optB = parseOptionWithOdds(bRaw, "B");
    const closesAt = parseCloseAt(closeAtRaw, Date.now());
    if (!title || !optA || !optB || !closesAt) {
      await interaction.reply({
        content:
          "Некорректные поля.\n- Исходы: `Название | 1.8`\n- Закрытие: `+120` или `2026-05-08 18:30`",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }

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
      options: [optA, optB],
      createdByUserId: interaction.user.id,
      createdAt: Date.now(),
      closesAt,
      status: "open",
      bets: {},
    };

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
    return true;
  }

  if (id === MODAL_GRANT_RUB) {
    if (!interaction.inGuild() || !interaction.guildId) {
      await interaction.reply({ content: "Нужно запускать на сервере.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (!canAdmin(interaction)) {
      await interaction.reply({ content: "Недостаточно прав.", flags: MessageFlags.Ephemeral });
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

    const u = getEconomyUser(guildId, userId);
    patchEconomyUser(guildId, userId, { rubles: u.rubles + amount });
    appendFeedEvent({
      ts: Date.now(),
      guildId,
      type: "admin:budget",
      actorUserId: interaction.user.id,
      text: `${interaction.user.toString()} выдал <@${userId}> **${amount.toLocaleString("ru-RU")} ₽**.`,
    });
    await ensureEconomyFeedPanel(interaction.client);

    await interaction.reply({ content: `Выдано ${amount.toLocaleString("ru-RU")} ₽ пользователю <@${userId}>.`, flags: MessageFlags.Ephemeral });
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
    if (ev.status !== "open" || Date.now() > ev.closesAt) {
      await interaction.reply({ content: "Приём ставок закрыт.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const opt = ev.options.find((o) => o.id === optionId);
    if (!opt) {
      await interaction.reply({ content: "Исход не найден.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const amountRaw = interaction.fields.getTextInputValue("amount").trim();
    const amount = Number.parseInt(amountRaw, 10);
    if (!Number.isFinite(amount) || amount <= 0) {
      await interaction.reply({ content: "Некорректная сумма.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const guildId = interaction.guildId;
    const userId = interaction.user.id;
    const u = getEconomyUser(guildId, userId);
    if (u.rubles < amount) {
      await interaction.reply({ content: `Недостаточно ₽. Баланс: ${u.rubles.toLocaleString("ru-RU")} ₽.`, flags: MessageFlags.Ephemeral });
      return true;
    }

    patchEconomyUser(guildId, userId, { rubles: u.rubles - amount });
    ev.bets[userId] = { optionId, amount, ts: Date.now() };
    upsertBetEvent(ev);

    appendFeedEvent({
      ts: Date.now(),
      guildId,
      type: "bet:placed",
      actorUserId: userId,
      text: `${interaction.user.toString()} поставил **${amount.toLocaleString("ru-RU")} ₽** на «${opt.label}» (ставка: ${ev.title}).`,
    });
    await ensureEconomyFeedPanel(interaction.client);

    // Обновим карточку ставки, если можем.
    if (ev.channelId && ev.messageId) {
      const ch = await interaction.client.channels.fetch(ev.channelId).catch(() => null);
      if (ch?.isTextBased() && !ch.isDMBased()) {
        const msg = await ch.messages.fetch(ev.messageId).catch(() => null);
        if (msg) {
          await msg.edit({ embeds: [buildBetEmbed(ev)], components: buildBetRows(ev) }).catch(() => null);
        }
      }
    }

    await interaction.reply({ content: "Ставка принята.", flags: MessageFlags.Ephemeral });
    return true;
  }

  return false;
}

export async function ensureBetsHealth(client: Client) {
  void client;
  // placeholder: позже можно добавить авто-закрытие по времени и т.п.
}

export async function handleNeuroAdminBetFlow(interaction: ButtonInteraction): Promise<boolean> {
  const id = interaction.customId;
  if (
    !id.startsWith(ADMIN_BET_MANAGE_PREFIX) &&
    !id.startsWith(ADMIN_BET_CHOOSE_PREFIX) &&
    !id.startsWith(ADMIN_BET_CONFIRM_PREFIX) &&
    !id.startsWith(ADMIN_BET_CANCEL_PREFIX)
  ) {
    return false;
  }
  if (!interaction.inGuild() || !interaction.guildId) return false;
  if (!canAdmin(interaction)) {
    await replyOrUpdateEphemeral(interaction, { content: "Недостаточно прав." });
    return true;
  }

  const guildId = interaction.guildId;

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

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ADMIN_BET_CHOOSE_PREFIX}${ev.id}:A`)
        .setLabel(`Победитель: ${ev.options.find((o) => o.id === "A")?.label ?? "A"}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(ev.status !== "open"),
      new ButtonBuilder()
        .setCustomId(`${ADMIN_BET_CHOOSE_PREFIX}${ev.id}:B`)
        .setLabel(`Победитель: ${ev.options.find((o) => o.id === "B")?.label ?? "B"}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(ev.status !== "open"),
      new ButtonBuilder()
        .setCustomId(`${ADMIN_BET_CANCEL_PREFIX}${ev.id}`)
        .setLabel("Отменить ставку")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(ev.status !== "open"),
    );

    await replyOrUpdateEphemeral(interaction, {
      embeds: [embed],
      components: [
        row,
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
    if (ev.status !== "open") {
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
    if (ev.status !== "open") {
      await replyOrUpdateEphemeral(interaction, { content: "Ставка уже закрыта." });
      return true;
    }
    for (const [userId, bet] of Object.entries(ev.bets)) {
      const u = getEconomyUser(guildId, userId);
      patchEconomyUser(guildId, userId, { rubles: u.rubles + bet.amount });
    }
    ev.status = "cancelled";
    upsertBetEvent(ev);
    appendFeedEvent({ ts: Date.now(), guildId, type: "bet:resolved", text: `Ставка «${ev.title}» отменена. Ставки возвращены.` });
    await ensureEconomyFeedPanel(interaction.client);
    if (ev.channelId && ev.messageId) {
      const ch = await interaction.client.channels.fetch(ev.channelId).catch(() => null);
      if (ch?.isTextBased() && !ch.isDMBased()) {
        const msg = await ch.messages.fetch(ev.messageId).catch(() => null);
        if (msg) await msg.edit({ embeds: [buildBetEmbed(ev)], components: buildBetRows(ev) }).catch(() => null);
      }
    }
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
    if (ev.status !== "open") {
      await replyOrUpdateEphemeral(interaction, { content: "Ставка уже закрыта." });
      return true;
    }
    // fixed-odds payouts: payout = amount * odds
    const opt = ev.options.find((o) => o.id === optionId);
    if (!opt) {
      await replyOrUpdateEphemeral(interaction, { content: "Исход не найден." });
      return true;
    }
    const winners = Object.entries(ev.bets).filter(([, b]) => b.optionId === optionId);
    for (const [userId, bet] of winners) {
      const payout = Math.floor(bet.amount * opt.odds);
      const u = getEconomyUser(guildId, userId);
      patchEconomyUser(guildId, userId, { rubles: u.rubles + payout });
    }
    ev.status = "resolved";
    ev.winningOptionId = optionId;
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


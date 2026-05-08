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
import { getBetEvent, upsertBetEvent, type BetEvent } from "./store.js";

export const NEURO_ADMIN_BUTTON_MENU = "neuroAdmin:menu";
export const NEURO_ADMIN_BUTTON_CREATE_BET = "neuroAdmin:createBet";
export const NEURO_ADMIN_BUTTON_GRANT_RUB = "neuroAdmin:grantRub";

const MODAL_CREATE_BET = "modal:bet:create";
const MODAL_GRANT_RUB = "modal:econ:grantRub";

const BET_BUTTON_PICK_PREFIX = "bet:pick:";
const BET_BUTTON_RESOLVE_PREFIX = "bet:resolve:";
const BET_BUTTON_CANCEL_PREFIX = "bet:cancel:";

const MODAL_BET_AMOUNT_PREFIX = "modal:bet:amount:";

const BET_COLOR = 0xb71c1c;

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
      new ButtonBuilder().setCustomId(NEURO_ADMIN_BUTTON_GRANT_RUB).setLabel("Выдать ₽").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export async function handleNeuroAdminButton(interaction: ButtonInteraction): Promise<boolean> {
  const id = interaction.customId;
  if (![NEURO_ADMIN_BUTTON_MENU, NEURO_ADMIN_BUTTON_CREATE_BET, NEURO_ADMIN_BUTTON_GRANT_RUB].includes(id)) return false;

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Админ-меню доступно только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canAdmin(interaction)) {
    await interaction.reply({ content: "Недостаточно прав (нужно Manage Server).", flags: MessageFlags.Ephemeral });
    return true;
  }

  if (id === NEURO_ADMIN_BUTTON_MENU) {
    await interaction.reply({ embeds: [buildAdminMenuEmbed()], components: buildAdminMenuRows(), flags: MessageFlags.Ephemeral });
    return true;
  }

  if (id === NEURO_ADMIN_BUTTON_CREATE_BET) {
    const modal = new ModalBuilder().setCustomId(MODAL_CREATE_BET).setTitle("Создать ставку");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("title").setLabel("Название события").setStyle(TextInputStyle.Short).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("a").setLabel("Исход A (например Team A)").setStyle(TextInputStyle.Short).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder().setCustomId("b").setLabel("Исход B (например Team B)").setStyle(TextInputStyle.Short).setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("closeMin")
          .setLabel("Закрыть через минут (например 120)")
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
  return new EmbedBuilder()
    .setColor(BET_COLOR)
    .setTitle(`Ставка: ${ev.title}`)
    .setDescription([statusLine, "", `Банк: **${total.toLocaleString("ru-RU")} ₽**`].join("\n"));
}

function buildBetRows(ev: BetEvent, includeAdminControls: boolean): ActionRowBuilder<ButtonBuilder>[] {
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

  const rows: ActionRowBuilder<ButtonBuilder>[] = [row1];
  if (includeAdminControls) {
    const row2 = new ActionRowBuilder<ButtonBuilder>();
    for (const opt of ev.options.slice(0, 3)) {
      row2.addComponents(
        new ButtonBuilder()
          .setCustomId(`${BET_BUTTON_RESOLVE_PREFIX}${ev.id}:${opt.id}`)
          .setLabel(`Решить: ${opt.label}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(ev.status !== "open"),
      );
    }
    row2.addComponents(
      new ButtonBuilder()
        .setCustomId(`${BET_BUTTON_CANCEL_PREFIX}${ev.id}`)
        .setLabel("Отмена")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(ev.status !== "open"),
    );
    rows.push(row2);
  }
  return rows;
}

export async function handleBetButton(interaction: ButtonInteraction): Promise<boolean> {
  const id = interaction.customId;
  if (
    !id.startsWith(BET_BUTTON_PICK_PREFIX) &&
    !id.startsWith(BET_BUTTON_RESOLVE_PREFIX) &&
    !id.startsWith(BET_BUTTON_CANCEL_PREFIX)
  ) {
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

  if (id.startsWith(BET_BUTTON_CANCEL_PREFIX)) {
    if (!canAdmin(interaction)) {
      await interaction.reply({ content: "Недостаточно прав.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const eventId = id.slice(BET_BUTTON_CANCEL_PREFIX.length);
    const ev = eventId ? getBetEvent(guildId, eventId) : undefined;
    if (!ev) {
      await interaction.reply({ content: "Событие не найдено.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (ev.status !== "open") {
      await interaction.reply({ content: "Событие уже закрыто.", flags: MessageFlags.Ephemeral });
      return true;
    }

    // Возврат ставок
    for (const [userId, bet] of Object.entries(ev.bets)) {
      const u = getEconomyUser(guildId, userId);
      patchEconomyUser(guildId, userId, { rubles: u.rubles + bet.amount });
    }

    ev.status = "cancelled";
    upsertBetEvent(ev);
    appendFeedEvent({ ts: Date.now(), guildId, type: "bet:resolved", text: `Ставка «${ev.title}» отменена. Ставки возвращены.` });
    await ensureEconomyFeedPanel(interaction.client);

    await interaction.update({
      embeds: [buildBetEmbed(ev)],
      components: buildBetRows(ev, true),
    });
    return true;
  }

  if (id.startsWith(BET_BUTTON_RESOLVE_PREFIX)) {
    if (!canAdmin(interaction)) {
      await interaction.reply({ content: "Недостаточно прав.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const rest = id.slice(BET_BUTTON_RESOLVE_PREFIX.length);
    const [eventId, optionId] = rest.split(":");
    if (!eventId || !optionId) return false;
    const ev = getBetEvent(guildId, eventId);
    if (!ev) {
      await interaction.reply({ content: "Событие не найдено.", flags: MessageFlags.Ephemeral });
      return true;
    }
    if (ev.status !== "open") {
      await interaction.reply({ content: "Событие уже закрыто.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const total = Object.values(ev.bets).reduce((s, b) => s + b.amount, 0);
    const winners = Object.entries(ev.bets).filter(([, b]) => b.optionId === optionId);
    const winnersSum = winners.reduce((s, [, b]) => s + b.amount, 0);

    if (total > 0 && winnersSum > 0) {
      for (const [userId, bet] of winners) {
        const payout = Math.floor((bet.amount * total) / winnersSum);
        const u = getEconomyUser(guildId, userId);
        patchEconomyUser(guildId, userId, { rubles: u.rubles + payout });
      }
    }

    ev.status = "resolved";
    ev.winningOptionId = optionId;
    upsertBetEvent(ev);
    const winningLabel = ev.options.find((o) => o.id === optionId)?.label ?? optionId;
    appendFeedEvent({
      ts: Date.now(),
      guildId,
      type: "bet:resolved",
      text: `Ставка «${ev.title}» решена: победил исход **${winningLabel}**.`,
    });
    await ensureEconomyFeedPanel(interaction.client);

    await interaction.update({ embeds: [buildBetEmbed(ev)], components: buildBetRows(ev, true) });
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
    const a = interaction.fields.getTextInputValue("a").trim();
    const b = interaction.fields.getTextInputValue("b").trim();
    const closeMinRaw = interaction.fields.getTextInputValue("closeMin").trim();
    const closeMin = Number.parseInt(closeMinRaw, 10);
    if (!title || !a || !b || !Number.isFinite(closeMin) || closeMin <= 0) {
      await interaction.reply({ content: "Некорректные поля (проверьте минуты/названия).", flags: MessageFlags.Ephemeral });
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
      options: [
        { id: "A", label: a.slice(0, 80) },
        { id: "B", label: b.slice(0, 80) },
      ],
      createdByUserId: interaction.user.id,
      createdAt: Date.now(),
      closesAt: Date.now() + closeMin * 60_000,
      status: "open",
      bets: {},
    };

    const sent = await feed.send({
      embeds: [buildBetEmbed(ev)],
      components: buildBetRows(ev, true),
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
          await msg.edit({ embeds: [buildBetEmbed(ev)], components: buildBetRows(ev, true) }).catch(() => null);
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


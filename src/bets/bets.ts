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

const BET_BUTTON_OPEN_PREFIX = "bet:open:";
const BET_MENU_PICK_PREFIX = "bet:menuPick:";
const BET_MENU_BACK_PREFIX = "bet:menuBack:";
const BET_MENU_HISTORY = "bet:menuHistory";
const BET_MENU_CLOSE = "bet:menuClose";
const BET_BUTTON_CONFIRM_PREFIX = "bet:confirm:";
const BET_BUTTON_CONFIRM_CANCEL_PREFIX = "bet:confirmCancel:";

const MODAL_BET_AMOUNT_PREFIX = "modal:bet:amount:";

const BET_COLOR = 0xb71c1c;

const ADMIN_BET_MANAGE_PREFIX = "neuroAdmin:bet:";
const ADMIN_BET_CHOOSE_PREFIX = "neuroAdmin:betChoose:";
const ADMIN_BET_CONFIRM_PREFIX = "neuroAdmin:betConfirm:";
const ADMIN_BET_CANCEL_PREFIX = "neuroAdmin:betCancel:";

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
          .setLabel("Победа 1 (пример: Team A | 1.8)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("b")
          .setLabel("Победа 2 (пример: Team B | 2.1)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("d")
          .setLabel("Ничья (пример: Ничья | 3.2)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("closeAt")
          .setLabel("Закрытие (МСК): DD-MM HH:MM")
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
  // DD-MM HH:MM (МСК, без года). Берём ближайшую будущую дату.
  const m = t.match(/^(\d{2})-(\d{2})\s+(\d{2}):(\d{2})$/);
  if (!m) return undefined;
  const dd = Number(m[1]);
  const mo = Number(m[2]);
  const hh = Number(m[3]);
  const mm = Number(m[4]);
  if (![dd, mo, hh, mm].every(Number.isFinite)) return undefined;
  if (mo < 1 || mo > 12) return undefined;
  if (dd < 1 || dd > 31) return undefined;
  if (hh < 0 || hh > 23) return undefined;
  if (mm < 0 || mm > 59) return undefined;

  // МСК = UTC+3 (без DST). Преобразуем "стеночное" МСК-время в UTC timestamp.
  const MSK_OFFSET_MS = 3 * 60 * 60 * 1000;
  const nowMsk = new Date(now + MSK_OFFSET_MS);
  const year = nowMsk.getUTCFullYear();

  const makeTs = (y: number) => {
    // Создаём дату как UTC, но это будет "MSK" без сдвига, затем вычитаем offset чтобы получить UTC.
    const asUtc = Date.UTC(y, mo - 1, dd, hh, mm, 0, 0);
    return asUtc - MSK_OFFSET_MS;
  };

  let ts = makeTs(year);
  if (!Number.isFinite(ts)) return undefined;
  if (ts <= now) {
    ts = makeTs(year + 1);
  }
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
  const accepting = isAcceptingBets(ev);
  const statusLine =
    accepting
      ? `Приём ставок до <t:${closes}:R> (до <t:${closes}:t>).`
      : ev.status === "open" || (ev.status as any) === "closed"
        ? `Приём ставок **закрыт** (закрылось <t:${closes}:R>).`
      : ev.status === "resolved"
        ? `Результат: **${ev.options.find((o) => o.id === ev.winningOptionId)?.label ?? "—"}**.`
        : "Событие отменено.";

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

function buildBetMenuEmbed(
  ev: BetEvent,
  balanceRub: number,
  userBet?: { optionLabel: string; amount: number; potential: number },
): EmbedBuilder {
  const closes = Math.floor(ev.closesAt / 1000);
  const statusLine =
    isAcceptingBets(ev)
      ? `Приём ставок до <t:${closes}:R> (до <t:${closes}:t>).`
      : ev.status === "open" || (ev.status as any) === "closed"
        ? `Приём ставок **закрыт** (закрылось <t:${closes}:R>).`
      : ev.status === "resolved"
        ? `Результат: **${ev.options.find((o) => o.id === ev.winningOptionId)?.label ?? "—"}**.`
        : "Событие отменено.";
  const opts = ev.options.map((o) => `• **${o.label}** — x${o.odds.toLocaleString("ru-RU")}`).join("\n");
  const myBetBlock = userBet
    ? [
        "",
        "Ваша ставка:",
        `- исход: **${userBet.optionLabel}**`,
        `- сумма: **${userBet.amount.toLocaleString("ru-RU")} ₽**`,
        `- возможный выигрыш: **${userBet.potential.toLocaleString("ru-RU")} ₽**`,
      ].join("\n")
    : "";
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
        "- ставка делается **один раз** и не меняется",
        "- отменить/вернуть свою ставку нельзя",
        myBetBlock,
        "",
        "Коэффициенты:",
        opts,
        "",
        "Выберите исход ниже.",
      ].filter(Boolean).join("\n"),
    );
}

function buildBetMenuRows(ev: BetEvent, locked: boolean): ActionRowBuilder<ButtonBuilder>[] {
  const accepting = isAcceptingBets(ev);
  const row = new ActionRowBuilder<ButtonBuilder>();
  for (const opt of ev.options.slice(0, 3)) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${BET_MENU_PICK_PREFIX}${ev.id}:${opt.id}`)
        .setLabel(opt.label)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(locked || !accepting),
    );
  }
  return [
    row,
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(BET_MENU_HISTORY).setLabel("Мои ставки").setStyle(ButtonStyle.Secondary),
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
    id !== BET_MENU_HISTORY &&
    id !== BET_MENU_CLOSE &&
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
    const locked = Boolean(ev.bets[userId]);
    const bet = ev.bets[userId];
    const opt = bet ? ev.options.find((o) => o.id === bet.optionId) : undefined;
    const userBet =
      bet && opt ? { optionLabel: opt.label, amount: bet.amount, potential: Math.floor(bet.amount * opt.odds) } : undefined;
    const embed = buildBetMenuEmbed(ev, u.rubles, userBet);
    const rows = buildBetMenuRows(ev, locked);
    if (locked) {
      await interaction.reply({
        embeds: [embed],
        components: rows,
        content: "Вы уже сделали ставку на это событие. Изменить или вернуть ставку нельзя.",
        flags: MessageFlags.Ephemeral,
      });
      return true;
    }
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

  if (id === BET_MENU_HISTORY) {
    const userId = interaction.user.id;
    const all = listBetEvents(guildId).sort((a, b) => b.createdAt - a.createdAt);
    const mine = all.filter((e) => Boolean(e.bets[userId])).slice(0, 10);
    const lines =
      mine.length === 0
        ? ["Пока нет ставок."]
        : mine.map((e) => {
            const b = e.bets[userId]!;
            const opt = e.options.find((o) => o.id === b.optionId);
            const label = opt?.label ?? b.optionId;
            const odds = opt?.odds ?? 0;
            const potential = odds ? Math.floor(b.amount * odds) : b.amount;
            const status =
              e.status === "resolved"
                ? `решена: **${e.options.find((o) => o.id === e.winningOptionId)?.label ?? "—"}**`
                : e.status === "cancelled"
                  ? "отменена"
                  : isAcceptingBets(e)
                    ? "приём открыт"
                    : "приём закрыт";
            return `• **${e.title}** — ${status}\n  ставка: **${b.amount.toLocaleString("ru-RU")} ₽** на «${label}» (x${odds.toLocaleString("ru-RU")}) → до **${potential.toLocaleString("ru-RU")} ₽**`;
          });
    const embed = new EmbedBuilder().setColor(BET_COLOR).setTitle("Мои ставки (последние)").setDescription(lines.join("\n"));
    const isEphemeralMessage = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
    const payload = {
      embeds: [embed],
      components: [
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(BET_MENU_CLOSE).setLabel("Закрыть").setStyle(ButtonStyle.Secondary),
        ),
      ],
    };
    if (interaction.message && isEphemeralMessage) await interaction.update(payload);
    else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
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
    if (ev.bets[userId]) {
      const isEphemeralMessage = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
      const payload = {
        content: "Вы уже сделали ставку на это событие. Изменить или вернуть ставку нельзя.",
        embeds: [],
        components: [
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setCustomId(`${BET_BUTTON_OPEN_PREFIX}${ev.id}`).setLabel("Назад к ставке").setStyle(ButtonStyle.Secondary),
          ),
        ],
      };
      if (interaction.message && isEphemeralMessage) await interaction.update(payload);
      else await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
      return true;
    }
    const opt = ev.options.find((o) => o.id === optionId);
    if (!opt) {
      await interaction.reply({ content: "Исход не найден.", flags: MessageFlags.Ephemeral });
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
          .setRequired(true),
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
    const locked = Boolean(ev.bets[userId]);
    const bet = ev.bets[userId];
    const opt = bet ? ev.options.find((o) => o.id === bet.optionId) : undefined;
    const userBet =
      bet && opt ? { optionLabel: opt.label, amount: bet.amount, potential: Math.floor(bet.amount * opt.odds) } : undefined;
    const embed = buildBetMenuEmbed(ev, u.rubles, userBet);
    const rows = buildBetMenuRows(ev, locked);
    const isEphemeralMessage = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
    const payload = { content: locked ? "Вы уже сделали ставку на это событие. Изменить или вернуть ставку нельзя." : undefined, embeds: [embed], components: rows };
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
    if (ev.bets[userId]) {
      await interaction.reply({ content: "Вы уже сделали ставку на это событие. Изменить или вернуть ставку нельзя.", flags: MessageFlags.Ephemeral });
      return true;
    }
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
    const potential = Math.floor(amount * opt.odds);
    const doneEmbed = new EmbedBuilder()
      .setColor(BET_COLOR)
      .setTitle("Ставка принята")
      .setDescription(
        [
          `Ставка: **${ev.title}**`,
          `Исход: **${opt.label}**`,
          `Коэффициент: **x${opt.odds.toLocaleString("ru-RU")}**`,
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
    const aRaw = interaction.fields.getTextInputValue("a").trim();
    const bRaw = interaction.fields.getTextInputValue("b").trim();
    const dRaw = interaction.fields.getTextInputValue("d").trim();
    const closeAtRaw = interaction.fields.getTextInputValue("closeAt").trim();
    const optA = parseOptionWithOdds(aRaw, "A");
    const optB = parseOptionWithOdds(bRaw, "B");
    const optD = parseOptionWithOdds(dRaw, "D");
    const closesAt = parseCloseAt(closeAtRaw, Date.now());
    if (!title || !optA || !optB || !optD || !closesAt) {
      await interaction.reply({
        content:
          "Некорректные поля.\n- Исходы: `Название | 1.8`\n- Закрытие (МСК): `08-05 18:30`",
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
      options: [optA, optD, optB],
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
    if (ev.bets[interaction.user.id]) {
      await interaction.reply({ content: "Вы уже сделали ставку на это событие. Изменить или вернуть ставку нельзя.", flags: MessageFlags.Ephemeral });
      return true;
    }
    const opt = ev.options.find((o) => o.id === optionId);
    if (!opt) {
      await interaction.reply({ content: "Исход не найден.", flags: MessageFlags.Ephemeral });
      return true;
    }

    const amountRaw = interaction.fields.getTextInputValue("amount").trim().replace(/\s+/g, "");
    if (!/^\d+$/.test(amountRaw)) {
      await interaction.reply({ content: "Сумма должна быть числом (только цифры).", flags: MessageFlags.Ephemeral });
      return true;
    }
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

    const row = new ActionRowBuilder<ButtonBuilder>();
    for (const opt of ev.options.slice(0, 3)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`${ADMIN_BET_CHOOSE_PREFIX}${ev.id}:${opt.id}`)
          .setLabel(`Победитель: ${opt.label}`)
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(!canAdminResolveOrCancel(ev)),
      );
    }
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`${ADMIN_BET_CANCEL_PREFIX}${ev.id}`)
        .setLabel("Отменить ставку")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(!canAdminResolveOrCancel(ev)),
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


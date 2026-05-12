import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelSelectMenuBuilder,
  ChannelType,
  EmbedBuilder,
  MessageFlags,
  ModalBuilder,
  PermissionsBitField,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ChannelSelectMenuInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { getGuildConfig, patchGuildConfig } from "../guildConfig/store.js";
import {
  getLegalIncomeTaxPercent,
  getSolePropWeeklyCapitalTaxPercent,
  getSolePropWithdrawFeePercent,
} from "../economy/taxTreasury.js";
import { NEURO_BUTTON_ADMIN_SETTINGS_ROOT, NEURO_MAIN_ADMIN } from "./adminHub.js";

const NEURO_SETTINGS_CHANNELS = "neuro:settings:channels";
const NEURO_SETTINGS_TAXES = "neuro:settings:taxes";
const NEURO_TAX_GENERAL = "neuro:tax:general";
const NEURO_TAX_IP = "neuro:tax:ip";
const NEURO_TAX_OPEN_LEGAL = "neuro:tax:open:legal";
const NEURO_TAX_OPEN_IP_WD = "neuro:tax:open:ipWd";
const NEURO_TAX_OPEN_IP_CAP = "neuro:tax:open:ipCap";

const MODAL_NEURO_LEGAL_TAX = "modal:neuro:legalTax";
const MODAL_NEURO_IP_WD = "modal:neuro:ipWithdrawFee";
const MODAL_NEURO_IP_CAP = "modal:neuro:ipWeeklyCapTax";

const NEURO_SELECT_WELCOME = "neuro:cfg:welcome";
const NEURO_SELECT_NEUROCONTROL = "neuro:cfg:neurocontrol";
const NEURO_SELECT_ECONOMY_TERMINAL = "neuro:cfg:economyTerminal";
const NEURO_SELECT_ECONOMY_FEED = "neuro:cfg:economyFeed";

const SETTINGS_COLOR = 0x0d47a1;

function canManage(interaction: ButtonInteraction | ChannelSelectMenuInteraction | ModalSubmitInteraction): boolean {
  return (
    interaction.inGuild() &&
    (interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) ||
      interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator))
  );
}

async function replyOrUpdateEphemeral(
  interaction: ButtonInteraction,
  payload: { content?: string; embeds?: EmbedBuilder[]; components?: any[] },
): Promise<void> {
  const isEphemeralMessage = Boolean(interaction.message?.flags?.has(MessageFlags.Ephemeral));
  if (interaction.message && isEphemeralMessage) {
    await interaction.update(payload);
    return;
  }
  await interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

function fmtChannel(id?: string): string {
  return id ? `<#${id}>` : "не задан";
}

function fmtTreasury(guildId: string): string {
  const t = getGuildConfig(guildId).treasuryRubles ?? 0;
  return Number.isInteger(t) ? t.toLocaleString("ru-RU") : t.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function buildSettingsRootEmbed(guildId: string): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setTitle("Настройки бота")
    .setDescription(
      [
        "**Каналы** — приветствия, панель нейроконтроля, терминал и лента экономики.",
        "**Налоги** — подоходный налог с легальных начислений, комиссия и налог ИП; казна страны.",
        "",
        `**Казна страны:** **${fmtTreasury(guildId)}** ₽`,
      ].join("\n"),
    );
}

function buildSettingsRootRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_SETTINGS_CHANNELS).setLabel("Каналы").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(NEURO_SETTINGS_TAXES).setLabel("Налоги").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_MAIN_ADMIN).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildChannelsSettingsEmbed(guildId: string): EmbedBuilder {
  const cfg = getGuildConfig(guildId);
  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setTitle("Каналы")
    .setDescription(
      [
        `Канал приветствий: ${fmtChannel(cfg.welcomeChannelId)}`,
        `Канал контроля (панель): ${fmtChannel(cfg.neuroControlChannelId)}`,
        `Канал экономики (терминал): ${fmtChannel(cfg.economyTerminalChannelId)}`,
        `Канал экономики (лента): ${fmtChannel(cfg.economyFeedChannelId)}`,
        "",
        "Выберите канал в списке ниже — сохранится сразу.",
      ].join("\n"),
    );
}

function buildChannelsSettingsRows(): ActionRowBuilder<ChannelSelectMenuBuilder>[] {
  return [
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(NEURO_SELECT_WELCOME)
        .setPlaceholder("Канал приветствий")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(NEURO_SELECT_NEUROCONTROL)
        .setPlaceholder("Канал контроля (панель)")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(NEURO_SELECT_ECONOMY_TERMINAL)
        .setPlaceholder("Канал терминала экономики")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1),
    ),
    new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
      new ChannelSelectMenuBuilder()
        .setCustomId(NEURO_SELECT_ECONOMY_FEED)
        .setPlaceholder("Канал ленты экономики")
        .setChannelTypes(ChannelType.GuildText)
        .setMinValues(1)
        .setMaxValues(1),
    ),
  ];
}

function buildTaxCategoriesEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setTitle("Налоги")
    .setDescription(
      [
        "**Общие** — подоходный налог со всех **легальных** начислений на личный счёт (смены, оклады офиса и ИП, бонусы офиса). Нелегал тир-3 не облагается.",
        "**ИП** — комиссия при выводе с баланса бизнеса на личный счёт и еженедельный налог с капитала бизнеса (**по понедельникам**).",
      ].join("\n\n"),
    );
}

function buildTaxCategoriesRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_TAX_GENERAL).setLabel("Общие").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(NEURO_TAX_IP).setLabel("ИП").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_BUTTON_ADMIN_SETTINGS_ROOT).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildGeneralTaxEmbed(guildId: string): EmbedBuilder {
  const p = getLegalIncomeTaxPercent(guildId);
  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setTitle("Общие налоги")
    .setDescription(
      [
        `**Подоходный налог (легальные работы):** **${p}** %`,
        "Удерживается с суммы, которая **зачисляется на личный счёт**: смены (кроме нелегала), **суточные** оклады офиса и ИП, кнопки «Связь» / «Совещание» у офиса.",
        "",
        `**Казна страны:** **${fmtTreasury(guildId)}** ₽ (пополняется налогами и комиссиями).`,
      ].join("\n\n"),
    );
}

function buildGeneralTaxRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_TAX_OPEN_LEGAL).setLabel("Изменить налог, %").setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_SETTINGS_TAXES).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

function buildIpTaxEmbed(guildId: string): EmbedBuilder {
  const wd = getSolePropWithdrawFeePercent(guildId);
  const cap = getSolePropWeeklyCapitalTaxPercent(guildId);
  return new EmbedBuilder()
    .setColor(SETTINGS_COLOR)
    .setTitle("ИП: комиссия и налог")
    .setDescription(
      [
        `**Комиссия вывода** (с бизнеса → на личный счёт): **${wd}** %`,
        "Удерживается с запрошенной суммы вывода; на балансе бизнеса списывается полная сумма, на счёт приходит сумма минус комиссия, комиссия — в казну.",
        "",
        `**Еженедельный налог с капитала бизнеса:** **${cap}** %`,
        "Списывается с баланса бизнеса ИП по **понедельникам** (начало календарного дня), в казну. Один раз за календарный понедельник.",
      ].join("\n\n"),
    );
}

function buildIpTaxRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_TAX_OPEN_IP_WD).setLabel("Комиссия").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(NEURO_TAX_OPEN_IP_CAP).setLabel("Налог").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_SETTINGS_TAXES).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function parsePercentInput(raw: string): number | undefined {
  const s = raw.trim().replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(s);
  if (!Number.isFinite(n)) return undefined;
  return Math.min(100, Math.max(0, Math.round(n * 100) / 100));
}

export async function handleNeuroSettingsTreeButton(interaction: ButtonInteraction): Promise<boolean> {
  const id = interaction.customId;
  const navIds = new Set([
    NEURO_BUTTON_ADMIN_SETTINGS_ROOT,
    NEURO_SETTINGS_CHANNELS,
    NEURO_SETTINGS_TAXES,
    NEURO_TAX_GENERAL,
    NEURO_TAX_IP,
    NEURO_TAX_OPEN_LEGAL,
    NEURO_TAX_OPEN_IP_WD,
    NEURO_TAX_OPEN_IP_CAP,
  ]);
  if (!navIds.has(id)) return false;

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canManage(interaction)) {
    await interaction.reply({ content: "Нужны права **Управление сервером**.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const gid = interaction.guildId;

  if (id === NEURO_BUTTON_ADMIN_SETTINGS_ROOT) {
    await replyOrUpdateEphemeral(interaction, {
      embeds: [buildSettingsRootEmbed(gid)],
      components: buildSettingsRootRows(),
    });
    return true;
  }

  if (id === NEURO_SETTINGS_CHANNELS) {
    await replyOrUpdateEphemeral(interaction, {
      embeds: [buildChannelsSettingsEmbed(gid)],
      components: [
        ...buildChannelsSettingsRows(),
        new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(NEURO_BUTTON_ADMIN_SETTINGS_ROOT).setLabel("Назад").setStyle(ButtonStyle.Secondary),
        ),
      ],
    });
    return true;
  }

  if (id === NEURO_SETTINGS_TAXES) {
    await replyOrUpdateEphemeral(interaction, {
      embeds: [buildTaxCategoriesEmbed()],
      components: buildTaxCategoriesRows(),
    });
    return true;
  }

  if (id === NEURO_TAX_GENERAL) {
    await replyOrUpdateEphemeral(interaction, {
      embeds: [buildGeneralTaxEmbed(gid)],
      components: buildGeneralTaxRows(),
    });
    return true;
  }

  if (id === NEURO_TAX_IP) {
    await replyOrUpdateEphemeral(interaction, {
      embeds: [buildIpTaxEmbed(gid)],
      components: buildIpTaxRows(),
    });
    return true;
  }

  if (id === NEURO_TAX_OPEN_LEGAL) {
    const modal = new ModalBuilder().setCustomId(MODAL_NEURO_LEGAL_TAX).setTitle("Подоходный налог, %");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("pct")
          .setLabel("Процент 0–100 (легальные доходы)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(8)
          .setValue(String(getLegalIncomeTaxPercent(gid))),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (id === NEURO_TAX_OPEN_IP_WD) {
    const modal = new ModalBuilder().setCustomId(MODAL_NEURO_IP_WD).setTitle("Комиссия вывода ИП, %");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("pct")
          .setLabel("Процент 0–100")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(8)
          .setValue(String(getSolePropWithdrawFeePercent(gid))),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  if (id === NEURO_TAX_OPEN_IP_CAP) {
    const modal = new ModalBuilder().setCustomId(MODAL_NEURO_IP_CAP).setTitle("Налог с капитала ИП, %");
    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId("pct")
          .setLabel("Процент в неделю (по пн), 0–100")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMaxLength(8)
          .setValue(String(getSolePropWeeklyCapitalTaxPercent(gid))),
      ),
    );
    await interaction.showModal(modal);
    return true;
  }

  return false;
}

export async function handleNeuroTaxModalSubmit(interaction: ModalSubmitInteraction): Promise<boolean> {
  const id = interaction.customId;
  if (id !== MODAL_NEURO_LEGAL_TAX && id !== MODAL_NEURO_IP_WD && id !== MODAL_NEURO_IP_CAP) return false;

  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canManage(interaction)) {
    await interaction.reply({ content: "Нужны права **Управление сервером**.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const pct = parsePercentInput(interaction.fields.getTextInputValue("pct"));
  if (pct == null) {
    await interaction.reply({ content: "Некорректное число. Пример: **10** или **12,5**.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const gid = interaction.guildId;
  if (id === MODAL_NEURO_LEGAL_TAX) {
    patchGuildConfig(gid, { legalIncomeTaxPercent: pct });
    await interaction.reply({
      embeds: [buildGeneralTaxEmbed(gid)],
      components: buildGeneralTaxRows(),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  if (id === MODAL_NEURO_IP_WD) {
    patchGuildConfig(gid, { solePropWithdrawFeePercent: pct });
    await interaction.reply({
      embeds: [buildIpTaxEmbed(gid)],
      components: buildIpTaxRows(),
      flags: MessageFlags.Ephemeral,
    });
    return true;
  }
  patchGuildConfig(gid, { solePropWeeklyCapitalTaxPercent: pct });
  await interaction.reply({
    embeds: [buildIpTaxEmbed(gid)],
    components: buildIpTaxRows(),
    flags: MessageFlags.Ephemeral,
  });
  return true;
}

/** Селекты каналов из экрана настроек (те же customId, что раньше в panel). */
export async function handleNeuroChannelsSelect(interaction: ChannelSelectMenuInteraction): Promise<boolean> {
  if (
    ![NEURO_SELECT_WELCOME, NEURO_SELECT_NEUROCONTROL, NEURO_SELECT_ECONOMY_TERMINAL, NEURO_SELECT_ECONOMY_FEED].includes(
      interaction.customId,
    )
  ) {
    return false;
  }
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Только на сервере.", flags: MessageFlags.Ephemeral });
    return true;
  }
  if (!canManage(interaction)) {
    await interaction.reply({ content: "Нужны права **Управление сервером**.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const picked = interaction.values[0];
  const ch = await interaction.guild?.channels.fetch(picked).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "Нужен текстовый канал.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const gid = interaction.guildId;
  if (interaction.customId === NEURO_SELECT_WELCOME) {
    patchGuildConfig(gid, { welcomeChannelId: picked });
  } else if (interaction.customId === NEURO_SELECT_NEUROCONTROL) {
    patchGuildConfig(gid, { neuroControlChannelId: picked });
  } else if (interaction.customId === NEURO_SELECT_ECONOMY_TERMINAL) {
    patchGuildConfig(gid, { economyTerminalChannelId: picked });
  } else {
    patchGuildConfig(gid, { economyFeedChannelId: picked });
  }

  await interaction.update({
    embeds: [buildChannelsSettingsEmbed(gid)],
    components: [
      ...buildChannelsSettingsRows(),
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId(NEURO_BUTTON_ADMIN_SETTINGS_ROOT).setLabel("Назад").setStyle(ButtonStyle.Secondary),
      ),
    ],
  });
  return true;
}

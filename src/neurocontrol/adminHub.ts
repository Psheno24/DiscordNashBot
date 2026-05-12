import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } from "discord.js";

/** Совпадает с `NEURO_ADMIN_BUTTON_CREATE_BET` в bets.ts — не переименовывать без синхронизации. */
export const NEURO_ADMIN_CREATE_BET_ID = "neuroAdmin:createBet";

export const NEURO_MAIN_ADMIN = "neuro:main:admin";
export const NEURO_MAIN_INFO = "neuro:main:info";
export const NEURO_ADMIN_ECON = "neuroAdmin:econ";

/** Корень «Настройки» (каналы / налоги). */
export const NEURO_BUTTON_ADMIN_SETTINGS_ROOT = "neuro:admin:settingsRoot";

const HUB_COLOR = 0x0d47a1;

export function buildNeuroMainPanelRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_MAIN_ADMIN).setLabel("Админ").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(NEURO_ADMIN_CREATE_BET_ID).setLabel("Добавить ставку").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(NEURO_MAIN_INFO).setLabel("Инфо").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildAdminHubEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(HUB_COLOR)
    .setTitle("Админ-панель")
    .setDescription(
      [
        "**Настройки** — каналы бота и налоги (казна страны).",
        "**Экономика** — список ставок и выдача ₽.",
        "",
        "Создать новую ставку — кнопка **«Добавить ставку»** на главной панели нейроконтроля.",
      ].join("\n"),
    );
}

export function buildAdminHubRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_BUTTON_ADMIN_SETTINGS_ROOT).setLabel("Настройки").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(NEURO_ADMIN_ECON).setLabel("Экономика").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

export function buildAdminEconEmbed(): EmbedBuilder {
  return new EmbedBuilder()
    .setColor(HUB_COLOR)
    .setTitle("Экономика (админ)")
    .setDescription("Управление ставками и выдача рублей. **Назад** — в админ-хаб.");
}

/** Ставки / выдача ₽ + возврат в хаб. */
export function buildAdminEconRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("neuroAdmin:bets").setLabel("Ставки").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("neuroAdmin:grantRub").setLabel("Выдать ₽").setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(NEURO_MAIN_ADMIN).setLabel("Назад").setStyle(ButtonStyle.Secondary),
    ),
  ];
}

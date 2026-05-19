import {
  type ChatInputCommandInteraction,
  PermissionFlagsBits,
  SlashCommandBuilder,
} from "discord.js";
import { grantTelegramHubAccess, isTelegramHubGranted } from "./bridgeStore.js";
import { isTelegramBridgeConfigured } from "./env.js";

export const grantTelegramHubCommandName = "grant-telegram";

export const grantTelegramHubCommand = new SlashCommandBuilder()
  .setName(grantTelegramHubCommandName)
  .setDescription("Выдать игроку кнопку привязки Telegram в профиле (только владелец сервера)")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((o) => o.setName("member").setDescription("Кому выдать").setRequired(true));

async function isGuildOwner(interaction: ChatInputCommandInteraction): Promise<boolean> {
  if (!interaction.inGuild() || !interaction.guildId) return false;
  const g =
    interaction.guild ?? (await interaction.client.guilds.fetch(interaction.guildId).catch(() => null));
  return Boolean(g && g.ownerId === interaction.user.id);
}

export async function handleGrantTelegramHubCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.guildId) {
    await interaction.reply({ content: "Команда только на сервере.", ephemeral: true });
    return;
  }
  if (!(await isGuildOwner(interaction))) {
    await interaction.reply({
      content: "Эту команду может использовать только **владелец сервера**.",
      ephemeral: true,
    });
    return;
  }
  if (!isTelegramBridgeConfigured()) {
    await interaction.reply({
      content: "Telegram для бота не настроен (`TELEGRAM_BOT_TOKEN` в `.env`).",
      ephemeral: true,
    });
    return;
  }

  const target = interaction.options.getUser("member", true);
  if (target.bot) {
    await interaction.reply({ content: "Ботам привязка Telegram не выдаётся.", ephemeral: true });
    return;
  }

  const guildId = interaction.guildId;
  if (target.id === interaction.guild!.ownerId) {
    await interaction.reply({
      content: "У владельца сервера эта кнопка уже есть в профиле.",
      ephemeral: true,
    });
    return;
  }

  if (isTelegramHubGranted(guildId, target.id)) {
    await interaction.reply({
      content: `${target} уже имеет кнопку **«Telegram: код привязки»** в профиле терминала.`,
      ephemeral: true,
    });
    return;
  }

  grantTelegramHubAccess(guildId, target.id);
  await interaction.reply({
    content: `${target} получил кнопку **«Telegram: код привязки»** в **Профиль** терминала (как у владельца).`,
    ephemeral: true,
  });
}

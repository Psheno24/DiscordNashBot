import {
  type ChatInputCommandInteraction,
  type Client,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} from "discord.js";
import { discordToken } from "./config.js";
import { randomJoinCopy, randomLeaveCopy } from "./copy/ussrMemberActivity.js";
import { embedInfo, embedWarn } from "./theme.js";

/** Имя слэш-команды (латиница, требование Discord). */
export const welcomePreviewCommandName = "welcome-preview";
export const leavePreviewCommandName = "leave-preview";
export const giveMoneyCommandName = "givemoney";
export const takeMoneyCommandName = "takemoney";

const welcomeCommand = new SlashCommandBuilder()
  .setName(welcomePreviewCommandName)
  .setDescription("Случайное приветствие учёта (как при вступлении на сервер)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((opt) =>
    opt
      .setName("member")
      .setDescription("Чей ник подставить в текст (по умолчанию — вы)")
      .setRequired(false),
  );

const leaveCommand = new SlashCommandBuilder()
  .setName(leavePreviewCommandName)
  .setDescription("Случайное сообщение о выбытии (как при уходе с сервера)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((opt) =>
    opt
      .setName("member")
      .setDescription("Чей ник подставить в текст (по умолчанию — вы)")
      .setRequired(false),
  );

const giveMoneyCommand = new SlashCommandBuilder()
  .setName(giveMoneyCommandName)
  .setDescription("Выдать ₽ из казны (только владелец сервера)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((o) => o.setName("member").setDescription("Кому").setRequired(true))
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Сумма ₽").setRequired(true).setMinValue(1),
  );

const takeMoneyCommand = new SlashCommandBuilder()
  .setName(takeMoneyCommandName)
  .setDescription("Забрать ₽ (только владелец сервера)")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
  .addUserOption((o) => o.setName("member").setDescription("У кого").setRequired(true))
  .addIntegerOption((o) =>
    o.setName("amount").setDescription("Сумма ₽").setRequired(true).setMinValue(1),
  )
  .addBooleanOption((o) =>
    o
      .setName("to_treasury")
      .setDescription("Зачислить в казну (Нет = только изъять с баланса)")
      .setRequired(false),
  );

export async function registerMemberActivityPreviewCommands(client: Client) {
  const appId = client.user?.id;
  if (!appId) return;

  const rest = new REST({ version: "10" }).setToken(discordToken());
  const body = [
    welcomeCommand.toJSON(),
    leaveCommand.toJSON(),
    giveMoneyCommand.toJSON(),
    takeMoneyCommand.toJSON(),
  ];

  for (const guild of client.guilds.cache.values()) {
    try {
      await rest.put(Routes.applicationGuildCommands(appId, guild.id), { body });
    } catch (e) {
      console.warn("ИИ Управление: не удалось зарегистрировать превью учёта на гильдии", guild.id, e);
    }
  }
}

export async function handleWelcomePreviewCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Команда только на сервере.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("member") ?? interaction.user;
  const { title, description } = randomJoinCopy(target.tag, guild.name);

  await interaction.reply({
    content: target.id === interaction.user.id ? `${interaction.user}` : `${target}`,
    embeds: [embedInfo(title, description)],
    allowedMentions: { users: [target.id] },
  });
}

export async function handleLeavePreviewCommand(interaction: ChatInputCommandInteraction) {
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Команда только на сервере.", ephemeral: true });
    return;
  }

  const target = interaction.options.getUser("member") ?? interaction.user;
  const { title, description } = randomLeaveCopy(target.tag, guild.name);

  await interaction.reply({
    content: target.id === interaction.user.id ? `${interaction.user}` : `${target}`,
    embeds: [embedWarn(title, description)],
    allowedMentions: { users: [target.id] },
  });
}
